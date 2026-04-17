export type DocType = 'preference' | 'api_doc' | 'web_page' | 'note' | 'search_result' | 'raw';

export interface Document {
  id: string;
  key: string | null;
  title: string;
  content_json: string;
  content_toon: string;
  content_text: string;
  source_url: string | null;
  type: DocType;
  tags: string;
  metadata: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreInput {
  key?: string;
  data: unknown;
  title?: string;
  type?: DocType;
  tags?: string[];
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  expiresInSeconds?: number;
}

export interface SearchResult {
  id: string;
  key: string | null;
  title: string;
  type: DocType;
  snippet: string;
  rank: number;
}

export interface ListResult {
  id: string;
  key: string | null;
  title: string;
  type: DocType;
  tags: string[];
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}
