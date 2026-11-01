Current follow-up: [Connected-provider roadmap](connected-provider-roadmap-20261101.md) records the owner action to contact Upstash partnerships, the missing hosted Turso Connect/discovery/create flow, and proposed CF/Vercel/Supabase extensions. Those proposals are not delivered binding acceptance or new release gates.

# Shared binding provider discovery — 2026-11-01

Owner request: add R2/Supabase Storage, Cloudflare Queues, Upstash authorization for Redis/QStash, authenticated resource dropdowns, and accurate credential guidance. Preserve configured installations and manual HTTP adapters.

## Scope and order

1. Reuse authenticated resource discovery with bounded server-only provider calls, account ownership validation and truthful errors; no resources are created during discovery or Review.
2. Wire native R2 into hosted Apply; add Supabase Storage using the existing REST adapter and installation/tenant storage namespace. Bucket selection is read-only; private buckets only.
3. Add Cloudflare Queues via the existing job envelope, authenticated receiver and retry/idempotency path. Existing unrelated consumers cannot be replaced.
4. Extend the existing OAuth/relay/vault for Upstash; choose Redis resources and QStash credentials server-side. Preserve manual credentials. Upstash client registration and consent remain authorization-dependent; no speculative claim of live acceptance.
5. Verify contracts, shared UI, host lowering/lifecycle, isolation, no-leak and mutation gates; workspace check/build. Record exact live limits, then commit/push verified source. Generated cms.mjs remains excluded.

## Provider evidence

- Upstash documents Connect Upstash OAuth and requires contacting its partnerships team for a client ID/callback registration: [partnership guide](https://upstash.com/docs/redis/help/integration). No registration or email is authorized by this implementation request.
- Upstash Developer API uses an account email/API key after OAuth exchange: [Developer API authentication](https://upstash.com/docs/devops/developer-api/authentication). Runtime Redis/QStash credentials remain distinct from management authorization.
- Cloudflare resource APIs: [Queue inventory API](https://developers.cloudflare.com/api/resources/queues/methods/list/). Existing provider permissions may need a new consent; never silently widen a grant.

## Acceptance

Implementation is committed separately: `1ee153fa` (Upstash authorization and encrypted installed-account handoff) and `29ae5d0f` (resource discovery, shared wizard, storage, native queue and conformance tests). Existing Study-in-USA/source data and the owner-unconfigured wizard were not changed. No cloud resource, grant, paid product or provider registration was created in this work.

### Delivered behavior

- Hosted native R2 create/reuse; default-jurisdiction bucket discovery and public-bucket refusal. R2 S3 HTTPS option on every supported target reuses SigV4 and still needs S3-specific keys.
- Supabase Storage project/private-bucket picker, private runtime-key materialization and the existing REST adapter behind installation/tenant namespaces. Modern and legacy API-key formats; file UUID listing normalization; replacement uploads. Provider-fixed two-hour direct upload grants are deliberately unavailable for this one-hour-capped binding; normal authenticated uploads remain available.
- One conditional Connect Upstash flow for Redis and QStash. The documented partner OAuth exchange creates and verifies a developer API key; temporary identity/refresh tokens are discarded. The persistent developer authorization is encrypted in the existing store, imported into installed Connected Accounts, and governed by Upstash's own lifetime/revocation rules. Redis and regional QStash picks resolve distinct runtime credentials server-side. Registration is not complete, so no live OAuth claim is made.
- Native hosted Cloudflare Queue create/reuse, exact producer/consumer activation and real Worker event handling through the existing private, tenant-scoped receiver. Occupied queues are refused during Review. Success acknowledges; failed delivery retries. Local Wrangler does not advertise this new native queue executor.
- Account/resource dropdowns for connected CF D1/KV/R2/Queue/Vectorize, Supabase projects/private buckets and Upstash resources. Vectorize re-probes the exact account/index at Apply instead of trusting stale optional capability metadata or requesting another token. Missing permissions remain a provider refusal, not a silent scope expansion. Failed/unavailable discovery cannot advance the step.
- Provider-specific credential copy distinguishes encrypted retained connections from unsaved manual credentials. Manual profiles, existing configuration, tenant/owner/origin/CSRF/SSRF/no-replay fences and generated-artifact exclusion are preserved.

### Verification

PASS:

- `pnpm -r build` and `pnpm -r check` on the final source. CF artifact 790.6 KB gzip, within 1024 KB; Vercel artifact 1040.4 KB within the existing 4096 KB internal budget. Client no-leak build check passes. Existing chunk-size/dynamic-import advisories remain informational.
- `pnpm --filter @frontbase/console test:deployment-bindings`: 38 tests, including actual next-step navigation after private-bucket selection, API resource dropdowns, discovery failures and manual fallback.
- `pnpm test:binding-providers`: new read-only account/resource, modern/legacy keys, encrypted Upstash handoff, storage/tenant/path, credential-confusion and region tests; eight independent source faults; actual compiled native queue delivery and two artifact faults.
- OAuth functional suite and all 16 OAuth mutations; full `pnpm test:provider-oauth-relay` including 12 receiver, 26 relay and 15 native Vercel faults. One Windows child timed out under concurrent compilation with no diagnostic; the unchanged-source isolated mutation run passed all 16. No assertion or timeout was weakened.
- `node examples/cf-full/test/hosted-cloud.mjs` and its eight mutations: both target lifecycle fixtures, metadata activation, optional native resources, private-bucket/occupied-queue refusal before provisioning, retained secret client configuration, concurrency and no replay.
- `pnpm test:native-cloud-setup`, `pnpm test:hosted-bootstrap`, `pnpm test:deployment-setup`, existing system-services/system-queue suites, deployment storage/profile tests and all 11 storage mutations.

All provider calls in the new acceptance/mutation tests use bounded synthetic transports. The native queue test runs the compiled actual Worker entry with a local state fixture. These are not fresh live optional-provider/native-button proofs. Pre-existing independent live deployment evidence is not re-labelled as acceptance of these new bindings.

### Authorization-dependent work, deliberately left until the end

1. Obtain/register the Frontbase Upstash partner client as described in its official integration guide. Register `https://oauth.frontbase.dev/api/provider-oauth/upstash/callback`, confirm the permitted client/scopes and developer-key response contract, and add its client ID/secret privately to the relay. No partnership email, agreement or registration has been sent/accepted. Self-hosted operators may instead register their own direct client.
2. Review the production notices for the generated developer-key lifecycle, then configure the registered client on the already updated production relay. Consent must explicitly cover the actual Upstash account and generated management authorization; no key belongs in chat, Git or the browser.
3. Where an existing CF OAuth grant lacks R2/Queues/Vectorize permissions, approve the necessary registration scope change and provider consent. The already authorized native build token may already have these permissions; do not reconnect or widen it unnecessarily.
4. Complete fresh live optional-resource acceptance on disposable CF/Vercel installations: discover/reuse resources, Review → Apply, administrator handoff, authenticated upload/download/list/delete, Redis round trip, QStash signed job and native Queue job/redelivery, Vectorize read/write, reload/upgrade and missing-permission refusal. Use existing eligible free resources or explicitly approved new test resources only; do not touch real Study-in-USA configuration. New recipient grants and browser password/consent steps require the owner.

The next executable action is Upstash partner registration plus consent preparation, followed by the bounded live matrix above. The source is ready for that qualification. Public-release, secure setup renewal and uninterrupted public-main native Vercel acceptance remain their separate existing gates.

### Git and handoff

Only the pre-existing/generated `examples/cf-full/api/cms.mjs` is intentionally excluded from these commits. Build staging and private local proof files remain untracked/ignored. No reset, rebase, force push or unrelated cleanup was performed.


### Promotion and production relay receipt

The three commits were pushed to `codex/binding-provider-discovery-20261101` and fast-forwarded into `main` through `aa312631`. `node scripts/deployment-buttons.mjs --verify-source` returned `ok: true`, source `main`, both CF/Vercel buttons valid and no failures. This verifies button source wiring, not fresh deployment acceptance.

The existing `frontbase-oauth-production` Worker received a code-only update using its existing D1 (`f8c81e62-7fdd-4b95-a5e5-08148e0112bc`) and `keep_vars: true`. Deployed version: `837d209c-74ed-409b-af34-57571be7b0aa`. Public `/health` returned HTTP 200 with Cloudflare, Vercel and Supabase configured. Upstash remains unconfigured/unavailable, as required until partner registration and consent. No provider registrations, scopes, grants, paid products or application bindings were created or changed. Private deployment output is ignored under `.frontbase/`; no secret output was emitted. This receipt does not replace the pending fresh optional-provider matrix.

## Live follow-up and repairs — November 1

Frozen runtime source: `d3f160444016ba6738335a2767be5a8207377cce`. Three separate repairs: installed discovery `1f58991c`, Vectorize REST compatibility `90c94ad1`, and its read-only connection probe `d3f16044`.

### Reproduced defects and fixes

- The installed Bindings dialog mounted the shared editor without its retained connections or discovery base. It now reads authenticated connection status before mounting, uses the existing `/api/provider-resources` router and preserves reference-only proposals. A delayed response cannot overwrite in-progress edits; closing cancels mounting; unavailable discovery retains a clear manual-reference fallback. This is not after-install Apply or state migration.
- The old Vectorize adapter's legacy describe returned HTTP 400 for a real v2 index while v2 describe returned 200. Current requests now use v2 NDJSON `values` writes and `returnMetadata: all`. Read-only v2 404 detection permits legacy-index lookup. Permission, rate-limit and transport failures never downgrade; writes are not automatically replayed. Explicit provider refusal cannot count as success.
- Vectorize Test connection attempted a two-dimensional write, incompatible with current fixed-dimension indexes. It now describes the actual index without mutating it; LibSQL retains its existing round trip. The read-only test does not certify write permission.

### Actual cloud evidence

| Surface | Result and precise boundary |
| --- | --- |
| Native Git upgrade, CF | Clone commit `05f750e4bfae78e6f7a990ccb8ab7eaa5f5d62d1`; Workers build `611f8312-bb11-40e3-8604-c4ab35f8894d` succeeded; active version `92c7c932-e242-4f78-92f5-a4da1d03646c`. Existing HTTP-state schema and administrator retained. |
| Native Git upgrade, Vercel | Clone commit `4a09d4aaaef9fe6d98a8ca948b976fa7ce2976f1`; native Git deployment `dpl_C2bo5aawrBPnQahkWJz8EUAh9LoT` succeeded. No CLI source upload. Existing Vercel and Supabase installed-account tests both report Connection verified. |
| Shared discovery in real Chrome | Both installed CF/Vercel dialogs offer R2 and Supabase Storage and fetch the authorized Supabase projects and private bucket `staging`. Vercel bucket selection enables Next. CF's inherited native grant additionally lists all four real R2 buckets. Proposals were discarded; neither HTTP-state app's live bindings changed. Desktop and the restored narrow Chrome window both render the shared form. This is resource-picker acceptance, not optional-binding Apply. |
| Native R2 bytes on CF | Existing disposable `frontbase-handoff-261031`, final runtime version `e758863a-0c5e-4e7c-8c1c-51b30445dba1`, reuses private bucket `frontbase-native-r2-20261020-storage`. Authenticated Unicode upload, normalized listing, signed download and exact bytes pass. Tampered capability and anonymous API access are refused. Only the synthetic test file was deleted and its absence verified. |
| Native Queue on CF | New disposable `frontbase-bindings-261101`, ID `35f1332ee7e44499958a4eef463ab6ae`, is bound only to that existing runtime fixture. Anonymous callback is 401; the private secret reaches the existing idempotent receiver. Exactly two synthetic sends produced five successful one-message Queue events with no exceptions, consistent with one valid acknowledgement plus the malformed envelope's four bounded attempts (three retries). Actual compiled-entry acknowledgement/retry mutations also pass. No user workflow was dispatched. Temporary tail stream closed. |
| Vectorize | New disposable 32-dimensional cosine index `frontbase-bindings-261101`. Original approved test token, used locally: current adapter describe, one upsert, eventual Unicode/text search and deletion accepted. The initial 30-second visibility window elapsed; a subsequent read confirmed the asynchronous mutation without repeating the write. The actual final CF runtime's read-only connection test returns 200/success. This does not claim a Vercel runtime vector write. |
| Permission/failure fences | The older CF fixture's narrower retained token cannot list R2 and returns an actionable sanitized 502; no grant was widened. Its Queue/Vectorize lists succeed. Foreign account and anonymous discovery are refused (403 owner fence); anonymous storage is 401. The native CF build grant lists R2 successfully through the same router. |
| Upgrade/public security, both hosts | `/http-state-cloudflare-acceptance` and `/http-state-vercel-acceptance` return 200 with their saved Arabic text; anonymous pages API is 401; bootstrap is 410; administrator setup remains initialized/closed. CF runtime fixture D1 `22b3e10c-6d2b-4741-9b23-59883c9d1995` and KV `10ef108ae8a04147878a7bf53a0f3766` are unchanged. |
| Production relay | Existing service remains healthy (200), configured for CF/Vercel/Supabase. Upstash remains absent until registration. No client, grant or scope change. |

These two HTTP-state apps were upgraded from their already accepted installations. This follow-up does not relabel them as fresh optional-provider native-button installations. The R2/Queue runtime fixture was configured through CLI for bounded runtime qualification, separately from hosted Review → Apply. Real Study-in-USA apps, source records, DNS and settings were untouched. An older `frontbase-native-handoff-261031` fixture was already HTTP 500 at baseline and excluded. Read-only inspection confirms its bound D1 `61405998-3d19-43e5-98c9-0790c9b29d56` is absent from the account inventory; the retired resource was not recreated or reset, and this fixture was not used as passing current-source evidence. An obsolete Vercel Git copy returned 404 and was likewise not modified.

### Final verification and remaining executable work

PASS: final workspace `pnpm -r check` and `pnpm -r build`; CF artifact 790.8 KB gzip and Vercel 1040.7 KB within their existing budgets; client no-leak gate. Shared UI suite: 40 tests. Expanded `pnpm test:binding-providers` passes its existing discovery/OAuth/storage/native-queue gates, eight provider faults and two Queue entry faults, plus vector contracts and five new Vectorize faults (current API path, NDJSON values, metadata mode, permission downgrade, provider refusal). Existing backend system-services suite passes the read-only fixed-dimension probe and retained cache/queue/LibSQL behavior. No assertions, timeouts or security boundaries were relaxed.

Remaining:

1. Owner obtains the Upstash partner OAuth client; configure it privately on the existing production relay, then complete real account consent, Redis runtime round trip and signed QStash delivery. The [exact owner steps and copyable request](../guides/deployment-binding-providers.md#activate-connect-upstash) are recorded. No partnership email or registration was sent on the owner's behalf.
2. Fresh optional-binding Review → Apply/administrator acceptance is still separate from these installed-picker and runtime checks. R2 S3-over-HTTPS on Vercel needs a suitable test S3 credential; management OAuth is not an S3 signing key. Supabase private-bucket discovery is live-qualified on both hosts; actual new deployment-bound Supabase file bytes and full host matrix remain unverified. Do not label these as passed from synthetic transports or from R2 byte tests.
3. Broader secure setup renewal, uninterrupted fresh public-main Vercel journey, independent-account operations and Developer Preview release gates are unchanged.

Claims for these bounded repairs are released after documentation/push reconciliation. Generated `examples/cf-full/api/cms.mjs` remains intentionally unstaged. Private fixture credentials, raw tails and setup links stay ignored under `.frontbase/`; new test Queue/index and original test bucket remain available for qualification.
