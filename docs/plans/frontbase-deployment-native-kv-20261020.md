# Native Cloudflare KV deployment binding — 2026-10-20

## Delivered scope

The local deployment profile can create and bind a new KV namespace alongside a new Worker and D1. The host passes the existing KV cache adapter into both existing system-service resolver instances. Registry-adopted cache defaults retain priority; explicit FRONTBASE_CACHE or FRONTBASE_CACHE_URL configuration retains priority over native defaults. Every native operation stays inside the existing tenant-prefix and resilient-fallback wrappers. Vercel does not offer this native adapter.

The first-install launcher derives the namespace name from the fixed Worker name. Before mutations it checks Worker/D1 absence and a successful, valid full namespace listing. Existing exact-name namespaces, failed/unknown preflight, failed create or an unparseable provider identity refuse execution. No lookup/adoption fallback is allowed. The isolated Wrangler configuration receives FRONTBASE_KV only after successful creation; the nonsecret receipt records name, ID and binding. Resources survive failures. This is not durable concurrent deployment locking, reuse, redeploy or resume.

The shared profile now offers native KV with a fresh environment-specific default name. R2 remains nonselectable and disabled: creating a bucket alone would not satisfy the existing storage provider's signed URL contract. Existing HTTP adapters remain selectable where compatible; the bounded CF execution launcher still accepts only its implemented native create operations.

## Cache semantics

Cloudflare KV requires physical expiration TTLs of at least 60 seconds ([provider documentation](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)). A versioned value envelope now enforces the requested shorter logical expiration, including when another isolate reads an expired value still physically present. Legacy raw values remain readable. Reads return fresh parsed objects. Failed writes/reads use the existing per-tenant memory fallback.

KV is an eventually consistent best-effort cache. Its existing increment is not atomic, and keys() is only an isolate-local hint. This slice does not introduce KV as an authentication, rate-limit, queue or coordination authority, or promise free-tier usage will never exceed quotas.

## Actual disposable acceptance

- Worker: frontbase-native-kv-20261020.
- D1: frontbase-native-kv-20261020-db.
- KV title: frontbase-native-kv-20261020-cache.
- KV ID: 121f87e74c19487984dbb9a792225914; binding FRONTBASE_KV.
- URL: https://frontbase-native-kv-20261020.studygram-inc.workers.dev.

The real local setup API reviewed and executed this manifest (prepare200/deploy200), using the existing compiler executor and pinned authenticated Wrangler. Native KV and D1 creation, private secret writes and Worker deployment succeeded. Anonymous pages401, first setup claim200, administrator creation200, locked repeat setup410, login200, native cache card200, page creation201 and page read200 passed. A provider key listing in this new namespace proves the real application's tenant-prefixed enrich:datasources entry was written by the authenticated page read. Page publication200 and public /native-cache-check200 passed. No test-only Worker endpoint was added.

Only freshly generated credentials for this disposable application were used. Setup link/password and raw provider output remain private outside Git; public task evidence contains statuses/context only. Existing Cloudflare deployments, Study in USA staging, other WordPress sites, Vercel environments and DNS were untouched. The test resources are retained for inspectable follow-up; they were not deleted.

## Verification

- Full pnpm -r build and pnpm -r check: PASS.
- Existing deployment setup suites: PASS, including twelve execution faults and eight bootstrap faults. Two additional execution faults prove KV collision and failed-create guards.
- Full deployment gates, profile contracts and existing cache/cache-remote suites: PASS.
- New native KV TTL, legacy/fresh-copy, tenant, outage and registry/HTTP-override tests: PASS; registered in backend tests and deployment CI gates.
- Five native KV faults detected after passing transformed resolver/adapter baselines: tenant prefix, native injection, registry precedence, logical expiry and physical TTL floor.
- Existing system-services suite and no-leak gate: PASS.
- Backend response conformance: 257 conforming /77 verified refusals; zero violations/unreachable.
- Whitespace: PASS.

Nonsecret logs in the task evidence directory: native-kv-build.log, native-kv-check.log, native-kv-deployment-gates.log, native-kv-setup-tests.log, native-kv-system-tests.log and native-kv-conformance.log. The tracked generated CMS artifact is synchronized with this build. This is bounded implementation/host evidence, not clean-button acceptance, Vercel parity, complete profile delivery, or public availability.

## Next executable work

1. Native R2 adapter and authenticated/signed upload/download serving, using the existing StorageProvider and auth/token patterns. Do not expose a public bucket or claim support from a provisioning-only resource card.
2. Durable resource identity, reviewed reuse/redeploy/resume and controlled state migration.
3. Shared pre-/post-deploy Bindings form and actual CF/Vercel button acceptance. Vercel free state provisioning remains gated on Marketplace setup; Deno stays deferred. CF-22 remains paused.
