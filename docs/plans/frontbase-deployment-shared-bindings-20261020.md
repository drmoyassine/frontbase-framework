# Shared deployment Bindings review and native storage UI — 2026-10-20

Source checkpoint: `58c56e4`; generated host artifact: `88a4dd9`.

## Delivered scope

One browser-only editor now renders the local pre-deployment form and the running self-hosted app's system-engine Bindings dialog. It lives in the existing private console source, imports the existing narrow deployment contracts, and adds no package, hosted control plane or second renderer. The local launcher bundles the same module through the existing pinned bundler, in an isolated process with a fixed repository working directory. This avoids retaining callers' temporary directories on Windows.

Both contexts use the same compatible adapter catalogue, modes, fields and secret-reference rules. Local setup can accept credential values in memory; the running app edits reference-only proposals and has no password/key input. Provider changes discard the prior provider's credential references/values; edits invalidate a prior review. The bootstrap entry is an ESM module under the existing same-origin CSP and one-time local claim/session/expiry protections.

Measured standalone editor: 66,769 JavaScript bytes, 16,691 gzip bytes; shared CSS 951 bytes. These are static admin/setup assets, not a new published-page behavior runtime or a Worker script budget claim.

## Running app discovery and review

Managed CF uploads now publish a strict nonsecret `FRONTBASE_DEPLOYMENT_MANIFEST` plain binding derived from recorded native resource identities. Enabled native roles use reuse mode and exact references; disabled roles carry no stale config or secret references. The management-side identity reader verifies this metadata against actual D1/KV/R2 bindings. Unknown/credential-bearing host metadata is rejected instead of exposed.

In **Edge → Edge Compute**, open **Bindings** on the local/system engine card (`/frontbase-admin/edge?tab=compute`). New authenticated framework endpoints are:

- `GET /api/deployment/bindings`: current recorded metadata or an explicit unavailable result.
- `POST /api/deployment/bindings/review`: bounded strict-body review, changed-role/state-migration classification, `applied:false` and `executable:false`.

Access is self-host deployment-operator only: root master administrator, or the default owner namespace. Other roles/tenants and cloud mode are refused. Responses are no-store. These routes receive no runner/store/provisioner credentials and persist nothing. The existing community operation inventory and stored-engine compatibility routes are unchanged.

The dialog loads on demand, reuses the authenticated console API service through a typed client interface, and can download a validated proposal without credential values. Missing managed metadata does not produce guessed deployed settings or silently enroll an older installation.

**This is review/proposal UI, not live reconfiguration.** It does not apply provider changes, migrate state, provision resources, or execute downloaded files. The current managed executor still redeploys unchanged recorded bindings; controlled binding changes and a complete proposal-to-deployment handoff remain open. The older stored-engine reconfigure handler's false-success/no-op gap is not repaired or adopted by this system-engine flow. P4 remains partial.

## Native private R2 affordances

The existing credential-redaction whitelist explicitly projects the native deployment-managed marker; it does not return arbitrary extra provider fields. Native logical buckets expose that marker and the one-hour signed-link maximum.

The Storage UI labels bound private storage, hides provider removal/testing that requires a connected account, excludes it from physical bucket creation choices, and hides bucket settings/deletion. File upload/browsing/emptying and private signed access remain available. External providers retain their existing bucket controls. Signed-link duration choices respect the returned maximum and clamp a selection retained from another provider. Native storage is still private and does not become permanent public asset storage.

## Actual acceptance

A reviewed managed redeploy updated only the already-owned disposable `frontbase-managed-20261020-a` application. No new resource, secret upload, Study in USA staging/translation deployment, other WordPress site, DNS or Vercel environment change occurred.

- Existing disposable administrator login, pre-redeploy native upload: 200.
- Local exact-binding review/redeploy: 200/200. D1/KV/R2 identity and secret-name sets retained.
- Anonymous deployment metadata: 401; operator discovery: 200/no-store with the exact expected recorded manifest.
- Unchanged proposal, changed-cache proposal and database-migration warning: 200, all explicitly unapplied/non-executable.
- GET after review retains the original manifest; credential-bearing extra body is refused 400 without echo.
- Actual native provider/bucket capability markers and private status verified; native provider removal remains 409.
- Original login session still returns byte-identical page-list data; original signed object URL and KV sentinel remain valid.
- Test object cleanup: 200. Existing disposable infrastructure/page/sentinel remain identifiable.

Actual local browser verification loaded the shared module, selected a compatible HTTP override, validated synthetic-only credentials and visibly cleared the review after a subsequent edit. No provider callback was enabled for that browser fixture. Screenshot: `bindings-local-review.png`, outside Git. Running-console component behavior is covered by the React tests; no complete post-deploy browser journey or host deployment-button journey is claimed.

## Verification

- Full `pnpm -r build` and `pnpm -r check`: PASS. A final whitelist-safe native marker correction was followed by a targeted backend/host rebuild and rerun of retained storage/deployment gates.
- New independently type-checked shared editor/dialog: PASS, included in the console check script. Its typed client is supplied by the existing console service; unrelated authentication source is unchanged.
- Sixteen UI cases: seven shared editor, five console proposal/retry/invalidation, four native storage/menu/link cases: PASS.
- Actual backend review fixture: PASS; owner/tenant/cloud restrictions, strict metadata projection, malformed/oversized input, migration classification, no credential echo and zero database writes.
- Seven independent API faults detected after a passing transformed baseline: operator gate, tenant scope, cloud exclusion, host projection, body bound, credential-payload refusal and false applying response.
- Retained local bootstrap/setup/lifecycle, eight bootstrap/fourteen execution/nine lifecycle faults and native cache/R2/deployment gates: PASS.
- Strict response conformance: 257 conforming /77 verified refusals across 334 community operations, zero violations/unreachable.
- Server/browser no-leak and actual generated Vercel artifact gate: PASS; no Vercel host call.

The first UI fork run timed out before tests executed; the committed suite uses one worker thread. An incomplete bucket fixture/import and the bootstrap ESM entry were corrected before browser acceptance. The native marker test caught the existing whitelist intentionally dropping new fields; the fix adds only the known native scalar and preserves credential redaction. Initial inherited SuperTokens type diagnostics were not waived or repaired: a typed API-client boundary keeps the new reusable dialog independent, while those pre-existing broader-console diagnostics remain outside this slice.

Retained logs: `bindings-ui-build.log`, `bindings-backend-rebuild.log`, `bindings-host-rebuild.log`, `bindings-check.log`, `bindings-shared-acceptance.log`, `bindings-setup-tests.log`, `bindings-deployment-gates.log`, `bindings-conformance.log`. Sanitized live results/command categories are in `bindings-live-public.json` and `bindings-live-commands.json`; administrator credentials are never included.

No package publication, full framework test/release matrix, independent clean-room install, migration/restore certification, Cloudflare-native deploy button or actual Vercel deployment is established by this bounded result.

## Remaining order

1. Complete the reviewed proposal-to-executor handoff and explicitly supported binding-change lifecycle; retain a separate state migration boundary.
2. Prove the actual Cloudflare deploy-button/clean-install journey using the accepted contracts/compiler rather than the older no-op stored-engine reconfigure path.
3. Complete isolated free Vercel state integration and corresponding live install/redeploy acceptance after Marketplace readiness.
4. Broader adapters, migration/recovery/operations and public release evidence remain separate gates. Deno is deferred and CF-22 stays paused.
