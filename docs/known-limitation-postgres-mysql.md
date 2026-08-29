# Known limitation: generic Postgres / MySQL datasources

**Status:** accepted limitation (will not be closed on the fetch-only worker).
**Last reviewed:** 2026-08-03 (addendum 2026-08-28).

## Summary

Generic **self-hosted Postgres** and **MySQL** datasources cannot be connected
from the **runtime-portable, fetch-only** worker (`examples/cf-full`). This is a
fundamental runtime constraint, not a missing feature, and is intentionally left
open.

## Root cause

The worker is **HTTP-only**. One artifact runs unchanged across Cloudflare
Workers, Docker/Node, Deno Deploy, and Vercel Edge — and the edge runtimes among
them expose no raw **TCP sockets**, so the artifact stays fetch-only everywhere.
Postgres and MySQL speak a binary wire protocol over a long-lived TCP socket;
there is no HTTP equivalent of that wire protocol.

- `psycopg2` / `asyncpg` / `mysql` drivers all require TCP.
- The framework's runners (`packages/edge-infra`) are HTTP adapters only:
  - `supabaseRunner` → PostgREST HTTP API
  - `postgresRunner` → Neon SQL-over-HTTP (`@neondatabase/serverless`)
  - `sqliteRunner` / `d1RunnerFromRest` → HTTP / libsql HTTP flavor
- None of these can reach a plain `postgresql://` / `mysql://` host.

## What IS closable (HTTP-reachable managed Postgres)

Managed/hosted Postgres that exposes an **HTTP** query path works fine:

| Provider | Path | Status |
| --- | --- | --- |
| **Supabase** | PostgREST (`/rest/v1`) + `execute_query` RPC | ✅ works (see [docs/guides/supabase-setup.md](./guides/supabase-setup.md)) |
| **Neon** | SQL-over-HTTP (`@neondatabase/serverless`) | ✅ works |
| **Cloudflare D1** | REST API | ✅ works |
| **Turso** | libsql over HTTP | ✅ works |
| **Generic self-hosted Postgres** | TCP only | ❌ **not closable here** |
| **MySQL** | TCP only (no HTTP client) | ❌ **not closable here** |

## What this means in practice

- **HTTP-reachable Postgres** (Supabase, Neon) works as a datasource today.
- **Self-hosted Postgres / MySQL datasources** have no framework path — there is
  no supported bridge; do not expect one until a host with TCP egress is
  officially supported. Track this doc; if the constraint ever lifts, it will be
  recorded here first.

## Rejected alternatives

- **`cloudflare:sockets`** (CF-only TCP egress): rejected — it breaks Deno/Vercel
  portability, which is the whole point of the runtime-portable worker, and MySQL
  has no compatible HTTP client regardless.
- **Bundling a TCP driver**: rejected — there is no socket API to bind it to on
  the edge runtimes.

## Addendum 2026-08-28: the four-host deploy matrix

The deploy matrix (Cloudflare, Docker, Vercel Edge, Deno Deploy) does not change
this gap: the state-db resolver (`examples/cf-full/src/state-db.ts`) deliberately
exposes ONLY the SQLite-family adapters that exist (D1 binding, D1-over-REST,
Turso/libsql, `file:`, `:memory:`) and refuses half-configured setups at boot —
a credential-gated adapter is not a coverage gap. Postgres/MySQL as the APP
database remains unclosable on fetch-only runtimes for exactly the reasons
above; Supabase Postgres is still a *datasource* runner (PostgREST RPC), not an
app-DB option.

## Related

- State-db precedence and the fail-loud rule: [`examples/cf-full/test/state-db.mjs`](../examples/cf-full/test/state-db.mjs)
- Provider credential coverage: `packages/backend/src/compat/providers/`
