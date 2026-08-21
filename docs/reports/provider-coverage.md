# Provider × Capability Coverage Map

Status: 2026-08-21. Joins two audits — a framework-side route inventory (what each
compat route actually does today) and a product-side machinery inventory (what the
product repo implements that the framework must port or map). Companion to
[facade-audit.html](./facade-audit.html), which covers the engine-lifecycle façades
and the gate blind spots; this doc is the per-provider working reference for the
port backlog.

**Launch scope decision (2026-08-21): Netlify is dropped from the initial launch.**
Its rows are kept for the deferred port.

## Legend

| Mark | Meaning |
|---|---|
| **R** | Real — performs the side effect against the provider API |
| **F** | Façade — product-shaped success, no side effect |
| **H** | Honest refusal — 501/error that admits the op is absent |
| **M** | Missing — no route, or stub |
| — | N/A for this provider |

## Capability axes

`TEST` connect-account test · `DISCOVER` list remote resources for connect flow ·
`CREATE`/`DELETE` provision/deprovision remote resources · `LIST-ENGINES` engine
listing w/ metadata · `DEPLOY` engine bundle upload+activation · `SECRETS` runtime
secret push/rotation · `DOMAINS` custom domain attach · `LOGS` invocation log
retrieval · `INSPECT` engine state introspection · `TOKENS` scoped API tokens ·
`SCHEMA` state-DB schema lifecycle · `TABLES` tenant table introspection/query ·
`OTHER` provider-specific flows (Sheets connect, WP extract, qstash keys).

## Coverage matrix

| Provider | TEST | DISCOVER | CREATE | DELETE | LIST-ENGINES | DEPLOY | SECRETS | DOMAINS | LOGS | INSPECT | TOKENS | SCHEMA | TABLES | OTHER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cloudflare | R | R | R (d1/kv/queue) | F | R | F | M | M | M | M | M | — | — | — |
| Supabase | R | R | M (adapters exist, unwired) | M | — | F | M | M | M | M | M | R (Mgmt API) | R (PostgREST) | enrich R |
| Vercel | R | R | F (storage route) | F | R | F | M | M | M | M | M | — | — | — |
| Deno | R | R | — | — | R | F | M | M | M | M | M | — | — | — |
| Netlify *(deferred)* | R | R | F (storage route) | F | R | F | M | M | M | M | M | — | — | — |
| Turso | R | R | R (strategy) **but route is F** | F | — | F | M | — | M | M | M | — | — | — |
| Neon | R | R | M | M | — | — | — | — | — | — | — | — | — | — |
| Upstash | R | R | R (redis) | F | — | — | — | — | — | — | — | — | — | qstash keys R |
| WordPress | R | R (plugin sync) | — | — | — | — | — | — | — | — | — | — | — | extract/import/SSE R |
| Google Sheets | — | R (connect issue/callback/status) | — | — | — | — | — | — | — | — | — | — | — | Apps Script flow R |
| MySQL | H | H | — | — | — | — | — | — | — | — | — | — | — | — |

**All-engine-verbs caveat:** every `DEPLOY` above is one of the 17 engine-lifecycle
façades catalogued in facade-audit.html — the marks are per-provider *storage*
capabilities; engine deploy/secrets/domains/logs/inspect are façade-or-missing
across the board.

**Zero-support backends** (honest refusal, no adapter at all): rabbitmq, sqs,
dragonfly, turso_vector, embedded_lancedb, edge-proxy.

**Unwired provisioning layer:** `packages/backend/src/compat/provisioning/`
(edge-infra `provisioning/cloudflare.ts` + `supabase.ts`) implements real REST
provisioning but is imported by nothing — a ready-made seam for the port.

## Product behaviors that must survive the port (23 port-critical quirks)

Behaviors the product relies on that a naive port breaks. Each becomes an
acceptance criterion on the corresponding P0–P2 item in facade-audit.html.

### Supabase
1. `[YOUR-PASSWORD]` placeholder in db URLs must be replaced with the stored role
   password before use; the raw URL is never usable as-is.
2. `db_url` is rewritten to `https://{ref}.supabase.co` form for the state DB.
3. State-DB sub-lifecycle: DDL bootstrap, scoped role, 10-yr JWT, PostgREST
   exposure — re-initialized after every deploy.
4. Secrets plane: service_role key fetched via Management API (api-keys + jwt_secret
   enrichment), never stored twice.

### Cloudflare
5. Synthetic URIs `d1://`, `kv://`, `cfq://` are handed to engines as connection
   strings — the runner resolves them to bindings.
6. Logs via GraphQL `workersInvocationsAdaptive` (not the REST logs endpoint).
7. Scoped tokens: permission-group lookup **by name**, with a `_warning` fallback
   field when the group list can't be resolved.
8. Per-plan log retention windows applied on query.

### Deno Deploy
9. Domain suffix differs by tier: `.deno.net` vs `.deno.dev`.
10. Slug collisions (409) are retried with a new slug, not surfaced.

### Vercel
11. First deploy is a double-push: initial create + follow-up update (the API
    rejects inline config on the first call).
12. `vercel.json` + `package.json` are inlined into the deployment payload.

### Upstash
13. Management API uses Basic auth `email:api_token` (not bearer).
14. Redis delete matches **by URL**, not by id.
15. Qstash exposes a signing-key pair (current + next), both surfaced.

### Turso
16. `libsql://` connection strings come in two API shapes (platform vs legacy).
17. Delete strips the org suffix from the database name before the API call.

### Neon
18. Console API (not the public API) for some ops; `neon_project_id` (not the
    framework's resource id) is required for delete.

### WordPress
19. Anti-403 browser headers (UA/Accept) on all fetches to the WP host.

### Google Sheets
20. No OAuth: the Apps Script add-on flow issues a single-use token consumed by
    the callback; `FRONTBASE_SHEETS_ADDON_URL` empty → SPA renders bundled fallback
    (already ported).

### Cross-cutting
21. Discovery caches are success-only (L1/L2): errors never poison the cache, but
    stale successes can persist.
22. `provider_registry` URL templates drive all provider REST calls — port the
    table, not hardcoded URLs.
23. Docker-mode secrets sync via `POST /api/config/secrets`; shared-engine secrets
    re-synced after every deploy.

## Launch verdicts

| Provider | Initial launch | Rationale |
|---|---|---|
| Cloudflare | **Include** | Provisioning + engines real (minus deploy machinery, P0) |
| Supabase | **Include** | Schema/tables/enrichment real; deploy machinery is P0 |
| Vercel | **Include (P0 port)** | Deploy adapter is the first P0 item — engine verbs are façades until then |
| Upstash | **Include** | Redis create + qstash keys real |
| Turso | **Include after route fix** | Strategy create is real but the databases route still façades it — small fix |
| Neon | **Include (account level)** | Test/discover real; create/delete missing (P2) |
| Deno Deploy | **Include (account level)** | List-engines real; deploy façade (P1) |
| WordPress / Sheets | **Include** | Sync + connect flows real |
| MySQL | **Honest refusal** | No adapter — surfaces as unsupported, correctly |
| Netlify | **Deferred (dropped 2026-08-21)** | eszip-only CLI incompatibility; revisit post-launch |

## Port backlog linkage

- **P0** (from facade-audit.html): bundle-strategy decision (tsup subprocess →
  prebuilt artifacts), Vercel deploy adapter (quirks 11–12), secrets plane
  (cross-cutting 3–4, 23–24).
- **P1**: Deno deploy (quirks 9–10), domains, logs (quirks 6, 8), inspect,
  CF scoped tokens (quirk 7), Turso route de-façade (quirks 16–17).
- **P2**: Neon create/delete (quirk 18), zero-support backends stay honest-refusal,
  discovery cache parity (quirk 21), provider_registry table port (quirk 22).

Gate hardening (facade-audit.html §ranked) lands **before or with** P0 — otherwise
the port ships behind the same vacuous validators that hid the gap.
