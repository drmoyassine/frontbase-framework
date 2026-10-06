# Garage storage integration for the WordPress pilot

Status (2026-10-05): deployed single-node pilot and authenticated Frontbase transfers verified. Off-VPS local object restore passed. Twelve reviewed images now use Garage with canonical Supabase references (eleven ELS institution images and one Muhlenberg program cover). Refreshed local cards/details render those images; all 310 original listing paths passed. Owner deferred scheduled external/full-volume backups; production durability, remaining media completeness and live publication remain unverified.

Garage supplies object storage; [garage-webui](https://github.com/khairul169/garage-webui) supplies its management UI. This remains an optional, admin-connected S3 service, outside Frontbase's six packages and independent site engines. Supabase retains canonical content rows and media references.

## Deployment requirements

- Dedicated Garage service with persistent metadata and object-data volumes, pinned engine and UI versions, and documented recovery credentials kept outside Git.
- HTTPS S3 endpoint for signed requests; configured region must match Garage (normally `garage`). Separate HTTPS public-media routing through Garage's website service.
- Protected management UI with authentication; keep the Garage admin API and RPC ports internal. Do not publish them directly.
- Separate buckets and restricted access keys for each site. Public media contains reviewed assets only; recovered source evidence and backups stay private.
- External backups and a demonstrated restore. One VPS remains a single failure domain; three containers on that VPS do not provide independent redundancy. A single-node pilot is not a verified production durability setup.

## Existing Frontbase integration findings

`packages/backend/src/compat/routes/storage.ts` resolves encrypted connected-account S3 credentials and passes endpoint/region to `sigv4StorageProvider` in `packages/edge-infra/src/storage/providers.ts`. Authenticated upload/download, exact-byte readback, prefix listing, server-side copy/delete, plain-fetch signed GET/PUT and probe cleanup passed through the real adapter. A multipart upload through the authenticated full CMS also passed.

The adapter now accepts explicitly bucket-scoped public URL bases; connected accounts expose optional `public_bucket` and `public_base_url` fields in the existing console. Other buckets retain their S3 endpoint URLs. This maps addresses only and grants no anonymous permission. Garage public websites use separate routing, so entering an S3 endpoint alone remains insufficient. Bucket visibility returned by the adapter is not verified against Garage's permission model. Garage does not implement S3 ACL/bucket-policy controls; manage actual grants through Garage rather than assuming the console's public flag enforces them.

## Acceptance before media import

1. Inspect the connected EasyPanel server and agree target endpoint/media domains.
2. Prepare and deploy the bounded storage stack without changing existing applications.
3. Verify signed upload/download, list, copy/delete, content types, browser upload CORS and key restrictions through Frontbase.
4. Verify public URLs resolve only approved public objects, while private buckets and management APIs reject anonymous access.
5. Demonstrate restart persistence and an external backup restore, then import reviewed media and update canonical references under guards.

Reference: [Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/) and [S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/). The deployed pilot pins Garage v2.3.0 and garage-webui 1.1.0; external restore and browser CORS remain unverified. This proposal does not change public-release scope or remove the Directory publication guard.

## Pilot evidence and operational boundary

- EasyPanel project `studygram`, Compose service `studygram_media_garage` on the separate VPS. Persistent named metadata/data volumes retained across bounded redeployments. No host port publishing was added; RPC 3901 and admin 3903 remain internal.
- Signed S3 endpoint: `https://s3.studygram.me`, region `garage`, bucket `study-in-usa-media`. The supplied key permits read/write, but website configuration returned `AccessDenied`; do not broaden that runtime key for administration.
- Management UI remains `https://media.studygram.me/`. Added website listener 3902 and the final public image route `https://s3.studygram.me/public-images`, with bucket global alias `s3.studygram.me` and middleware `garage-usa-images-prefix` stripping `^/public-images`. Public uploads have a separate browser origin from the management UI. Reserve the S3 path prefix `public-images`; do not create an S3 bucket with that alias on this endpoint. The initially attempted automatic EasyPanel image hostname had an expired certificate, so it was replaced without disabling TLS validation. Website access is enabled only on the empty USA image bucket. The earlier `/images` route on the management hostname was replaced, and a separate readback confirmed the management root still routes to webui 3909 and the signed S3 root to Garage 3900. A versioned Compose config mount (`garage_config_web_v1`) was needed to recreate the Garage container with the new listener; its persistent metadata/data volumes were retained. The bucket key and website settings persisted after recreation.
- The real full CMS runs locally at `http://127.0.0.1:4389/frontbase-admin`, with its own state DB, random local administrator and session secret outside Git. It is separate from the fixed-principal fixture drawer preview. S3 account data is encrypted (`enc:` envelope); direct DB inspection found neither access key nor secret in plaintext. API account output is redacted.
- Live proof: `scripts/migration/verify-garage.mjs`, using three owner-local file arguments (credentials, local login, safe report), plus an optional fourth public base URL argument. Protected `garage-deployment/frontbase-storage-verification.json` records the successful run. All temporary test objects deleted; a separate bucket listing returned zero objects. Anonymous S3 GET returned 403; anonymous public PNG GET returned 200, `image/png` and identical bytes through the full CMS public-URL mapping. No recovered WordPress media was uploaded or made public.
- Plain Node fetch signed GET/PUT succeeded without a browser User-Agent override; the earlier Python default User-Agent Cloudflare rejection does not establish a Node adapter failure. Browser-origin CORS has not been proven.
- Reusable implementation uses existing encrypted connected accounts, storage resolution, provider-test strategy and console registry. Guarded S3 transport enforces the existing HTTPS/private-address/redirect policy for tenant-connected accounts. Tests cover unsafe endpoints, redirect rejection, opaque errors, account ownership and bucket-scoped URL mapping. This does not implement the Directory publication runtime or accept a new site-configuration architecture.

Next: establish external backup/restore, review and stage the original/official raster assets, and perform guarded canonical reference updates. Keep recovery evidence and backups outside this public bucket. Before production durability claims, demonstrate an external backup restore.

## Verification of this increment

- `pnpm -r check`: exit 0 after the final source/type changes.
- `pnpm -r build`: exit 0; existing chunk-size/dynamic-import warnings remain. Generated `examples/cf-full/api/cms.mjs` refreshed by the required build.
- `node packages/edge-infra/test/storage-sigv4.mjs` and `node packages/backend/test/providers-s3.mjs`: exit 0.
- Existing backend `compat-security`, `compat-tenant-matrix` (175/175 isolated operations), `secret-cipher` and edge-infra `no-leak`: exit 0.
- Existing mutation harnesses: backend 24/24 and edge-infra 6/6 proven red on break; exit 0.
- Existing `compat-conformance`: exit 0, 248 conforms, 0 violations, 9 unreachable fixtures and 77 product-verified refusals across 334 operations. Unreachable operations are not passes; these results do not imply complete parity or close public-release gates.
- Final live report: authenticated local full CMS, guarded S3 probe, redacted account APIs, multipart upload, exact-byte adapter readback, copy/delete, listing, signed GET/PUT, public PNG, anonymous signed-S3 denial, and complete probe cleanup all passed.
- Browser CORS, external backup restore, original asset safety/completeness, canonical media reference changes and deployed Directory publication remain unverified. No live Supabase writes or production site cutover occurred in this increment.

All work remains uncommitted on `codex/wordpress-pilot`; unfamiliar changes were preserved. Release strategy, accepted architecture and CF-22 status are unchanged.

## Recovery proof and media preparation (2026-10-05)

Disposable object recovery passed through the built SigV4 adapter. A PNG was uploaded, downloaded into a private local backup directory outside the VPS, and recorded with its size, MIME type and SHA-256. The remote original was deleted and its absence verified. A fresh process path read the saved manifest/bytes and restored into a different key; exact bytes, content type and anonymous public readback passed. An intentionally corrupted copy failed checksum validation before upload. Both remote probe keys were deleted and a scoped listing confirmed cleanup. The backup PNG and manifest remain local. This is an object restore proof, not complete Garage disaster recovery or a scheduled backup.

Protected evidence: `garage-deployment/verify-object-restore.mjs`, `object-restore-verification.json`, and `object-backups/c8a7e08c-7c22-4d03-a068-9e16ed62d57a/`. No account credentials or signed URLs are in those reports. The source and restored keys contained only disposable test data.

EasyPanel `listVolumeBackups` returned an empty list for `studygram/studygram_media_garage`. Its `listVolumeMounts` procedure returned HTTP 400 because the service is Compose rather than an app/box. This limits that API; it does not establish that the named volumes are absent. The metadata/data volume existence remains supported by the earlier container inspection. No backup schedules or volume restore have been created or tested.

The recovered Muhlenberg program 46188 cover was visually inspected, PNG-verified, fully decoded and re-encoded as a fresh RGB image with metadata stripped. Dimensions remain 1120 x 630. Original SHA-256: `4024b4d119f5ae8101988abcacfdecd372a85c3213ded3ba27264cda47183024`; clean copy: `82fd87320f0886b560984f65ad5ad01f00562c2095cde1ea28cb3f538bdbf412`. The sanitized copy was decoded/verified and visually inspected again. Protected `garage-deployment/reviewed-media/media-review.json` records provenance and the untouched original is retained. This limited raster process does not certify the recovered archive as malware-free. No recovered image was uploaded; no Supabase media reference changed.

### Prepared next recovery work

An owner-selected off-server destination is required before configuring scheduled backups. It must be private and separate from the Garage VPS/public USA bucket. Plan both named volumes (`garage_metadata` and `garage_data`) and separately protected deployment configuration/recovery secrets; do not export secrets into public media or Git. Establish a consistent capture method before scheduling, then restore into an isolated Garage instance with distinct volumes and routing. Verify existing bucket aliases, key permissions, object hashes and access denials there without overwriting the active service. Schedule/retention and the transfer mechanism remain unconfigured until the destination and supported Compose backup path are confirmed.

Next executable task: configure that external backup path and prove isolated full-volume restore, then copy reviewed images through the authenticated CMS and update canonical references with unchanged-before guards and rollback manifests. Original source copies must remain outside the public bucket. Browser CORS and complete image acquisition remain open.

This continuation changed only pilot/audit documents in the repository and protected local proof artifacts. No new framework runtime code changed, so workspace/build/mutation/conformance suites were not rerun; their prior results above are historical evidence. Live recovery assertions and raster validation passed. No architecture, rollout scope, production publication, or CF-22 status changed. Changes remain uncommitted and unfamiliar diffs were preserved.

## Owner-deferred backups and first original media migration

Owner explicitly instructed proceeding without scheduled external backups and returning to them later. This supersedes the backup-before-pilot-import ordering above, while keeping full-volume restore a pending production-readiness item. No backup schedule or redundant production storage is claimed.

Uploaded the reviewed, re-encoded Muhlenberg cover through the existing authenticated full CMS and encrypted Garage account. A content-addressed key prevents unrelated-key overwrites: `wordpress/study-in-usa/programs/46188/82fd87320f0886b560984f65ad5ad01f00562c2095cde1ea28cb3f538bdbf412.png`. Returned public URL, anonymous HTTP 200, `image/png` and byte equality passed. The single intended public object remains; disposable recovery probes were removed.

Then replaced only `public.programs.program_image` for ID 46188 under exact old-image, original WP URL and unchanged `updated_at` predicates. One returned row and a separate query confirmed the new image URL, retained original WP detail URL, institution 512 and existing timestamp. No schema/grant/RLS/status/provider/content fields changed. Before/after and guarded rollback proposal are in protected `garage-deployment/reviewed-media/`; original and sanitized image copies remain local. `upload-reviewed-muhlenberg.mjs` and `muhlenberg-upload.json` document the actual CMS upload/public-readback proof.

Next executable pilot task: review and migrate remaining available original/official institution/program raster assets using the same storage, checksum, unchanged-before and rollback process; report access-blocked/rate-limited sources individually. Refresh the local directory data from canonical Supabase before claiming the preview reflects these references. Full-volume backups/restore and browser CORS stay open; production publishing remains guarded.

Verification for this media increment: PNG decode/re-encode/metadata and visual checks, authenticated multipart CMS upload, anonymous exact-byte readback, one-row guarded SQL update and independent Supabase readback passed. Supabase changelog and official table documentation were retrieved; no Supabase product feature or permissions were changed. Only documentation/protected local artifacts changed in this continuation, so application builds/security gates were not rerun. No production site cutover or release scope change. Work remains uncommitted.

## Eleven ELS images and refreshed offline directory

Eleven current ELS cover references were acquired successfully: official destination JPG/JPEG assets for institutions 878–883 and 885–888, and the original WP ELS logo PNG for New York 884. New York's image is a logo, not a destination photograph; no new photograph was fabricated. Each original is retained locally, independently decoded/verified, re-encoded as metadata-free RGB PNG, and visually inspected on a labeled contact sheet. Tampa 889's canonical cover remains blank; its earlier access-blocked source remains unresolved.

All eleven clean images were uploaded through the authenticated full CMS/connected Garage account to content-addressed institution keys. Every returned public URL and anonymous response was verified as HTTP 200, image/png and identical bytes. Eleven exact old-reference/original-WP-URL/unchanged-timestamp guards replaced only institution_image; independent database readback confirmed all eleven new references and all twelve original URLs. No schema, grants, provider, classification, status or canonical content fields changed. SVG logos and the remaining older external references were not copied wholesale.

Private evidence under `garage-deployment/reviewed-media/`: institution before/after files, original binaries and clean copies by ID, acquisition/dimensions/SHA-256 manifests, contact sheet, upload/public-readback results, forward guards and rollback SQL proposals. Together with Muhlenberg, twelve reviewed images are now referenced from canonical rows. Full archive malware certification is not claimed.

A new narrow canonical read-only snapshot contains 243 USA institutions, 10,049 programs and 190 cities. The previous snapshots remain unchanged. Exact identity refresh maps 18 original institutions, 258 academic programs and 34 normal pathways to canonical records. The anomalous-status pathway is still excluded/unapproved. The ledger resolver now treats source pathways as existing programs, matching the owner's accepted data model. Preview pathway ownership uses the explicit canonical campus FK rather than a WordPress provider edge; institution pages/counts include these pathways without changing their original routes. No source parent was inferred from names or slugs. Corrected canonical city labels, including Minneapolis, replace stale source labels in this refreshed local projection.

The reusable education template gained optional cover/coverAlt fields and uses the existing editable Image primitive. Cards and local detail pages display reviewed public images with complete-image framing and literal alt text; unsupported schemes, credential-bearing URLs and template-like image references are refused. The consumer snapshot includes only the reviewed USA Garage namespace; its loopback CSP permits that precise image path while retaining default-deny, noindex, no-store, host/method restrictions and publicationApproved=false. This does not add a new renderer/admin surface or complete live Directory data binding/publishing.

Local preview: `http://127.0.0.1:4387/explore/?type=institution&q=ELS`, using protected `study-in-usa-pilot-media-refresh.json`. This is an offline draft, not a live database sync or production cutover. Its 11,445 total rows include 10,478 directory listings and editorial previews; four catalog rows remain excluded for existing scope/relationship reasons. Every original listing route (310) returned 200 through the existing Frontbase engine; relationship issues are zero. Browser DOM verified all eleven ELS images loaded, with final contain framing. Muhlenberg detail and institution cards/linked pathways passed route tests. Image alt labels derive from canonical titles and remain editable; historical source alt-text recovery still needs its SEO audit.

Next: resolve remaining older blocked/rate-limited media and missing source paths; implement the reviewed editorial/public data contract and production query/publication wiring under the existing admin/publish path. Browser upload CORS, full-volume recovery and destination availability checks remain open. Scheduled external backups stay owner-deferred. This migration proves neither complete SEO parity nor publication readiness.

### Completion verification (2026-10-06)

The detail-page review exposed historical whole-university text in ELS center profiles. Canonical descriptions were preserved, rather than rewritten without approved center-specific content. The private preview catalog now carries an explicit local `profile_scope` annotation for the eleven former university profiles; this is not a new Supabase column. The projection suppresses source-only university mottos on ELS cards, labels founding years as host-institution facts, and labels the retained overview historical with a center-content review notice. New York's actual ELS profile is not assigned that university-history annotation. Center-specific descriptions and current location/availability remain content-acceptance work.

- Eleven acquisition/decode/re-encode/visual-review and authenticated CMS upload/public MIME/byte checks passed; independent canonical readback confirmed eleven Garage references, unchanged original URLs and the still-blank Tampa reference. Private rollback manifests retained.
- Migration suite: 29/29 passed, including canonical pathway ownership, reviewed-media projection and explicit historical profile scope.
- Education template suite: 6/6 passed, including editable Image primitives and unsafe/template/credential-bearing source refusal.
- Final local preview suite: 310/310 original listing routes returned 200; filters, relationships, contacts, cover cards/details, host/method/robots/CSP guards and draft layout export passed. No production publication.
- Existing compatibility conformance: exit 0, 248 conforms, 0 violations, 9 unreachable fixtures (not passes), 77 verified refusals across 334 operations; 577 differential cases, 76 differing. Credential-dependent auto-migration fixtures reported missing management tokens; this is not live migration/publishing evidence.
- Infrastructure no-leak and mutation harness: exit 0; 6/6 mutation cases proven.
- Backend baseline security/tenant/fuzz/Cloud gates passed. Original mutation run proved cases 1–10, then hit a OneDrive/local UNKNOWN write error restoring edge-misc.ts. Inspected the sole diff and restored exactly the temporary raw-key mutation; separate Git diff was empty. Resumed the unchanged existing case-11-through-end body outside Git with original baseline gates retained: 14/14 passed, final baseline backend rebuild succeeded. All 24 cases were proven across these two runs; the first invocation itself exited 1 and is not mislabeled a clean full-run pass. Resume/source-hash provenance is private. No mutation source change remains.

Workspace check/build completion and final artifact readback are recorded in the supporting audit. Existing size/dynamic-import warnings remain. Six-package/one-engine topology, release claims and paused CF-22 are unchanged. Modified reusable surfaces are the existing template/Image helper, projection/reconciliation and local preview/tests; no new admin/control-plane service was introduced. Docs/evidence/code remain uncommitted, and unfamiliar changes were preserved.

Final workspace pnpm -r check and pnpm -r build exited 0 after all source restoration and final preview changes. Required tracked CMS artifact refreshed; existing build warnings remain. Final clean compat-security exited 0. A separate Git diff confirmed no remaining edge-misc.ts or billing.ts mutation. Six local delivery-document links and final whitespace check passed. Final route/media/relationship/profile-scope tests passed all 310 original listing routes. Browser confirmed the final Cincinnati detail image loaded. This bounded increment is complete; pilot/R0/live publishing remain open. See the supporting audit for owned files, residuals and the next executable task.
