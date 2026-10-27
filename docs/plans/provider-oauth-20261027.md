> Historical direct-client checkpoint. The owner subsequently approved and deployed the isolated relay and private registrations; see [current relay evidence](provider-oauth-relay-20261027.md). Earlier statements below about absent approval/registration/relay are superseded, not current blockers. Native-button completion remains open.

# Shared provider OAuth delivery — 2026-10-27

## Status

Direct self-hosted OAuth implementation and bounded qualification are delivered. The owner's complete native-button request remains **INCOMPLETE**. There is no registered live Frontbase Cloudflare OAuth client, no qualified Vercel Integration consent, no approved shared callback relay, and no new native first-install ownership handoff. Existing buttons remain on their previous snapshot/defaults. No full native OAuth acceptance or release completion is claimed.

Source: `b9f762a` implements the shared protocol, durable encrypted storage/handoff, conditional connection UI and server-side binding references; `88d8cb8` fixes stale console staging discovered during live verification. The standalone native CF preservation helper is tested but is not wired into the native deploy command.

## Delivered behavior

- Direct Cloudflare S256 PKCE and Vercel Integration code exchange through fixed official endpoints and explicitly configured per-origin clients. Vercel identity-only sign-in is not substituted for deployment authorization.
- One conditional Connect control for each provider actually required by selected resources. Reserved OAuth binding references are resolved on the server against the account and expiry. The browser never receives access/refresh tokens or serializes them into manifests.
- Fresh administrator authorization on start/finish, trusted origin/POST CSRF checks, bounded inputs/provider responses, an expiring HttpOnly cookie, and durable single-use tenant/subject/provider transactions. Cross-process callbacks and concurrent claims are tested.
- Existing encrypted Connected Accounts storage, safe reconnect without reviving a deleted account, and a one-time setup import marker preventing restart resurrection. Setup uses CF's fixed coordinator, create-only encrypted Vercel environment records, or private Docker-volume files.
- Setup grant handoff is encrypted with the installed session key. Native bindings remain independent of management authorization. Expiry requires reconnect; automatic token refresh and implicit provider-wide integration uninstall are not claimed. Historical encrypted handoffs/deployment versions require provider revocation to invalidate the original grant.
- Fixed Node/Docker packaging of the bootstrap backend import through the existing external-package adapter. Fixed automatic restaging when the newly built community console shell differs from the deploy stage; actual live verification caught the stale stage.

## Verification

All listed checks returned exit 0 on the final applicable source/artifact:

- `pnpm -r check` and `pnpm -r build` (local Node 26.7; declared host target remains Node 22).
- `node packages/backend/test/provider-oauth.mjs`: actual SQLite/vault encryption, restart and handoff; CF PKCE/Vercel contract doubles; cookie/origin/subject/tenant/expiry/replay/concurrency; failed exchange, reconnect deletion and installed-app role checks.
- `node packages/backend/test/provider-oauth-mutation.mjs`: seven security faults detected, compiled sources unchanged.
- `pnpm test:hosted-bootstrap`: transaction/auth/SQL/Docker recovery suites and 11 + 7 + 5 + 4 existing fault controls pass.
- `node examples/cf-full/test/hosted-cloud.mjs` and `hosted-cloud-mutation.mjs`: both cloud executors, concurrent activation/completion and four host faults pass. These use provider doubles, not fresh native consent.
- Console deployment-binding suites: 22 tests pass, including conditional connection visibility and server-only credential references. Existing compat auth guard: 4/4 pass.
- Native CF preservation helper: exact D1/KV IDs, closed installer, retained secret names, unknown/duplicate refusal pass. This is a contract helper, not pipeline integration.
- Full Dockerfile build with Node 22.23.4/pnpm 10.15.1: final local image `frontbase-oauth:261027`, digest `sha256:6acc7c448371d220a4eb3740781bad737af8a55a4c96a79b4262b8acf8f181f4`.
- `FRONTBASE_TEST_IMAGE=frontbase-oauth:261027 node scripts/test-docker-hosted-live.mjs`: fresh non-root Linux container/volume, shared setup, configured OAuth start, SQLite activation, private runtime file mode 600, administrator creation/login, page creation/publication, restart/session persistence, anonymous deny and closed installer pass. OAuth client is a protocol fixture; no real provider consent was performed. Disposable fixture removed.

## Live upgrades

Only existing isolated acceptance apps were upgraded; Study-in-USA staging and production were untouched.

| Target | Final deployment | Evidence |
| --- | --- | --- |
| Cloudflare `frontbase-hosted-cf-261026` | version `4b003065-3f51-4b73-93d8-3a6b564c1f20` | Current console shell + OAuth bundle byte-reference check, existing browser administrator session, original public page, admin lock and closed bootstrap pass; exact D1/KV/journal IDs preserved |
| Vercel `frontbase-hosted-vercel-261026` | `dpl_8cE7EDMMt38AKMPhmV2xGTH2xgSW`, stable alias retained | Same current-shell/bundle, browser session, public page and closed-setup checks pass; existing Turso/runtime settings preserved |

The Connected Accounts screen on both apps truthfully has no providers connected, because live OAuth consent is not complete. Do not describe these existing-app upgrades as fresh native-button OAuth acceptance.

## Remaining executable work

1. Resolve the shared callback decision. Automatic approval review rejected adding a hosted OAuth relay because it would receive/forward provider authorization through a new destination not specifically approved. No rejected implementation was written or deployed. A proposed isolated test destination is `https://frontbase-oauth-connect-261027.studygram-inc.workers.dev`; approval must explicitly cover short-lived encrypted CF/Vercel credential handoff there. It does not exist yet. Per-origin self-hosted clients are the supported alternative, with their registration burden stated honestly.
2. Register provider applications and authorize real grants. The CF account's OAuth-client list is empty in the signed-in dashboard. Existing local Wrangler authorization can read the scope catalog (200) but cannot access OAuth client registration (403, provider code 10000). Do not widen or copy the CLI credential into a deployed app. Vercel Integration registration/required provider terms and consent remain unverified.
3. Implement and test target ownership for native first install before issuing any owner capability. A valid CF account login alone must not claim an arbitrary Worker. Bind the resulting grant to the exact installation/project, origin and environment.
4. Wire the approved first-install path into both buttons and preserve active runtime configuration on future builds. Integrate the existing native CF preservation helper; do not overwrite an activated Worker with the initial config.
5. Run fresh native CF/Vercel button → ownership/consent → binding selection → activation → administrator → publication, restart/redeploy and refusal/recovery checks. Revoke temporary test authorization after acceptance without breaking native bindings. Commit/push the final receipt.

No new API keys were requested from the absent owner. Automatic approval review prevents proceeding with the additional relay architecture under broad preauthorization alone. The request cannot be closed truthfully until the above native gaps are resolved.
