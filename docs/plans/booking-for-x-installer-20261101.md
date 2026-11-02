November 2 source update: the [authoring consolidation candidate](template-binding-consolidation-20261102.md) removes Configure from the installer and moves identity/URL editing to its existing owner. The November 1 Configure-flow receipts below remain historical evidence; they do not verify this new UI on cloud. Fresh acceptance remains open.

# Booking for X installer — November 1, 2026

The bounded first-start, draft-installation, browser/mobile-preview and post-install upgrade repair is qualified on both managed fixtures. This is not a general-availability or uninterrupted native-button claim. Booking for X is the public name of the same template used for Studygram education sites, not a second product.

## Delivered scope

Install Template appears in Dashboard and Pages for privileged administrators. Choose → Configure → Review → explicit confirmation → Install creates exactly six drafts:

| Entry | Kind |
| --- | --- |
| Homepage | Ordinary editable landing page |
| Explore | Directory index |
| Blog | Article index |
| Institution detail | Reusable layout |
| Program detail | Reusable layout |
| Blog article | Reusable layout |

All entries use existing builder elements, starter generators, bindings and Actions. Shared Header/Footer menus use the existing menu document, immutable snapshot and appMenus references. One detail layout serves all matching records. No source records, credentials, datasource tables, automatic publication, reservation engine or payments are installed.

The built-in catalog is server authoritative. Optional existing datasource mappings use the current configuration panel and may remain incomplete during draft installation. Missing mappings still block reviewed publication. Initial indexes use /explore/ and /blog/. The installer performs no datasource DDL.

## Admission and transaction safety

Only a clean tenant namespace or the exact unedited deterministic welcome page is accepted. Edited/deleted welcome pages, version history, configuration/menu documents and other pages refuse installation. Existing sites, repeat installation, upgrades, replacement and uninstall are outside version one.

Authenticated administrator endpoints are bounded to 64 KB strict JSON. Review writes nothing; its digest freezes tenant, configuration, exact prior page state and generated documents. Apply claims one durable tenant-owned settings slot, then atomically verifies the snapshot, replaces only the pristine welcome, writes configuration/menu drafts and snapshot, creates six pages and writes the installed receipt.

Same-operation retries return status only. Changed requests conflict. Uncertain responses leave a fenced receipt and never trigger automatic redispatch or lease expiry. Normal page/configuration writers respect the applying slot. New normalized route keys have a partial unique index; historical duplicate rows are preserved with null keys. Existing unchanged routes remain editable. Migration 26 adds the nullable key and index.

The optional atomicWrite adapter seam uses native D1 batch, libSQL write batch, existing PostgreSQL transactions, or one installation-scoped invoker PostgREST SQL RPC transaction. Parameter and delimiter quoting is tested. There is no sequential fallback and no new public SQL endpoint. Generic datasource RPCs do not advertise installation capability.

## Source and local qualification

- `1ecca1fe`: remove two SDK-ignored, undeclared SuperTokens session-check options. Existing twelve session regressions pass.
- `b17c11e8`: installer, shared starter, atomic adapter seam, migration 26, UI and regression/mutation coverage.
- Final `pnpm -r check` and `pnpm -r build`: PASS. Restricted sandbox dependency resolution initially failed; the same checks passed with access to installed dependencies. CF artifact is approximately 803 KB gzip; Vercel 1053.5 KB. Client prohibited-symbol gate PASS.
- Explicit installer dialog type check and `pnpm test:deployment-buttons`: PASS.
- `pnpm test:template-install`: PASS, including five independently detected installer mutations, real local Workers D1 transactions/rollback, adapter behavior, and ten dialog/starter tests.
- Actual PostgreSQL 17/PostgREST 16.5 loopback HTTP: six-document installation, migrations, parameter/delimiter escaping, atomic rollback, schema and anonymous-access gates PASS.
- Existing page-change suite: fifteen groups PASS. All twelve page-change mutations and three configuration mutations detected the intended faults and independently rebuilt green with source hashes restored.
- Homepage seed, compat-wave1b, site-configuration and session recovery regressions PASS. Historical v22 migration fixture now seeds historical columns before upgrading through v26.
- Local English/Arabic renderer and shared-menu projections PASS. This is not mobile/desktop browser acceptance.

## November 1 follow-up: diagnosed and repaired

- `c5433114`: Cloudflare first-start failed with **Too many subrequests by single Worker invocation**. HTTP libSQL migrations made one request per statement. The transaction-scoped runner now batches the pending SQLite migration plan under the existing write lock, including version records; failure rolls back and concurrent discovery stays serialized. No D1 provisioning, reset, longer timeout or permission change was needed.
- `f0433b55`: a newly installed unconnected template tried to fetch published directory data and showed Canvas failed to render. The canvas now projects authored starter nodes before datasource connection, without changing their saved bindings or bypassing publication checks.
- `1fdab3a0`: auth-compat exposes master_admin as master to the console. Dashboard/Pages now recognize that existing role alias for installer visibility. API authorization is unchanged.

Final workspace check/build PASS. Migration and migration-concurrency, atomic-write and template-install functional gates PASS. The concurrent HTTP-shaped migration test proves one pending-plan batch, bounded transport calls, rollback and lock/retry behavior. Nineteen focused UI regressions PASS (four installer, fourteen canvas, one role compatibility). The existing installer/page/configuration mutation qualification above remains applicable; the follow-up does not weaken those boundaries. Explicit host --refresh-console staging was required before deployment so the live artifact contained the rebuilt console. Generated cms.mjs remains excluded from source commits.

## Live deployment receipts

| Isolated fixture | Verified outcome |
| --- | --- |
| [Cloudflare](https://frontbase-booking-cf-261101.studygram-inc.workers.dev) | Fresh HTTP state migrations and ordinary administrator setup PASS. Chrome Pages / Install Template / Configure / Review / explicit checkbox / Install succeeds, producing six drafts/three layouts. Review/completion is usable at 544-pixel window width. Desktop Pages and Homepage builder plus 390-pixel mobile canvas PASS. All six standard-node Unicode edits/readbacks and anonymous refusal PASS. Post-install Worker version `921656d0-a4d1-472b-8fd2-baca66212b72` preserves exact pages, shared menus, installed receipt and original API/browser session. No publication. |
| [Vercel](https://frontbase-booking-vercel-261101.vercel.app) | Existing regular-API clean install, six authored edits/readbacks, same-operation no-op and closed setup PASS. Updated Chrome desktop/mobile Homepage builder renders without a datasource; the existing browser session survives. Final deployment `frontbase-booking-vercel-261101-9uqfnqilj.vercel.app` preserves the exact six drafts, three layouts, menus, receipt and original API cookie. No publication. |

Exact original-cookie upgrade comparisons completed November 1 at **14:00:20 UTC (CF)** and **14:01:43 UTC (Vercel)**. Pre/post snapshot SHA-256: CF `15907321567ab718a03840f775f7b2e11fc36f5ac2afc226355d40f32d98d407`; Vercel `53ad030a02978fa4879bf3d308c9b6a0704bea3282b0fed178a7835db2ac2f5e`. CF subsequent authored-edit checks occur after that comparison. Private snapshots, credentials and raw logs remain ignored.

These are managed CLI fixture deployments, not fresh README-button receipts. CF installation itself was exercised through the browser; Vercel's initial install used the ordinary API and its installed builder was verified in Chrome. Desktop/mobile means responsive Chrome and builder viewport verification, not physical-device certification. Local English/Arabic renderer coverage and live Unicode storage are qualified; a published bilingual connected-data site was not installed in these intentionally unconnected draft fixtures. Each fixture retains its own $0 Turso state. Existing applications, Study-in-USA and source records remain untouched. No provider grant, D1 cleanup or production cutover occurred.

## Remaining release work (separate from the repaired first-start/upgrade task)

1. Qualify a configured, published bilingual site with its real mappings/data and language publication flow. Draft installation does not import translations or source records. Native deployment onboarding and the full Vercel browser install journey retain their own evidence boundaries.
2. Repair and qualify general managed-Vercel configured-mode selection: this fixture explicitly uses FRONTBASE_BOOTSTRAP=0 rather than inheriting the native README bootstrap default. Complete optional-resource/recovery receipts in their linked plans.
3. Freeze and qualify the release candidate, then reconcile package consumability, security/support, clean-room documentation and versioned distribution. Developer Preview remains the edition; no GA or CF-22 reactivation.

See [installer guide](../guides/installing-booking-for-x.md) for the supported flow. The user can install six editable drafts before connecting data; publication remains a separate reviewed action.
