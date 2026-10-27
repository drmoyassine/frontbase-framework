# Selected-bucket HTTP storage for deployment profiles

## Delivered boundary

2026-10-21. Under the owner's editable-profile requirement, the Vercel local Bindings flow now supports the existing S3-compatible HTTP adapter with an explicitly selected existing bucket. This is optional external storage, not native Vercel Blob. It adds no SDK, provider account, bucket provisioning or package. The existing fetch-only SigV4 implementation, guarded outbound transport and authenticated storage routes are reused.

The previous mapping discarded the selected bucket and exposed only a legacy environment client that storage management could not discover. The new private FRONTBASE_STORAGE configuration carries the bucket and credentials. The executor adds a stable namespace from the exact Vercel team/project/environment. The host wrapper adds the authenticated tenant and a logical files bucket. Provider discovery exposes a deployment-managed S3 provider and private files bucket through the same factory/metadata pattern used by native R2. Existing connected-account storage and native R2 keep their resolution paths.

One physical bucket can hold separate project/environment/tenant namespaces. Existing arbitrary objects in the bucket are not imported or exposed. Upload, download, signed GET/PUT, listing, folders, deletion and moves operate only inside that namespace; physical bucket create/delete/update/empty are refused. The file browser respects a can_empty capability: unsupported emptying is disabled accessibly while native R2 retains its supported action. The selected bucket must already exist, and keys must have suitable rights to it. Discovery describes the configured binding, not a successful remote existence/permissions probe or account-wide ListBuckets. A bucket's public ACL is not changed; operators must use private bucket policy for private data.

Access links are private presigned capabilities, capped at one hour. Permanent public assets and native-provider management are not provided. Direct signed S3 uploads inherit provider-side size/CORS constraints; this does not copy native R2's app-origin/HMAC proxy or bounded-stream guarantees. No credential value is included in discovery or the deployment journal. Public metadata retains configuration and credential references only; private runtime values use the existing stdin/environment handoff.

FRONTBASE_STORAGE with provider none overrides legacy STORAGE_* credentials. Malformed explicit configuration fails closed rather than falling back to an older account. The existing environment allowlist, state/session preservation and failed-plan fence are reused. A supported managed installation may add/change/disable S3 wiring; existing objects are not moved to a replacement bucket or namespace. The Cloudflare managed path still retains exact recorded bindings; this does not add general CF provider changes.

## Correct listing and safety

The S3 HTTP listing now honors limit, offset and search across continuation pages, bounded to 32 pages, a 3,000-entry request and offset 10,000. Repeated/missing cursors are refused when continuation is needed. Scoped listings reject foreign object IDs before returning them. Bucket/path validation occurs before provider access; traversal and unrelated bucket names cannot choose raw physical paths. Provider failure details are replaced with a generic error at the wrapper boundary. Endpoint validation and per-request guarding reuse the existing SSRF/redirect policy; no intended-host DNS/egress certification is inferred.

## Verification

Full workspace build and check pass on bundled Node 24. New deterministic tests cover exact bucket lowering, managed add/disable, invalid-plan refusal before host writes, stable deployment namespace, project/tenant separation, path/bucket refusal, private grants/expiry, protected bucket management, opaque errors and pagination. Authenticated backend tests use real SQLite stores, routes and SigV4 HTTP serialization against an injected protocol fixture; they verify provider/bucket discovery, multipart upload, signed download/direct upload, unknown-provider denial and cross-tenant separation.

Eleven independent source faults are detected: project namespace, tenant namespace, logical bucket fence, traversal fence, grant expiry, physical management refusal, provider-error privacy, private endpoint refusal, explicit-disable precedence, selected-bucket handoff and exact Vercel namespace. Original source hashes are preserved and restored baselines pass.

Retained deployment setup and deployment/native gates pass. Backend storage/delete/upload/provider-S3/native-R2/security/database-security/tenant/binding suites, existing SigV4 suite, 18 shared Bindings/storage UI cases, infrastructure/compiler no-leak and actual Vercel artifact gate pass. The React checklist review found no new hook ordering, fetch waterfall or dependency issue; existing menu components supply keyboard/disabled semantics. Strict conformance initially hit Windows native process exit -1073741819; the unchanged retry passes all 334 operations (257 conforms, 77 product-verified refusals, zero violations/unreachable). The earlier type-check attempt preceded rebuilding changed dependency declarations; after dependency/full build, the full check passes. One protocol fixture initially rejected the valid bucket-level listing path and was corrected without relaxing the selected-bucket check.

The credential-gated storage-live suite explicitly skips because no external S3 test credentials are configured. Injected HTTP fixtures do not establish acceptance on AWS, R2's S3 endpoint, B2, MinIO or other operators. No external S3 object was read/written, no key was retrieved, and no remote bucket was created or removed.

The final source, including capability-aware console menus, is deployed to the existing approved disposable preview at `https://frontbase-fresh-261020-72eeytk3f-mohamads-projects-f742d79e.vercel.app`. Original-session before/after checks return 200, saved pages are byte-identical, published content remains 200 and owned binding metadata retains the exact Turso resource with storage disabled. The executor confirms actual READY preview/project/team before success. This proves runtime boot and session/page/state preservation with explicit storage disable; it is not live S3 activation. No production, shared Study in USA/translation or other WP deployment is included; CF-22 remains paused.

## Handoff and remaining work

Evidence logs outside Git use storage-bindings-*, storage-test-deployment-*, storage-backend-*, storage-sigv4.log and storage-conformance-retry.log. Failed native/type-check attempts remain separate from successful reruns. Private session/response files are not publication artifacts. Local source remains a reviewable uncommitted candidate; no package or public release is claimed.

Next: owner-selected real HTTP provider acceptance with scoped test credentials, then broader deployment drift/failure recovery and the remaining button/clean-install gates. [Deployment plan](frontbase-deployment-profiles-20261020.md), [prior optional-binding lifecycle](frontbase-deployment-optional-bindings-20261021.md) and [R0 release backlog](../history/PUBLIC-RELEASE-R0-2026-10-21.md) retain their separate boundaries.


## Committed checkpoint — 2026-10-21

Deployment source/tests are committed as 36358fc; verified generated Vercel artifact is separately committed as 07ab430. The owner requests normal branch push. Older uncommitted-state descriptions above are dated execution checkpoints, superseded by this handoff. No claim that the complete new commit was deployed to the private native test copies, no public release/merge and no CF-22 activation. Source/artifact/no-leak verification and remaining native/provider gates are recorded in the audit.
