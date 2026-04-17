import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import { jsonToToon, extractText } from './toon.js';
import type { Document, StoreInput, SearchResult, ListResult, DocType } from './types.js';

export function store(input: StoreInput): Document {
  const db = getDb();
  const id = uuid();
  const key = input.key || null;
  const title = input.title || (key ? key : 'untitled');
  const type = input.type || 'raw';
  const tags = JSON.stringify(input.tags || []);
  const metadata = JSON.stringify(input.metadata || {});
  const sourceUrl = input.sourceUrl || null;
  const contentJson = JSON.stringify(input.data);
  const contentToon = jsonToToon(input.data);
  const contentText = extractText(input.data);
  const expiresAt = input.expiresInSeconds
    ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
    : null;

  if (key) {
    const existing = db.prepare('SELECT id FROM documents WHERE key = ?').get(key) as { id: string } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE documents SET
          title = ?, content_json = ?, content_toon = ?, content_text = ?,
          source_url = ?, type = ?, tags = ?, metadata = ?,
          expires_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(title, contentJson, contentToon, contentText, sourceUrl, type, tags, metadata, expiresAt, existing.id);
      const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(existing.id) as Document;
      return updated;
    }
  }

  db.prepare(`
    INSERT INTO documents (id, key, title, content_json, content_toon, content_text, source_url, type, tags, metadata, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, key, title, contentJson, contentToon, contentText, sourceUrl, type, tags, metadata, expiresAt);

  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document;
}

export function retrieveByKey(key: string): Document | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM documents WHERE key = ?').get(key) as Document) || null;
}

export function retrieveById(id: string): Document | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document) || null;
}

export function retrieve(keyOrId: string): Document | null {
  return retrieveByKey(keyOrId) || retrieveById(keyOrId);
}

export function search(query: string, limit: number = 10, type?: DocType, tags?: string[]): SearchResult[] {
  const db = getDb();
  let sql = `
    SELECT d.id, d.key, d.title, d.type, snippet(documents_fts, 1, '>>>', '<<<', '...', 32) as snippet, rank
    FROM documents_fts f
    JOIN documents d ON d.rowid = f.rowid
    WHERE documents_fts MATCH ?
  `;
  const params: unknown[] = [query];

  if (type) {
    sql += ' AND d.type = ?';
    params.push(type);
  }
  if (tags && tags.length > 0) {
    sql += ` AND (${tags.map(() => 'd.tags LIKE ?').join(' OR ')})`;
    tags.forEach(t => params.push(`%"${t}"%`));
  }

  sql += ' ORDER BY rank LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params) as SearchResult[];
}

export function list(type?: DocType, tags?: string[]): ListResult[] {
  const db = getDb();
  let sql = 'SELECT id, key, title, type, tags, created_at, updated_at, expires_at FROM documents WHERE 1=1';
  const params: unknown[] = [];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (tags && tags.length > 0) {
    sql += ` AND (${tags.map(() => 'tags LIKE ?').join(' OR ')})`;
    tags.forEach(t => params.push(`%"${t}"%`));
  }

  sql += ' ORDER BY updated_at DESC';

  const rows = db.prepare(sql).all(...params) as (Omit<ListResult, 'tags'> & { tags: string })[];
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags) }));
}

export function remove(keyOrId: string): boolean {
  const db = getDb();
  const byKey = db.prepare('DELETE FROM documents WHERE key = ?').run(keyOrId);
  if (byKey.changes > 0) return true;
  const byId = db.prepare('DELETE FROM documents WHERE id = ?').run(keyOrId);
  return byId.changes > 0;
}

export function cleanup(): number {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM documents WHERE expires_at IS NOT NULL AND expires_at < datetime('now')"
  ).run();
  return result.changes;
}
