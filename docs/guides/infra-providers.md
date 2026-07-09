# Edge Infrastructure — Providers, Auth, Vault, Cache

`@frontbase/edge-infra` is **server-only** (RULE 1: never imported by a browser or
service-worker bundle). It wires the concrete implementations behind the seams
`@frontbase/edge-core` defines.

## Database providers

Decision **A-17**: tenant isolation is **application-level** — every registered
query's `execute` writes `WHERE tenant = ctx.tenant` (tenant from `resolvePrincipal`
only). Provider-native isolation (Postgres/Supabase RLS, D1 bindings) is
**defense-in-depth**, never the primary control. So the SQLite test is
authoritative for every provider.

| Provider | Status | CI |
|---|---|---|
| SQLite (`@libsql/client`) | reference | every commit (`:memory:`) |
| Cloudflare D1 (REST) | contract-verified | credential-gated |
| Turso/libsql (HTTP) | contract-verified | credential-gated |
| Postgres/Neon (Hyperdrive) | contract-verified | credential-gated |

```ts
import { buildDataProvider } from '@frontbase/edge-infra';
const data = buildDataProvider(manifest, { driver: 'sqlite', sqliteUrl: process.env.DB_URL });
// Cloud: { driver: 'd1', d1AccountId, d1DatabaseId, d1ApiToken } etc.
```

A registered query (authored via `defineQueries`) runs tenant-scoped SQL through
the injected `ctx.db` runner:

```ts
'docs.list': { scope: 'tenant', async execute(_p, ctx) {
    return ctx.db.query('SELECT * FROM docs WHERE tenant = ?', [ctx.tenant]);
}}
```

## Auth — `resolvePrincipal`

```ts
import { createResolvePrincipal } from '@frontbase/edge-infra';
import { configureEngine } from '@frontbase/edge-core';
configureEngine({ resolvePrincipal: createResolvePrincipal({
    systemKey: process.env.SYSTEM_KEY,
    apiKeyHashes: [{ hash: '...', tenantSlug: 'acme' }],
    jwtSecret: process.env.JWT_SECRET,
}) });
```

Three modes: system-key header, API-key (SHA-256 hash compare), JWT (HS256).
Tenant comes ONLY from the validated credential — never client input. Web Crypto
throughout (no `node:crypto`).

## Vault (AES-256-GCM, Web Crypto)

```ts
import { Vault } from '@frontbase/edge-infra';
const vault = await Vault.create({ systemKey: process.env.SYSTEM_KEY });
const v = await vault.set('db.password', plaintext, now);
await vault.rotate(prev, { systemKey: newKey }, now); // re-encrypts, keeps legacy key
```

## Cache + durable queue

`memoryCache()` / `nullCache()` / `kvCache(namespace)` — `get` returns a copy
(RULE 3). `inProcessWorkflowProvider()` / `qstashWorkflowProvider()` satisfy the
edge-core workflow contract.

## AI/MCP executors

`fullExecutorRegistry()` = edge-core's control-flow executors + `ai.chat` /
`mcp.call` / `email` / `queue_trigger`. Pass to `executeWorkflow`.
