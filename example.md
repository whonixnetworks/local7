# local7 Examples & Token Reduction Proof

Real test results from `benchmark.mjs` run on 2026-04-17. All measurements are live output from local7's TOON serialization vs raw JSON.

---

## Token Reduction Proof

### Overall Results

| Metric | JSON | TOON | Reduction |
|--------|------|------|-----------|
| Total Characters | 16,109 | 10,659 | **33.8%** |
| Estimated Tokens | 5,103 | 3,228 | **36.7%** |
| Tokens Saved | - | - | **1,875** |

### Per-Use-Case Breakdown

| Use Case | JSON chars | TOON chars | Char % Saved | JSON tokens | TOON tokens | Token % Saved |
|----------|-----------|-----------|-------------|------------|------------|--------------|
| User Preferences (small) | 204 | 177 | 13.2% | 64 | 54 | 15.6% |
| API Documentation (large) | 2,232 | 1,745 | 21.8% | 715 | 536 | 25.0% |
| Project Knowledge Base (nested) | 1,076 | 1,061 | 1.4% | 345 | 325 | 5.8% |
| Search Results Cache (array) | 1,863 | 1,563 | 16.1% | 566 | 461 | 18.6% |
| Web Page Content (text-heavy) | 1,619 | 1,479 | 8.6% | 509 | 459 | 9.8% |
| Configuration Data (mixed) | 712 | 705 | 1.0% | 227 | 217 | 4.4% |
| **Large Tabular Data (50 users)** | **7,856** | **3,420** | **56.5%** | **2,510** | **1,024** | **59.2%** |
| Env Variables Template | 547 | 509 | 6.9% | 167 | 152 | 9.0% |

> **Tabular data shows the strongest gains**: 59.2% token reduction for arrays of uniform objects.

---

## Real Format Comparisons

### Example 1: User Preferences

**JSON** (204 chars, ~64 tokens):
```json
{"location":"Sydney, Australia","stack":"Node.js","language_preference":"TypeScript","editor":"VS Code","theme":"dark","indent_size":2,"package_manager":"pnpm","framework":"Next.js","deployment":"Vercel"}
```

**TOON** (177 chars, ~54 tokens):
```toon
location: Sydney, Australia
stack: Node.js
language_preference: TypeScript
editor: VS Code
theme: dark
indent_size: 2
package_manager: pnpm
framework: Next.js
deployment: Vercel
```

**Savings: 15.6% fewer tokens.** Keys aren't quoted, no braces or commas needed.

---

### Example 2: API Documentation (Tabular Array)

**JSON** (2,232 chars, ~715 tokens):
```json
{"endpoint":"/api/v1/chat/completions","method":"POST","description":"Creates a model response...","parameters":[{"name":"model","type":"string","required":true,"description":"ID of the model to use"},{"name":"messages","type":"array","required":true,"description":"List of messages..."},{"name":"temperature","type":"number","required":false,"description":"Sampling temperature..."}]}
```

**TOON** (1,745 chars, ~536 tokens):
```toon
endpoint: /api/v1/chat/completions
method: POST
description: Creates a model response for the given chat conversation.
parameters[8	]{name	type	required	description}:
  model	string	true	ID of the model to use
  messages	array	true	List of messages in the conversation
  temperature	number	false	Sampling temperature between 0 and 2
  max_tokens	integer	false	Maximum number of tokens to generate
  top_p	number	false	Nucleus sampling parameter
  stream	boolean	false	Whether to stream back partial progress
  stop	array	false	Up to 4 sequences where the API will stop
  frequency_penalty	number	false	Penalize new tokens based on frequency
```

**Savings: 25.0% fewer tokens.** Column headers declared once, rows are just values.

---

### Example 3: Large Tabular Data (50 Users) — Best Case

**JSON** (7,856 chars, ~2,510 tokens):
```json
{"total":50,"users":[{"id":1,"username":"user_1","email":"user1@example.com","role":"admin","department":"engineering","active":false,"login_count":550,"last_login":"2026-04-17"},{"id":2,"username":"user_2","email":"user2@example.com","role":"editor","department":"marketing","active":true,"login_count":316,"last_login":"2026-04-13"},{"id":3,"username":"user_3","email":"user3@example.com","role":"viewer","department":"sales","active":true,"login_count":285,"last_login":"2026-04-02"} ... ]}
```

**TOON** (3,420 chars, ~1,024 tokens):
```toon
total: 50
users[50	]{id	username	email	role	department	active	login_count	last_login}:
  1	user_1	user1@example.com	admin	engineering	false	550	2026-04-17
  2	user_2	user2@example.com	editor	marketing	true	316	2026-04-13
  3	user_3	user3@example.com	viewer	sales	true	285	2026-04-02
  4	user_4	user4@example.com	admin	design	true	228	2026-04-08
  5	user_5	user5@example.com	editor	support	true	26	2026-04-02
  ...
```

**Savings: 59.2% fewer tokens (1,486 tokens saved).** The header row is declared once, every data row is just tab-separated values. This is where TOON's tabular encoding dominates.

---

## Real Tool Usage Examples (from MCP Tests)

### Store + Retrieve

```
→ local7_store(key="dev_profile_test", type="preference", tags=["personal","dev"],
    data={"location":"Sydney, Australia","stack":"Node.js","language_preference":"TypeScript",
          "editor":"VS Code","theme":"dark","indent_size":2})
  ✓ Stored: key=dev_profile_test type=preference expires=never

→ local7_retrieve(key="dev_profile_test")
  ✓ Returned as TOON format
```

### Upsert (Update Existing Key)

```
→ local7_store(key="dev_profile_test", data={...same + new_field:"updated via upsert"})
  ✓ Stored: key=dev_profile_test type=preference expires=never  (updated in place)

→ local7_retrieve(key="dev_profile_test")
  ✓ Includes new_field: "updated via upsert"
```

### Full-Text Search

```
→ local7_search(query="TypeScript preference")
  ✓ Found 1 results:
    [preference] dev_profile_test — snippet highlighting "language_preference": "TypeScript"

→ local7_search(query="ollama API endpoints", type="api_doc")
  ✓ Found 1 results:
    [api_doc] ollama_api_docs — filtered by type
```

### List with Filters

```
→ local7_list()
  ✓ 3 documents listed with key, type, tags, title

→ local7_list(type="preference")
  ✓ Filters to preference type only
```

### TTL + Delete + Cleanup

```
→ local7_store(key="temp_search", type="search_result", expiresInSeconds=2,
    data={"query":"React Server Components"})
  ✓ Stored with expiry

→ local7_delete(key="temp_search")
  ✓ Deleted: temp_search

→ local7_cleanup()
  ✓ Cleaned up 0 expired documents
```

### Web Ingestion

```
→ local7_ingest(url="https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md",
    key="ollama_raw_api", type="api_doc", tags=["ollama","api","reference"])
  ✓ Ingested: 53,687 chars of API documentation
  ✓ Available via local7_retrieve(key="ollama_raw_api")
```

---

## Model Compatibility Test (deepseek-chat)

Tested via OpenRouter API with tool-calling. **deepseek/deepseek-chat: 5/5 passed.**

| Test | Tool Called | Result |
|------|-----------|--------|
| Store user preferences | `local7_store` | PASS |
| Store with TTL | `local7_store` | PASS |
| Search across all data | `local7_search` | PASS |
| List preferences only | `local7_list` | PASS |
| Delete temp data | `local7_delete` | PASS |

All tool calls produced correct arguments (key, type, tags, data, expiresInSeconds) and executed successfully via the CLI.

---

## How to Reproduce

```bash
git clone https://github.com/whonixnetworks/local7.git
cd local7
npm install && npm run build

# Run the benchmark
node benchmark.mjs

# Run model tests (requires OPENROUTER_API_KEY)
OPENROUTER_API_KEY=your_key node test-models.mjs
```
