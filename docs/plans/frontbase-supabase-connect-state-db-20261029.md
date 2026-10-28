# Supabase OAuth Connect + Postgres State-DB in the Deployment Wizard

Owner-approved 2026-10-29. Decision record: [DECISIONS.md 2026-10-29](../history/DECISIONS.md). Branch: `reconcile/public-baseline-20261028` (clean worktree; the OneDrive checkout belongs to another stream and stays untouched).

## Goal

1. A **Connect Supabase** button in the shared bindings editor and console settings, using the Supabase Management API OAuth2 authorization-code flow, as a third provider in the existing `provider-oauth` protocol alongside Cloudflare and Vercel.
2. A **Supabase/Postgres state-db adapter** in the deployment wizard manifest, with connect mode (scoped-role DSN) and create/reuse modes (isolated `frontbase_edge_*` schema + scoped role, reusing the Edge Databases provisioning SQL and `SupabaseProvisioner`).
3. Per-host runtime transport: Hyperdrive binding on Cloudflare via `postgresStateRunner`; direct PostgreSQL on Vercel/Docker/Node. D1 stays the Cloudflare default.

## Existing surfaces being extended (no new mechanisms except refresh)

- `packages/backend/src/provider-oauth.ts` — auth-code + PKCE S256 flow, one-use claims, provider account verification via a real management call.
- `packages/backend/src/provider-oauth-config.ts` — env-driven client config loop `FRONTBASE_{PROVIDER}_OAUTH_*`.
- `packages/backend/src/provider-oauth-import.ts` — one-time grant handoff (provider allow-list).
- `packages/backend/src/provider-oauth-bindings.ts` — reserved `oauth/` secret-reference resolution (currently cloudflare-only; pattern for supabase consumers).
- `packages/edge-core/src/deployment.ts` — adapter manifest (`state-db` role currently SQLite-family only).
- `packages/edge-infra/src/providers/postgres-state.ts` — `postgresStateRunner` (schema isolation, self-heal, Hyperdrive/direct URL) — already runs the shared migrations on Postgres.
- `packages/edge-infra/src/provisioning/supabase.ts` — `SupabaseProvisioner` (schema-per-resource).
- Console: `bindings-form.ts` (`providerConnections` union), `provider-connect.ts`, `ConnectProviderDialog.tsx`.

## Phases

### Phase 1 — provider-OAuth protocol extension (backend only)

- `OAuthProvider` union + `providers` array + `endpoints` map: add `supabase` → authorize `https://api.supabase.com/v1/oauth/authorize`, token `https://api.supabase.com/v1/oauth/token`.
- `/start`: supabase branch builds the standard authorize URL (client_id, response_type=code, scope, redirect_uri, code_challenge S256).
- `/finish`: send `code_verifier` for supabase (PKCE) in addition to cloudflare; `client_secret` when configured (confidential clients).
- Account verification: `GET https://api.supabase.com/v1/projects` with the Bearer token; map to `{id: ref, name}`; same ≤50 shape validation. A management call proves usable authorization (same principle as the Cloudflare/Vercel branches).
- `provider-oauth-config.ts`: iterate `['cloudflare','vercel','supabase']`.
- `provider-oauth-import.ts`: allow `supabase` grants.
- Tests: `test/provider-oauth.mjs` supabase connect cases (unconfigured 409, full start→finish happy path with fake token endpoint, state/cookie/claim refusals); `test/provider-oauth-mutation.mjs` gates for the supabase branch (fault: dropped code_verifier / dropped account fetch → named FAIL).

### Phase 2 — token refresh + revoke (the one new mechanism)

- New module `provider-oauth-refresh.ts`: given a client + stored authorization, if `expiresAt` passed and `refreshToken` present, POST `grant_type=refresh_token` to `https://api.supabase.com/v1/oauth/refresh`; return rotated authorization (Supabase rotates refresh tokens). Revoke: `POST /v1/oauth/revoke` on disconnect.
- Vault: add atomic rotate-by-connection-key (`save` stays create-only; rotation replaces under the same key with owner checks).
- Consumers call refresh before use; `reconnectRequired` only when refresh is impossible (revoked/expired-sliding-window).
- Tests + mutation gates: refresh rotation, refresh-failure → reconnectRequired, revoke-on-disconnect, no-leak (tokens absent from responses/logs).

### Phase 3 — console UI

- Widen `providerConnections` union and labels to supabase in `bindings-form.ts` (Required/Optional chips and `--fb-*` styling unchanged), `provider-connect.ts`, `ConnectProviderDialog.tsx`; project picker from `GET /v1/projects` accounts.

### Phase 4 — wizard state-db adapter

- `edge-core/deployment.ts`: new state-db adapter entry `supabase-postgres` — targets cloudflare/vercel/docker; modes connect/create/reuse; configKeys (url or project ref, schema), secretKeys (role password); D1 remains default.
- Wizard form card + review validation (bounded, no provisioning during review).
- Apply-time: create/reuse via existing provisioning SQL; worker receives only the scoped-role DSN, never the PAT/OAuth grant.

### Phase 5 — runtime transport + host wiring

- Cloudflare native deploy: create/bind Hyperdrive with the scoped-role pooler DSN (extends existing native resource creation); `postgresStateRunner` consumes the binding.
- Vercel/Docker: direct role DSN.
- Migrations self-apply on first boot (already portable across SQLite/D1/Turso/Postgres).

### Phase 6 — gates + live verification

- Live OAuth application registration (owner, one-time) + env vars on console/hosted relay; verify exact scope strings and that `/v1/projects/{ref}/database/query` behaves with OAuth-scoped tokens.
- Mutation/no-leak suites for all new paths; record results in PUBLIC-RELEASE-AUDIT.md.
- Self-host docs: PAT fallback path; bring-your-own OAuth app for custom origins (redirect URI = own origin).

## Non-goals / boundaries

- No Supabase OAuth requirement for self-host (PAT fallback is supported and documented).
- No vector/cache/queue adapters from the console Edge Databases feature in the wizard v1.
- No hosted-broker dependency introduced; the existing explicitly-configured relay remains the only shared callback infrastructure.
- No GA/parity claims; independent-account verification remains an open gate.
