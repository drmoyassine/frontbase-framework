# System Services — Cache · Queue · Vector · Embedding

The runtime layer behind the Edge Resources tabs. One resolution chain per
tenant, **dual-wired**:

```
adopted is_default registry row  >  FRONTBASE_* env JSON  >  floor
```

- **Registry half** — what the console manages: connect a provider, see the
  card, flip the edit-dialog **"Set as default"** Switch (the Default badge).
  First resource of a kind auto-defaults; switching unsets the previous
  default; deleting the default promotes the next row by creation order.
- **Env half** — the deploy-time floor the product also uses
  (`FRONTBASE_CACHE` / `_QUEUE` / `_VECTOR` / `_EMBEDDING` JSON), parsed
  host-side (Workers have no `process.env`) and injected as data.

**Adopted beats env**: a tenant that adopts a registry row stops using the
shared env wiring for that kind. Both hosts (cf-full worker, Node/Docker
self-host) parse and pass the same vars.

Consumers today: the enrich/datasource TTL caches (cache), automations
execution dispatch + RAG indexing (queue), the RAG pipeline (vector +
embedding). Nothing else changes behavior when these are unset — every
consumer degrades deliberately:

| Kind | Floor when nothing resolves |
|---|---|
| Cache | in-process `memoryCache()` (per tenant) |
| Queue | direct/in-process execution (no queue, no job) |
| Vector / RAG | "not configured" (503 on RAG routes; nothing crashes) |

An adapter failure degrades, never throws: a broken cache endpoint serves the
per-tenant memory fallback for a cooldown window, then retries; a failed queue
publish runs the work inline.

---

## Env reference

Set via runtime env (`wrangler secret put` / container env / `.dev.vars` —
never `wrangler.toml`, never git). All values are **JSON objects**; snake_case
and camelCase aliases are both accepted where shown. Invalid JSON warns once
and degrades to "unset" — a malformed secret never crashes the worker.

### `FRONTBASE_CACHE`

```json
{"provider":"upstash","url":"https://your-db.upstash.io","token":"..."}
```

- `upstash` — REST protocol (`POST url` with a command pipeline, Bearer token).
  Works everywhere (CF Worker + Node), no TCP.
- `redis` — TCP via ioredis, `url` like `redis://...`. **Node only** (the
  optional dep is absent/stubbed on Workers; the resolver degrades to memory
  with a log line).
- Legacy single-var fallback: `FRONTBASE_CACHE_URL` (+ `FRONTBASE_CACHE_TOKEN`)
  implies `{"provider":"upstash", ...}`.

### `FRONTBASE_QUEUE`

```json
{"provider":"qstash","token":"...","signing_key":"...","next_signing_key":"..."}
```

- `qstash` — publish via `POST https://qstash.upstash.io/v2/publish/{dest}`;
  the signing keys (optional) let the receive endpoint verify Upstash's JWT
  signatures. **Requires `PUBLIC_URL`** — it is the destination QStash calls
  back: `${PUBLIC_URL}/api/system/queue/receive`. Without it, publish returns
  false and work runs inline.
- `bullmq` — `{"provider":"bullmq","url":"redis://..."}`. **Node only.**
- Legacy fallbacks: `QSTASH_TOKEN` → `{"provider":"qstash",...}`;
  `BULLMQ_REDIS_URL` → `{"provider":"bullmq",...}` (QStash wins if both).
- `FRONTBASE_QUEUE_CALLBACK_SECRET` — shared secret accepted on the receive
  endpoint in lieu of a signature (header `x-frontbase-callback-secret`).
  The escape hatch for private deploys behind proxies that strip signature
  headers; also the only auth for BullMQ's in-process delivery.

### `FRONTBASE_VECTOR`

```json
{"provider":"libsql","url":"libsql://your-db.turso.io","api_token":"..."}
{"provider":"cloudflare","cf_account_id":"...","cf_api_token":"...","index_name":"..."}
```

- `libsql` / `turso` — remote `libsql://` uses `vector_distance(...)`; local
  `file:` paths compute cosine in-process. `api_token` optional for local files.
- `cloudflare` (alias `vectorize`) — Cloudflare Vectorize over the REST API
  (Bearer `cf_api_token`); `index_name` defaults to `rag_documents`.
- Registry rows carry the same fields under `provider_config`, with the row's
  `url` holding the index name for Vectorize (product parity).

### `FRONTBASE_EMBEDDING`

```json
{"provider":"openai","api_key":"sk-...","model":"text-embedding-3-small","base_url":"https://api.openai.com/v1"}
```

OpenAI-**compatible** wire (`POST {base_url}/embeddings`, Bearer `api_key`):
any endpoint speaking it works — OpenAI, many gateways, a self-hosted
Ollama/LM Studio **exposed over public HTTPS**. `model` defaults to
`text-embedding-3-small`, `base_url` to `https://api.openai.com/v1`. A
keyless config against the default endpoint parses to "not configured"
(misconfiguration, not a silent anonymous call).

### `PUBLIC_URL`

The externally reachable origin of THIS deployment (queue callback
destination). No `PUBLIC_URL` + QStash ⇒ publishing is skipped and queued
work runs inline.

---

## Queue receive endpoint

`POST /api/system/queue/receive` — framework-only (outside the vendored
334-op product surface), registered in the unauthenticated block; auth is
either a valid `upstash-signature` (verified against the resolved queue's
signing keys) or the shared callback secret (constant-time compare). 401
otherwise.

Jobs on the wire: `{type:'execution', tenant, executionId, workflowId}` and
`{type:'rag-index', tenant, bucketId}`. Unknown types answer `200 {ok:true,
skipped:true}` — idempotent no-ops, never 5xx, so QStash never redelivers
forever. Permanent misconfiguration (e.g. RAG without embedding) also skips
with 200; transient failures (network, storage, vector write) answer 503 so
the broker retries. Receive-side isolation is a tenant-scoped store lookup —
a cross-tenant execution id is skipped, never executed.

---

## RAG

Console-authed endpoints (framework-only):

- `POST /api/rag/index {bucketId}` — publishes a `rag-index` job when a queue
  resolves (202), runs inline otherwise (200 with counts). Same runner backs
  both paths; last-run stamp in the tenant KV (`rag:last-index`).
- `POST /api/rag/search {query, table?, limit?}` — embeds the query, searches
  the tenant's vector table with a **mandatory `tenant_id` filter**,
  over-fetches limit×2 then trims (product semantics). Optional `table`
  passes an identifier gate (injection-shaped names → 400).

Pipeline: bucket file inventory (tenant-scoped `storage_files`) → text-like
gate (`text/*` MIME or known text extension; images/PDF **skipped, no OCR in
v1**) → product chunking (size 1000, overlap 200, sentence-boundary breaks) →
embedding per chunk → upsert into the per-tenant table `rag_{tenant}` with
stable chunk ids (re-index replaces, never duplicates).

Divergences from the product (deliberate, documented):
- configured via `FRONTBASE_EMBEDDING`, not the product's `CLOUDFLARE_` /
  `OLLAMA_` variables;
- no OCR — text-like files only, skipped files are counted;
- per-tenant tables + store-row inventory where the product uses one shared
  table;
- **localhost embedding endpoints are unreachable by design** — every
  embedding call goes through the SSRF guard (below). Expose Ollama/LM Studio
  over a public HTTPS hostname instead.

Isolation is asserted in tests, not assumed: tenant-b searches never return
tenant-a chunks (separate tables AND the mandatory filter), and the API key
never appears in logs or error messages (failures surface the HTTP status).

---

## Self-aware display

- **Engine card** — the system edge engine's `edge_cache_name` /
  `edge_queue_name` resolve per tenant through the same resolver the runtime
  uses: adopted row name → env label (e.g. `Upstash Redis (env)`) → `null`.
  The card never claims a backing the worker lacks. No vector field on the
  engine shape (vector shows in its own tab).
- **Edge Resources tabs** — the platform-wired truth (bound D1 on CF; the
  local SQLite file on the self-host) renders as system cards; env-wired
  kinds render `(env)` cards; everything else renders the console's honest
  empty states. No rows are synthesized for services that aren't wired.

---

## Security posture

- **SSRF guard on every HTTP adapter** (Upstash REST, Vectorize REST, QStash
  publish, embeddings): HTTPS-only, loopback/private/link-local destinations
  rejected, 10s timeout, redirects off by default and re-validated per hop
  when opted in. Hosts may inject a fetch for platform egress control or
  deterministic tests — the URL validation still runs.
- **TCP providers** (ioredis, BullMQ) connect straight from operator-provided
  connection strings — operator-env trust class, no HTTP guard applies.
- **Cache isolation by construction**: every resolved cache is wrapped in a
  `t:{tenant}:` prefixer, so even ONE shared env-level adapter keeps tenants
  in disjoint key spaces.
- **Credentials**: registry configs are encrypted at rest; env secrets come
  from runtime env only. Logs and error messages carry presence booleans and
  status codes — never token values or DSNs.

---

## Optional dependencies & bundling

`ioredis` and `bullmq` are **optionalDependencies** of `@frontbase/edge-infra`,
loaded via dynamic `import()` behind try/catch. Absent (Cloudflare Workers,
minimal installs), the resolver logs once and degrades — nothing crashes. The
cf-full `build.mjs` maps both to throwing stubs in the worker bundle so the
failed import is caught at the seam; `@upstash/qstash` ships bundled (publish
is hand-rolled REST; the SDK's Receiver does signature verification).

## Capability matrix

| Provider | Cloudflare Worker | Node / Docker |
|---|---|---|
| Upstash cache (REST) | ✔ | ✔ |
| Redis TCP (ioredis) / BullMQ | — (stubbed, degrades) | ✔ |
| QStash publish + signature verify | ✔ (bundled) | ✔ |
| libsql / Turso vector | ✔ | ✔ |
| Cloudflare Vectorize (REST) | ✔ | ✔ |
| cloudflare_kv / deno_kv cache | deferred (no host declares a binding) | — |
| OpenAI-compatible embeddings | ✔ | ✔ |

## Where the code lives

- Resolver + env parsing: `packages/backend/src/compat/system-services.ts`
- HTTP adapters + wrappers: `packages/edge-infra/src/{cache,queue,vector}/`
- Guarded fetch: `packages/backend/src/compat/external-http.ts`
- Queue receive route: `packages/backend/src/compat/routes/system-queue.ts`
- RAG: `packages/backend/src/compat/rag/` (`embedding` · `processor` · `routes`)
- Display: `packages/backend/src/compat/routes/edge-{shapes,engines}.ts`
- Tests: `test/{system-services,system-queue,rag,system-display,edge-defaults}.mjs`,
  `@frontbase/edge-infra` `test/{cache-remote,qstash,vector}.mjs`, cf-full smoke.
