# Unclosable Parity Gap: Generic Postgres / MySQL on the Runtime-Portable Worker

**Status:** accepted limitation (will not be closed on the community/framework worker).
**Last reviewed:** 2026-08-03.

## Summary

Generic **self-hosted Postgres** and **MySQL** datasources cannot be connected
from the **runtime-portable, fetch-only** community/framework worker
(`examples/cf-full`). This is a fundamental runtime constraint, not a missing
feature, and is intentionally left open.

## Root cause

The community worker is **HTTP-only**. It must run unchanged across Cloudflare
Workers, Deno Deploy, and Vercel Edge — none of which expose raw **TCP sockets**.
Postgres and MySQL speak a binary wire protocol over a long-lived TCP socket;
there is no HTTP equivalent of that wire protocol.

- `psycopg2` / `asyncpg` / `mysql` drivers all require TCP.
- The framework's runners (`packages/edge-infra`) are HTTP adapters only:
  - `supabaseRunner` → PostgREST HTTP API
  - `postgresRunner` → Neon SQL-over-HTTP (`@neondatabase/serverless`)
  - `sqliteRunner` / `d1RunnerFromRest` → HTTP / libsql HTTP flavor
- None of these can reach a plain `postgresql://` / `mysql://` host.

## What IS closable (hostaged managed Postgres)

Managed/hosted Postgres that exposes an **HTTP** query path works fine:

| Provider | Path | Status |
| --- | --- | --- |
| **Supabase** | PostgREST (`/rest/v1`) + `execute_query` RPC | ✅ closable (see `supabase_setup.sql`, [[supabase-execute-query-fix]]) |
| **Neon** | SQL-over-HTTP (`@neondatabase/serverless`) | ✅ closable |
| **Cloudflare D1** | REST API | ✅ closable |
| **Turso** | libsql over HTTP | ✅ closable |
| **Generic self-hosted Postgres** | TCP only | ❌ **not closable here** |
| **MySQL** | TCP only (no HTTP client) | ❌ **not closable here** |

## Rejected alternatives

- **`cloudflare:sockets`** (CF-only TCP egress): rejected — it breaks Deno/Vercel
  portability, which is the whole point of the runtime-portable worker, and MySQL
  has no compatible HTTP client regardless.
- **Bundling a TCP driver**: rejected — there is no socket API to bind it to on
  the edge runtimes.

## How users connect generic Postgres / MySQL

Use the **product backend** (Python/FastAPI, full container with TCP via
`asyncpg`/`aiomysql`) for self-hosted Postgres/MySQL datasources. The framework
worker is for the HTTP-reachable, runtime-portable surface only.

## Related

- Memory: `community-worker-unclosable-parity`.
- Provider credential parity (closed 2026-08-03): `docs` + `packages/backend/src/compat/providers/`.
