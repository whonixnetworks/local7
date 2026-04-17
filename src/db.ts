import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

let db: Database.Database | null = null;
const DEFAULT_DB_PATH = join(process.env.HOME || '/tmp', '.local7', 'data.db');

export function getDb(dbPath?: string): Database.Database {
  if (db) return db;
  const path = dbPath || process.env.LOCAL7_DB || DEFAULT_DB_PATH;
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_toon TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      source_url TEXT,
      type TEXT NOT NULL DEFAULT 'raw',
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_key ON documents(key);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_documents_expires ON documents(expires_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title,
      content_text,
      tags,
      content='documents',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, title, content_text, tags)
        VALUES (new.rowid, new.title, new.content_text, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, content_text, tags)
        VALUES ('delete', old.rowid, old.title, old.content_text, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, content_text, tags)
        VALUES ('delete', old.rowid, old.title, old.content_text, old.tags);
      INSERT INTO documents_fts(rowid, title, content_text, tags)
        VALUES (new.rowid, new.title, new.content_text, new.tags);
    END;
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
