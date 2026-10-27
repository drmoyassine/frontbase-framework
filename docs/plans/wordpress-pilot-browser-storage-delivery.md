# Browser transition and safe S3 smoke delivery

2026-10-07; isolated managed worktree `pilot-browser-storage`, starting checkpoint `0629e80`. Primary retains architectural and integration acceptance. No live pilot state, credentials, existing browser tabs, canonical data or deployment was touched.

## Delivered scope

- `examples/cf-full/e2e/publication/browser.ts`: an isolated actual Chromium test using temporary SQLite and the same CMS factory/reviewed publication stores. The test-only bridge serves an old caching SW first, then the real emitted `/sw.js` response. A single client stays open through controller replacement. No separate renderer or production bypass.
- `examples/cf-full/test/publication-browser-mutation.mjs`: baseline plus one delivered-SW fault. Replacing the current SW delivery with a newly versioned but still-intercepting old SW must fail because the page contains stale content. This changes test delivery only; it never mutates production source.
- `examples/cf-full/src/smoke.ts`: replaces the invalid HTTP loopback S3 configuration with `https://storage-fixture.example.com`. Existing URL validation, encrypted account lookup, signing, redirect restrictions and real storage adapter remain active. The existing injected external-fetch seam maps that exact synthetic HTTPS identity to the loopback mock after validation/signing. Unexpected destinations are rejected and fixture credentials never reach the internet. An independent Node HMAC reconstruction verifies every header-signed request against its public HTTPS identity before the transport rewrite; presigned URLs retain that identity/signature and round-trip through the same deterministic transport.
- Build/package entries and the example-specific generated-directory exclusion. Browser harness output stays under `.publication-e2e/`, outside deployable `dist/`.

## Browser acceptance established

1. Old SW installs, claims and caches a stale demo. The already-controlled browser navigates to the institution route and displays that demo while the actual public host sees zero navigation requests.
2. The fixture switches `/sw.js` to the actual current host output and explicitly calls `registration.update()`. Current `skipWaiting` and `clients.claim` produce `controllerchange` without closing the old client.
3. The old cache deliberately remains, but current navigation reaches the reviewed host, carries the expected capture version/no-store and contains reviewed content with no private markers.
4. A synthetic reviewed update is visible on reload with the new hash and content. Rollback returns the original hash/content at generation 3. Missing routes stay 404; invalidated review stays opaque 503. Neither condition resurrects stale cached pages.
5. The delivered-SW retained-interception fault is RED; the normal baseline is GREEN.

This proves a local Chromium transition once an update is explicitly discovered/requested. It does **not** prove automatic update discovery timing, every historical SW variant, production TLS/CDN behavior, other browsers, offline support or live pilot activation. Staging must check normal navigation/update discovery on the intended deployed origin; no activation gate is implicitly waived.

## Verification

- Workspace `pnpm -r check` and `pnpm -r build`: pass in this isolated tree; final repeat recorded in the audit.
- `pnpm --filter @frontbase/example-cf-full test:publication-browser-mutation`: pass; baseline GREEN and retained-interception RED **1/1** with unchanged production source.
- `node .publication-e2e/browser.mjs`: actual Chromium baseline pass, including update/rollback/404/503.
- `node dist/smoke.mjs`: broad CMS smoke pass, zero failures and zero bundle skips; all eight formerly failing S3 checks pass with independent signature verification.
- `node dist/smoke-publication.mjs`: existing reviewed-host smoke pass.
- Backend `compat-security`, `providers-s3`, `compat-database-security`: pass; provider test verifies guarded probes/resolver scope/opaque errors.
- Compiler `sw-emit`: pass, seven assertions; generic emitted bundle 100.5 KB gzip. Separate `sw-no-leak`: pass, six secret/executor exclusion assertions.
- Example CF build: 510.0 KB gzip, no prohibited client symbols; Vercel 510.3 KB, Deno 511.3 KB informational. Existing chunk/static-dynamic import warnings remain.

Attempts: first browser fixture missed the required directory role and was refused; second used Container for list query and was refused. Both synthetic fixture issues were corrected before actual Chromium passed. First delivered-SW fault correctly failed the version-header assertion, but its diagnostic checker expected stale HTML; asserting HTML before version headers corrected the checker. A broad string replacement initially affected unrelated fetches/bridge handlers and was narrowed before final acceptance. No production guard was weakened. Native temporary SQLite handles can defer directory deletion to OS temp cleanup.

## Residuals / integration

The existing nine unreachable strict-conformance fixtures remain previous evidence and were not rerun or resolved here. Full source-mutation chains and credential-gated hosted/remote-store acceptance were not run: this delivery changes tests/build entries only. Production storage/auth/SW source is unchanged. No real reviews, approvals, activation, publication HTTP controls or pilot deployments occurred. This work supports primary review of the T1 local-browser gate; the primary decides what additional staging evidence is required before opening publication controls.

Broad strategy, milestones and README release scope are unchanged: R0 remains in progress, CF-22 paused. Generated host artifact drift from this tree's build is omitted from the scoped commit; the primary regenerates integrated outputs at its checkpoint.
