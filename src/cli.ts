#!/usr/bin/env node
import { store, retrieve, search, list, remove, cleanup } from './store.js';
import { ingestUrl } from './ingest.js';
import { getDb, closeDb } from './db.js';
import type { DocType } from './types.js';

const args = process.argv.slice(2);
const command = args[0];

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve(data);
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  getDb();

  try {
    switch (command) {
      case 'store': {
        const keyIdx = args.indexOf('--key');
        const typeIdx = args.indexOf('--type');
        const tagsIdx = args.indexOf('--tags');
        const titleIdx = args.indexOf('--title');
        const ttlIdx = args.indexOf('--ttl');

        const key = keyIdx >= 0 ? args[keyIdx + 1] : undefined;
        const type = typeIdx >= 0 ? args[typeIdx + 1] as DocType : undefined;
        const tags = tagsIdx >= 0 ? args[tagsIdx + 1]?.split(',').filter(Boolean) : undefined;
        const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
        const ttl = ttlIdx >= 0 ? parseInt(args[ttlIdx + 1], 10) : undefined;

        let dataStr = args.find((a, i) => i > 0 && !a.startsWith('--') && args[i - 1]?.startsWith('--') === false && !['--key', '--type', '--tags', '--title', '--ttl'].includes(args[i - 1]));

        if (!dataStr) {
          const stdin = await readStdin();
          if (stdin) dataStr = stdin.trim();
        }

        if (!dataStr) {
          console.error('Usage: local7 store --key <key> [--type <type>] [--tags t1,t2] [--title <title>] [--ttl <seconds>] [json-data | stdin]');
          process.exit(1);
        }

        let data: unknown;
        try {
          data = JSON.parse(dataStr);
        } catch {
          data = dataStr;
        }

        const doc = store({ key, data, title, type, tags, expiresInSeconds: ttl });
        console.log(`Stored: key=${doc.key || doc.id} type=${doc.type}`);
        break;
      }

      case 'get':
      case 'retrieve': {
        const key = args[1];
        const fmt = args.includes('--json') ? 'json' : 'toon';
        if (!key) {
          console.error('Usage: local7 get <key-or-id> [--json]');
          process.exit(1);
        }
        const doc = retrieve(key);
        if (!doc) {
          console.error(`Not found: ${key}`);
          process.exit(1);
        }
        console.log(fmt === 'json' ? doc.content_json : doc.content_toon);
        break;
      }

      case 'search': {
        const query = args[1];
        const limitIdx = args.indexOf('--limit');
        const typeIdx = args.indexOf('--type');
        if (!query) {
          console.error('Usage: local7 search <query> [--limit N] [--type <type>]');
          process.exit(1);
        }
        const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10;
        const type = typeIdx >= 0 ? args[typeIdx + 1] as DocType : undefined;
        const results = search(query, limit, type);
        if (results.length === 0) {
          console.log('No results.');
          break;
        }
        results.forEach((r, i) => {
          console.log(`${i + 1}. [${r.type}] ${r.title} (key: ${r.key || r.id})`);
          console.log(`   ${r.snippet.replace(/>>>/g, '**').replace(/< <</g, '**')}`);
        });
        break;
      }

      case 'ingest': {
        const url = args[1];
        const keyIdx = args.indexOf('--key');
        const typeIdx = args.indexOf('--type');
        const tagsIdx = args.indexOf('--tags');
        const ttlIdx = args.indexOf('--ttl');

        if (!url) {
          console.error('Usage: local7 ingest <url> [--key <key>] [--type <type>] [--tags t1,t2] [--ttl <seconds>]');
          process.exit(1);
        }

        const key = keyIdx >= 0 ? args[keyIdx + 1] : undefined;
        const type = typeIdx >= 0 ? args[typeIdx + 1] as DocType : 'web_page';
        const tags = tagsIdx >= 0 ? args[tagsIdx + 1]?.split(',').filter(Boolean) : undefined;
        const ttl = ttlIdx >= 0 ? parseInt(args[ttlIdx + 1], 10) : undefined;

        console.log(`Ingesting: ${url}...`);
        const result = await ingestUrl(url);
        const parsed = JSON.parse(result.content);
        const docKey = key || new URL(url).hostname.replace(/\./g, '_') + '_' + Date.now();

        const doc = store({
          key: docKey,
          data: parsed,
          title: result.title,
          type: type || 'web_page',
          tags,
          sourceUrl: url,
          expiresInSeconds: ttl,
        });

        console.log(`Ingested: "${result.title}"`);
        console.log(`Key: ${docKey}`);
        console.log(`Length: ${result.textContent.length} chars`);
        break;
      }

      case 'list': {
        const typeIdx = args.indexOf('--type');
        const tagsIdx = args.indexOf('--tags');
        const type = typeIdx >= 0 ? args[typeIdx + 1] as DocType : undefined;
        const tags = tagsIdx >= 0 ? args[tagsIdx + 1]?.split(',').filter(Boolean) : undefined;

        const results = list(type, tags);
        if (results.length === 0) {
          console.log('No documents.');
          break;
        }
        results.forEach((r, i) => {
          const tagStr = r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : '';
          console.log(`${i + 1}. ${r.key || r.id} | ${r.type}${tagStr} | "${r.title}"`);
        });
        break;
      }

      case 'delete':
      case 'rm': {
        const key = args[1];
        if (!key) {
          console.error('Usage: local7 delete <key-or-id>');
          process.exit(1);
        }
        const deleted = remove(key);
        console.log(deleted ? `Deleted: ${key}` : `Not found: ${key}`);
        break;
      }

      case 'cleanup': {
        const count = cleanup();
        console.log(`Cleaned up ${count} expired documents.`);
        break;
      }

      default:
        console.log(`Local7 - Token-efficient local context storage

Usage:
  local7 store --key <key> [--type <type>] [--tags t1,t2] [--title <title>] [--ttl <sec>] [json-data]
  local7 get <key-or-id> [--json]
  local7 search <query> [--limit N] [--type <type>]
  local7 ingest <url> [--key <key>] [--type <type>] [--tags t1,t2] [--ttl <sec>]
  local7 list [--type <type>] [--tags t1,t2]
  local7 delete <key-or-id>
  local7 cleanup

Types: preference, api_doc, web_page, note, search_result, raw

Examples:
  echo '{"age":50,"gender":"male"}' | local7 store --key user_profile --type preference
  local7 get user_profile
  local7 search "Australia"
  local7 ingest https://api.example.com/docs --type api_doc`);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
