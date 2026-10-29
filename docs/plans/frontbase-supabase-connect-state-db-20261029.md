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
- Relay (`provider-oauth-relay-target.ts`): both policies admit `supabase` for `purpose:'connect'` only (it is a resource provider, never an install host); enrolled-origins/receiver gates apply unchanged. Required because the operator's Supabase OAuth app registers `https://oauth.frontbase.dev/api/provider-oauth/supabase/callback` — the shared relay — as its redirect URI.
- Tests: `test/provider-oauth.mjs` supabase connect cases (unconfigured 409, full start→finish happy path with fake token endpoint, state/cookie/claim refusals); `test/provider-oauth-mutation.mjs` gates for the supabase branch (fault: dropped code_verifier / dropped account fetch → named FAIL).

### Phase 2 — token refresh + revoke (the one new mechanism)

- New module `provider-oauth-refresh.ts`: given a client + stored authorization, if `expiresAt` passed and `refreshToken` present, POST `grant_type=refresh_token` — per the official guide, refresh uses the **same** `POST https://api.supabase.com/v1/oauth/token` endpoint as the code exchange (no separate /refresh path). Return rotated authorization (Supabase rotates refresh tokens). Revoke on disconnect. Verify live during Phase 6 whether Supabase requires the `client_secret` as a Basic-auth header (per guide) in addition to/instead of the form parameter the current exchange sends.
- Vault: add atomic rotate-by-connection-key (`save` stays create-only; rotation replaces under the same key with owner checks).
- Consumers call refresh before use; `reconnectRequired` only when refresh is impossible (revoked/expired-sliding-window).
- Tests + mutation gates: refresh rotation, refresh-failure → reconnectRequired, revoke-on-disconnect, no-leak (tokens absent from responses/logs).
- **Delivered 2026-10-29:** `provider-oauth-refresh.ts` — `refreshOAuthAuthorization` POSTs `grant_type=refresh_token` to the same `/v1/oauth/token` as the exchange (client_secret as a form parameter exactly like the exchange, so the live-round form-vs-Basic correction lands in both places at once; rotating refresh tokens replace the stored one, an absent response token keeps it for non-rotating providers; `expires_in`→`expiresAt`; same bounded reader, bearer/length validation, opaque errors), plus a 30s guard so a near-expiry token never starts a doomed request. `revokeOAuthAuthorization` implements the Management-API spec revocation — `POST /v1/oauth/revoke` JSON `{client_id, client_secret, refresh_token}` (all required, 204) — for supabase only; no verified revocation endpoint exists for cloudflare/vercel yet, so those return false honestly and the provider dashboard stays the certain path. Vault `save` stays create-only; a new optional `OAuthVault.replace(key,expected,value)` primitive powers atomic rotate-by-connection-key (`providerOAuthVault.refresh(clients,deps)`): rotation replaces the record only while it still equals the inspected value, a concurrent rotation is adopted by re-reading, and grants that cannot be refreshed are omitted (so `/status` keeps reporting `reconnectRequired` truthfully). Bootstrap hosts (hosted-cloud `resolveCredentials` + apply-time handoff envelope, docker host both call sites) now refresh-before-use — the installed-app handoff never ships a dead token; the D1, Vercel-env and file-based vaults each implement `replace`. Disconnect (`DELETE /api/edge-providers/{id}`) attempts best-effort revocation before deletion and always proceeds — a provider or network failure never traps a credential the tenant asked to remove. The relay default `/privacy` sentence about refresh/revocation was updated to match; the deployed production relay shows the new text only after its next deploy. Gates: `provider-oauth.mjs` PASS (rotation/race/failure/duplicate-save/revoke-contract/installed-app disconnect incl. failure-tolerant delete), `provider-oauth-mutation.mjs` PASS 15/15 (5 new), relay suites + docker-host suites + compat-security/parity-foundation/tenant-matrix/conformance + `test:hosted-bootstrap` + `pnpm -r check` + cf-full build PASS. Found while wiring consumers: the relay **client** and the relay `/connect` consent page still hard-refuse supabase (the phase-1 widening covered the admission policies only), so a relay-configured installation cannot start a supabase connect — fixed in the immediate follow-up commit.

### Phase 3 — console UI

- Widen `providerConnections` union and labels to supabase in `bindings-form.ts` (Required/Optional chips and `--fb-*` styling unchanged), `provider-connect.ts`, `ConnectProviderDialog.tsx`; project picker from `GET /v1/projects` accounts.

### Phase 4 — wizard state-db adapter

- `edge-core/deployment.ts`: new state-db adapter entry `supabase-postgres` — targets cloudflare/vercel/docker; modes connect/create/reuse; configKeys (url or project ref, schema), secretKeys (role password); D1 remains default.
- **PostgREST connect mode (owner requirement 2026-10-29, DECISIONS.md):** connect accepts either a wire-protocol DSN or a PostgREST endpoint — the `postgrest` transport reuses the existing CF-20 `supabaseRunner`/`supabasePostgrestClient` (SQL over PostgREST RPC via the documented `execute_query` database function) for self-hosted Postgres without wire reachability. The helper-function prerequisite is stated in the wizard; the mode is labeled HTTP-per-statement, not throughput-equivalent.
- Wizard form card + review validation (bounded, no provisioning during review).
- Apply-time: create/reuse via existing provisioning SQL; worker receives only the scoped-role DSN (or PostgREST endpoint+credential), never the PAT/OAuth grant.

### Phase 5 — runtime transport + host wiring

- Cloudflare native deploy: create/bind Hyperdrive with the scoped-role pooler DSN (extends existing native resource creation); `postgresStateRunner` consumes the binding.
- Vercel/Docker: direct role DSN.
- PostgREST transport: host-independent plain HTTPS (no Hyperdrive/wire access needed) — the one mode that runs unchanged on every target.
- Migrations self-apply on first boot (already portable across SQLite/D1/Turso/Postgres).
- **Delivered 2026-10-29 (transports, minus CF-native Hyperdrive creation):** the wizard lowers `supabase-postgres` connect through `profile-environment.mjs` — PostgREST as `APP_DB_POSTGREST_URL`/`APP_DB_POSTGREST_TOKEN`(+`APP_DB_POSTGRES_SCHEMA`) identical on every target; wire as a credential-encoded `postgres://` DSN in `APP_DB_URL` on docker/vercel only, with `state_wire_requires_hyperdrive` refused on cloudflare until native Hyperdrive creation exists (fail-closed, never a silent boot failure). The host resolver (`examples/cf-full/src/state-db.ts`) gained two kinds: `postgres-postgrest` (CF-20 `supabaseRunner`, https-only, any host) and `postgres-wire` (`postgresStateRunner`; refused on deno/cloudflare without cloud-mode Hyperdrive — no TCP there); half-configured or ambiguous selections fail loud naming the vars, and DSN/bearer values never reach labels, `displayUrl`, or cards. The empty-state probe (`cloudflare-state.mjs`) probes the application schema (`pg_tables`, quote-doubled, default `public`) via the matching runner for both transports. Schema identifiers tightened to lowercase in the manifest validation to match `postgresStateRunner`'s quoted-identifier rule. Still open under phase 5: Hyperdrive create/bind for CF-native wire deploys (currently refused by name), and the apply-time create/reuse executor (phase 4 remainder).

### Phase 6 — gates + live verification

- Live OAuth application registration (owner, one-time) + env vars on console/hosted relay; verify exact scope strings and that `/v1/projects/{ref}/database/query` behaves with OAuth-scoped tokens.
- Mutation/no-leak suites for all new paths; record results in PUBLIC-RELEASE-AUDIT.md.
- Self-host docs: PAT fallback path; bring-your-own OAuth app for custom origins (redirect URI = own origin).

## Non-goals / boundaries

- No Supabase OAuth requirement for self-host (PAT fallback is supported and documented).
- No vector/cache/queue adapters from the console Edge Databases feature in the wizard v1.
- No hosted-broker dependency introduced; the existing explicitly-configured relay remains the only shared callback infrastructure.
- No GA/parity claims; independent-account verification remains an open gate.
