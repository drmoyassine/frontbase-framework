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
2. Review the production notices for the generated developer-key lifecycle, then deploy the relay with the registered client. Consent must explicitly cover the actual Upstash account and generated management authorization; no key belongs in chat, Git or the browser.
3. Where an existing CF OAuth grant lacks R2/Queues/Vectorize permissions, approve the necessary registration scope change and provider consent. The already authorized native build token may already have these permissions; do not reconnect or widen it unnecessarily.
4. Complete fresh live optional-resource acceptance on disposable CF/Vercel installations: discover/reuse resources, Review → Apply, administrator handoff, authenticated upload/download/list/delete, Redis round trip, QStash signed job and native Queue job/redelivery, Vectorize read/write, reload/upgrade and missing-permission refusal. Use existing eligible free resources or explicitly approved new test resources only; do not touch real Study-in-USA configuration. New recipient grants and browser password/consent steps require the owner.

The next executable action is Upstash partner registration plus consent preparation, followed by the bounded live matrix above. The source is ready for that qualification. Public-release, secure setup renewal and uninterrupted public-main native Vercel acceptance remain their separate existing gates.

### Git and handoff

Only the pre-existing/generated `examples/cf-full/api/cms.mjs` is intentionally excluded from these commits. Build staging and private local proof files remain untracked/ignored. No reset, rebase, force push or unrelated cleanup was performed.
