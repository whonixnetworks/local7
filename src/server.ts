#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { store, retrieve, search, list, remove, cleanup } from './store.js';
import { ingestUrl } from './ingest.js';
import { getDb, closeDb } from './db.js';
import { jsonToToon } from './toon.js';
import type { DocType } from './types.js';

const server = new McpServer({
  name: 'local7',
  version: '1.1.0',
});

server.tool(
  'local7_store',
  `Store arbitrary data in local7 for later retrieval. Data is serialized as TOON for minimal token usage when read back by an LLM. If a key is provided and already exists, the data is UPDATED (no history kept). Use meaningful keys like "user_profile", "ollama_api_docs", etc. Tags help with categorization. Use expiresInSeconds for temporary data (e.g., cached web searches).`,
  {
    key: z.string().optional().describe('Unique key for direct lookup (e.g., "user_profile", "ollama_api"). If exists, updates in place.'),
    data: z.any().describe('The data to store. Can be any JSON-serializable value (objects, arrays, strings, etc).'),
    title: z.string().optional().describe('Human-readable title. Defaults to key name.'),
    type: z.enum(['preference', 'api_doc', 'web_page', 'note', 'search_result', 'raw']).optional().describe('Document type for categorization.'),
    tags: z.array(z.string()).optional().describe('Tags for filtering and search.'),
    expiresInSeconds: z.number().optional().describe('TTL in seconds. Data auto-deletes after this time.'),
  },
  async (args) => {
    const doc = store({
      key: args.key,
      data: args.data,
      title: args.title,
      type: args.type as DocType | undefined,
      tags: args.tags,
      expiresInSeconds: args.expiresInSeconds,
    });
    return {
      content: [{
        type: 'text' as const,
        text: `Stored: key=${doc.key || doc.id} type=${doc.type} expires=${doc.expires_at || 'never'}`,
      }],
    };
  }
);

server.tool(
  'local7_retrieve',
  `Retrieve stored data by key or id. Returns data in TOON format for minimal token usage. If you need JSON, pass format="json".`,
  {
    key: z.string().describe('The key or id to retrieve.'),
    format: z.enum(['toon', 'json']).optional().default('toon').describe('Output format. TOON uses ~40% fewer tokens.'),
  },
  async (args) => {
    const doc = retrieve(args.key);
    if (!doc) {
      return { content: [{ type: 'text' as const, text: `Not found: ${args.key}` }] };
    }
    const content = args.format === 'json' ? doc.content_json : doc.content_toon;
    return {
      content: [{
        type: 'text' as const,
        text: args.format === 'json' ? content : `\`\`\`toon\n${content}\n\`\`\``,
      }],
    };
  }
);

server.tool(
  'local7_search',
  `Full-text search across all stored documents. Returns matching documents with snippets. Use this to find relevant data when you don't know the exact key.`,
  {
    query: z.string().describe('Search query. Supports FTS5 syntax.'),
    limit: z.number().optional().default(5).describe('Max results to return.'),
    type: z.enum(['preference', 'api_doc', 'web_page', 'note', 'search_result', 'raw']).optional().describe('Filter by document type.'),
    tags: z.array(z.string()).optional().describe('Filter by tags (matches any).'),
  },
  async (args) => {
    const results = search(args.query, args.limit, args.type as DocType | undefined, args.tags);
    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No results found.' }] };
    }
    const lines = results.map((r, i) =>
      `${i + 1}. [${r.type}] ${r.title} (key: ${r.key || r.id})\n   ${r.snippet}`
    );
    return {
      content: [{
        type: 'text' as const,
        text: `Found ${results.length} results:\n\n${lines.join('\n\n')}\n\nUse local7_retrieve with the key to get full data.`,
      }],
    };
  }
);

server.tool(
  'local7_ingest',
  `Fetch a web page, extract its main content (stripping navigation, ads, boilerplate), and store it efficiently. Ideal for API documentation, blog posts, and reference material. Returns a summary of what was stored.`,
  {
    url: z.string().describe('URL to fetch and ingest.'),
    key: z.string().optional().describe('Storage key. Defaults to domain-based key.'),
    type: z.enum(['api_doc', 'web_page', 'note', 'search_result', 'raw']).optional().default('web_page').describe('Document type.'),
    tags: z.array(z.string()).optional().describe('Tags for the ingested content.'),
    expiresInSeconds: z.number().optional().describe('TTL for the ingested data.'),
  },
  async (args) => {
    const result = await ingestUrl(args.url);
    const parsed = JSON.parse(result.content);
    const docKey = args.key || new URL(args.url).hostname.replace(/\./g, '_') + '_' + Date.now();

    const doc = store({
      key: docKey,
      data: parsed,
      title: result.title,
      type: args.type as DocType,
      tags: args.tags,
      sourceUrl: args.url,
      expiresInSeconds: args.expiresInSeconds,
    });

    const preview = result.textContent.slice(0, 500);
    return {
      content: [{
        type: 'text' as const,
        text: `Ingested: "${result.title}"\nSource: ${args.url}\nKey: ${docKey}\nLength: ${result.textContent.length} chars\n\nPreview:\n${preview}${result.textContent.length > 500 ? '...' : ''}\n\nUse local7_retrieve with key "${docKey}" for full content.`,
      }],
    };
  }
);

server.tool(
  'local7_list',
  `List stored documents. Filter by type or tags. Shows key, title, type, and timestamps.`,
  {
    type: z.enum(['preference', 'api_doc', 'web_page', 'note', 'search_result', 'raw']).optional().describe('Filter by type.'),
    tags: z.array(z.string()).optional().describe('Filter by tags.'),
  },
  async (args) => {
    const results = list(args.type as DocType | undefined, args.tags);
    if (results.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No documents found.' }] };
    }
    const lines = results.map((r, i) => {
      const tags = r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : '';
      const expires = r.expires_at ? ` expires:${r.expires_at}` : '';
      return `${i + 1}. ${r.key || r.id} | ${r.type}${tags} | "${r.title}"${expires}`;
    });
    return {
      content: [{
        type: 'text' as const,
        text: `${results.length} documents:\n${lines.join('\n')}`,
      }],
    };
  }
);

server.tool(
  'local7_delete',
  `Delete a stored document by key or id.`,
  {
    key: z.string().describe('Key or id to delete.'),
  },
  async (args) => {
    const deleted = remove(args.key);
    return {
      content: [{
        type: 'text' as const,
        text: deleted ? `Deleted: ${args.key}` : `Not found: ${args.key}`,
      }],
    };
  }
);

server.tool(
  'local7_cleanup',
  `Remove all expired documents. Run periodically to free space.`,
  {},
  async () => {
    const count = cleanup();
    return {
      content: [{
        type: 'text' as const,
        text: `Cleaned up ${count} expired documents.`,
      }],
    };
  }
);

async function main() {
  getDb();
  cleanup();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Local7 MCP server error:', err);
  process.exit(1);
});
