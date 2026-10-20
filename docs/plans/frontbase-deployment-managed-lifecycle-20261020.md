# Managed Cloudflare identity, redeploy and recovery — 2026-10-20

Implementation checkpoint: `6627a6c` on `codex/deployment-profiles`. The workspace build did not change the tracked generated CMS artifact; no artifact-only commit is needed. This isolated branch is not merged into the shared pilot checkout.

## Delivered boundary

The explicit local reviewed Cloudflare deployment flow now uses a durable, versioned nonsecret identity journal. Existing profile validation, compiler execution, native adapters and one-time loopback review remain shared; no hosted Frontbase control plane, database product, runtime driver or package is added.

Create requires known-absent named Worker/D1 and selected optional KV/private R2. Before each provider mutation, the journal records the pending operation; known results retain D1 UUID, KV namespace ID and R2 name. Final live verification adds the R2 creation timestamp, installation UUID, operation tag, active version/deployment IDs and secret names. Setup claims, session/provider secrets and administrator passwords never enter the journal. It lives in Git-ignored `.frontbase/deployments/<account>/<environment>/<worker>/deployment.json`.

Receipt updates validate a strict native-only schema, target and revision, flush a unique temporary file and atomically replace the prior receipt. A per-user machine-local account/Worker lock serializes independent local invocations across worktrees and preview/production labels. It never auto-steals a stale lock. This is local process-failure protection, not distributed coordination, a power-loss guarantee or a backup.

## Verified reuse and preservation

`--intent redeploy` restores the recorded binding choices in reuse mode. This increment requires unchanged bindings; provider/state changes remain controlled reconfiguration/migration work. Live settings must match the installation marker, D1/KV IDs, R2 name/creation timestamp, secret names and recorded active version/deployment. Split deployments and unmanaged bindings/plain variables refuse instead of being silently dropped. Another identity check runs immediately before upload.

The same compiler deploys the captured artifact with the recorded D1 ID and existing KV/R2 bindings. Its runner forbids resource creation, secret writes and other unexpected commands. `--keep-vars` preserves remote variables; the explicit installation marker is unchanged. Final verification requires the new operation tag/version, same resource identities and same secret names. Tests plus actual old session/signed-object access demonstrate preservation by this executor; metadata alone cannot detect an out-of-band secret-value change.

Live settings are read through Cloudflare's supported [Wrangler auth token bridge](https://developers.cloudflare.com/workers/wrangler/commands/general/#auth-token). CLI credentials stay in memory; fixed-origin bounded GETs refuse redirects and opaque failures. Raw settings/plain values and credentials are not returned to the UI, persisted or logged. Metadata is projected immediately into known names/IDs and the installation UUID. No private credential-file inspection or modified Wrangler internals is required.

## Recovery boundaries

`--intent resume` reconciles an upload that completed but whose final metadata verification failed. It requires the known application URL, completed recorded resource identities, matching installation/operation tag and preserved secret names. It performs read-only identity verification and updates the local journal without another deployment or secret/resource mutation.

Unknown resource-creation outcomes remain pending. Lost upload responses, unmarked partial Workers, missing receipts, unsupported bindings and older unmanaged deployments are not adopted by name. Partial-install retry, automatic enrollment, automatic migration, secret rotation and arbitrary-resource reuse are not delivered. A stale lock requires operator confirmation that no deployment is still running and reconciliation before removal.

The local lock and immediate version fence do not provide a Cloudflare API transaction or compare-and-swap against out-of-band operators/other machines. Such concurrent actions can race checks; final mismatches refuse acceptance and preserve recorded uncertainty. No automatic rollback or deletion is attempted.

## Actual disposable acceptance

Target: `frontbase-managed-20261020-a`, separately provisioned D1/KV/private R2, at `https://frontbase-managed-20261020-a.studygram-inc.workers.dev`.

- Local create review/execution: 200/200; actual resource creation and live identity recording passed.
- Anonymous pages: 401; setup claim/first administrator/login: 200; page creation: 201; publication: 200.
- Private R2 test object and native KV sentinel written successfully.
- Reviewed redeploy: 200/200; exact D1/KV/R2 identities retained, version changed, secret names retained; no secret-put or resource-create command dispatched.
- Original authenticated session still reads the same database page: 200. Original signed R2 URL returns the exact bytes: 200. KV sentinel and public page remain intact.
- A second upload intentionally throws only its final metadata observation. Local execution reports 502 and retains pending Worker uncertainty. Reviewed resume: 200/200, without another upload, resource creation or secret write.
- Original session, signed object URL, KV value and public page still pass after recovery. Setup remains locked: 410.
- Test object deletion: 200. Disposable named infrastructure, acceptance page and KV sentinel remain identifiable for follow-up.

Evidence outside Git: `lifecycle-live-public.json` contains statuses/context; `lifecycle-live-commands.json` contains command categories/status codes, never authentication output. Generated setup/admin values remain private local artifacts. No Study in USA staging, other WordPress site, existing application, DNS record or Vercel environment was changed.

## Verification

- Full `pnpm -r build` and `pnpm -r check`: PASS.
- Existing deployment gates and setup suites, real compiler/fake provider first-install guards, eight bootstrap/fourteen execution faults: PASS.
- New managed lifecycle suite: PASS, including actual launcher reuse restoration, receipt schema/revision/target checks, cross-environment locking, forbidden command refusal, remote drift, uncertainty and read-only reconciliation.
- Three transformed baselines pass; nine lifecycle/receipt/identity faults detected. Redundant command/context guards are removed together when testing their respective boundary; production safeguards are retained.
- The final immediate R2 creation checkpoint uses the same shared identity reader as later verification. Its exact actual disposable bucket timestamp was separately rechecked read-only after the refactor; missing-identity refusal and the final full setup suite pass. No additional first-install was run after that small hardening change.
- Existing server/browser no-leak check: PASS.
- Strict backend response conformance: 257 conforming / 77 verified refusals across 334 operations, zero violations/unreachable.
- Actual generated Vercel artifact check: PASS; no Vercel host call.
- Initial new receipt syntax/consistency and fault-harness failures were corrected; final relevant gates pass. No failing result is substituted by ledger regeneration.

Ten local guide/report Markdown references and fenced blocks, staged bounded credential-pattern scan and whitespace checks: PASS. The local durable journal is ignored by Git.

Retained logs: `lifecycle-build.log`, `lifecycle-check.log`, `lifecycle-setup-tests.log`, `lifecycle-deployment-gates.log`, `lifecycle-conformance.log`. This is bounded deployment lifecycle acceptance, not a clean-room public release, native host-button acceptance, full browser journey, migration/upgrade certification or universal host parity.

## Next executable work

1. Share the pre-/post-deploy Bindings editor and native storage management affordances; preserve explicit choices and define separately reviewed provider/state changes.
2. Prove actual deployment-button and independent clean-install journeys on Cloudflare.
3. Complete the isolated free Vercel state integration and corresponding reviewed install/redeploy acceptance once Marketplace setup is available. Deno remains deferred.
4. Retain controlled binding migration, broader recovery and public-release gates as separate work. CF-22 stays paused.
