# Native private Cloudflare R2 binding — 2026-10-20

## Delivered boundary

Reviewed Cloudflare first-install setup can optionally create and bind a new private R2 bucket alongside its new Worker/D1 and optional KV. R2 stays disabled by default; selecting create uses the fixed Worker-derived name. Existing resources, uncertain absence, wrong names/targets and failed creates refuse execution. All absence checks precede resource creation; failures preserve resources and nonsecret name/binding receipts rather than adopt or delete them.

The native adapter implements the existing StorageProvider. A host-only StorageProviderFactory resolves each authenticated tenant into a distinct physical key prefix inside the bound bucket. File Storage discovers an immutable native provider and a private logical files bucket. Existing multipart upload, list, signed-download, folder, move, delete and empty routes use that same resolver; RAG byte access shares it. Existing connected providers keep their credential resolution and explicit provider IDs do not silently fall back. Configured static storage retains default precedence. No new datasource, database, package, SDK, S3 key or hosted control plane is required.

A framework-authenticated POST /api/storage/upload-url issues PUT access through that same provider contract. Existing default-deny authentication gates issuance; native provider removal is refused. Physical bucket create/delete/public settings remain deployment-managed, not application-managed; generic bucket management actions are refused for the bound bucket. This is not complete provider-management UI parity.

## Private access model

R2 bindings provide object operations, while S3 presigning requires the S3 API ([Cloudflare API reference](https://developers.cloudflare.com/r2/api/)). Native access therefore uses the application's /_frontbase/storage/object endpoint with two-part HMAC capabilities. It follows the existing Web Crypto signing pattern with a distinct domain separator; capabilities are not session JWTs. The existing persisted/host session secret supplies key material, so its rotation invalidates outstanding URLs.

Signed fields bind the authenticated tenant, logical bucket, exact object key, app origin, HTTP method and expiration; PUT also binds content type. Verification precedes any provider access. Missing, duplicate, tampered, expired, wrong-origin and wrong-method tokens fail closed. No public R2 domain is enabled. URLs are bearer grants, reusable until expiry, with a fifteen-minute default and a one-hour maximum. They are private credentials and should not be logged or used as permanent published asset URLs. Durable public asset serving is not delivered by this slice.

Native transfers default to 10 MiB. PUT streams are counted and cancelled as soon as they exceed the limit, even without Content-Length; the library host option is bounded to 100 MiB. GET responses use private/no-store, no-referrer, nosniff, attachment disposition and sandbox CSP so an uploaded HTML/SVG document cannot become same-origin active content. Provider exceptions are opaque. The native list/delete loops are bounded; large operations can refuse rather than claim unbounded completion. No per-grant revocation ledger, multipart large-object protocol, native public-bucket support or automatic migration is claimed.

## Actual disposable acceptance

- Worker: frontbase-native-r2-20261020.
- D1: frontbase-native-r2-20261020-db.
- R2: frontbase-native-r2-20261020-storage, binding FRONTBASE_R2.
- KV: frontbase-native-r2-20261020-cache, ID 054cf03835b24a1eb0fde9fdd4879704, binding FRONTBASE_KV.
- App: https://frontbase-native-r2-20261020.studygram-inc.workers.dev.

The real reviewed local setup API returned prepare200/deploy200. Known-absent R2 preflight matched the pinned provider's exact bucket-not-found code; R2/KV/D1 creation, private secret transport and Worker deployment succeeded. Anonymous pages401; setup claim200; first administrator200; repeated setup410; login200; native KV card200; page creation201/read200 and actual tenant-prefixed KV write passed.

On the live application: native R2 provider discovery200, private logical bucket200, anonymous upload-grant denial401, browser-contract multipart upload200, signed download200 with exact bytes/CSP, file listing200 with the expected object ID, tamper denial403, authenticated PUT grant200 and signed PUT200, wrong-method denial403, short grant followed by expired denial403, authenticated object deletion200 and deleted-object download404 passed. Page publication200 and public page200 still pass. Test upload objects were removed; the new named infrastructure and published acceptance page remain identifiable for follow-up.

Only freshly generated credentials for this disposable application were used. Private setup capabilities, administrator credentials, signed URLs and provider traces remain outside Git and are not printed in public evidence. No existing site, Study in USA staging, other WordPress site, DNS record or Vercel environment was modified. This is actual API/provider acceptance, not a claim of a completed browser-button or management-UI journey.

## Verification

- Full pnpm -r build and pnpm -r check: PASS.
- Adapter scoped CRUD/list/folders/move/empty and opaque failures: PASS.
- Real backend discovery, multipart upload, native listing IDs, signed GET/PUT issuance, tenant isolation and explicit-provider refusal: PASS.
- Six R2 access faults detected after a passing transformed baseline: signature, tenant namespace, origin, method, expiration and bounded streaming.
- Existing deployment gates and setup suites: PASS; fourteen execution faults include independent KV and R2 known-absence/create guards, with transformed baselines passing first.
- Existing S3 SigV4, static storage, upload, deletion and provider resolver regressions: PASS.
- No-leak: PASS; backend response conformance: 257 conforming /77 verified refusals, zero violations/unreachable.
- Actual generated Vercel artifact verification: PASS, including default.fetch import and byte-identical staged function. No new live Vercel deployment is claimed.
- Whitespace: PASS. The CMS artifact is synchronized; prior general build-reproducibility observations remain open.

Task evidence logs: native-r2-build.log, native-r2-check.log, native-r2-deployment-gates.log, native-r2-setup-tests.log, native-r2-existing-storage-tests.log and native-r2-conformance.log. Native package distribution/type-consumer and full release gates are not closed by workspace verification.

## Next executable work

1. Durable resource identity and reviewed reuse/redeploy/resume; preserve D1 state, cached namespace and private objects, with explicit ownership/partial-failure checks and controlled migration.
2. Shared pre-/post-deploy Bindings form, native storage management affordances and exact deployment-button acceptance. Preserve explicit user overrides; do not equate a profile recommendation with an enforced provider.
3. Vercel free state integration and matching fresh-install/redeploy acceptance once Marketplace setup is complete. Deno remains deferred; public release and paused CF-22 gates remain unchanged.
