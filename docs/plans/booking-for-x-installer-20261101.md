# Booking for X installer — November 1, 2026

Source implementation is qualified for the owner-requested main integration. Live acceptance is partial. Booking for X is the public name of the same template used for Studygram education sites, not a second product.

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

## Live deployment receipts

| Isolated fixture | Result |
| --- | --- |
| [Vercel](https://frontbase-booking-vercel-261101.vercel.app) | Node 22 deployment and regular-API clean installation PASS at 13:10:01 UTC, November 1. Synthetic test administrator created through ordinary private-link exchange/setup API. One reviewed install creates six drafts/three layouts; all six authored edits read back; shared menus, same-operation no-op, anonymous refusal and closed setup PASS. No publication. |
| [Cloudflare](https://frontbase-booking-cf-261101.studygram-inc.workers.dev) | Final Worker `26de46fa-792f-4a46-aeae-00617eaa0c3d` deployed. Setup-status still times out/previously returned 500 before application migrations. Cause unconfirmed. No administrator or template install request dispatched. Artifact deployment only; clean installation NOT accepted. |

These are managed CLI fixture deployments, not uninterrupted README-button/browser receipts. Each has its own $0 Turso Starter state (`fb-booking-cf-261101`, `fb-booking-vercel-261101`). Cloudflare D1 inventory was full; no old D1 or Worker was deleted. The new Vercel project temporarily carried only the new CF database credentials and was disconnected from that resource before deployment. No existing site, acceptance app, source record or private provider grant was changed.

The Vercel fixture required explicit `FRONTBASE_BOOTSTRAP=0` to override the native README default inherited by this configured CLI profile. That fixture correction is verified; general managed-profile mode-selection repair remains open.

Windows browser automation stopped because it could not establish the active URL. No browser acceptance is claimed. Owner links, synthetic credentials and raw deployment logs remain ignored/private. Preserve unrelated generated examples/cf-full/api/cms.mjs outside commits.

## Ordered remaining work

1. Diagnose the CF/libSQL fixture first-start timeout before migration; isolate runtime/transport/migration evidence rather than assuming a cause. Preserve its state and ownership.
2. Verify uninterrupted Install Template UI on CF and Vercel in an operable standard browser: all six editable entries, menus, English/Arabic desktop/mobile, reload and post-install upgrade persistence. Vercel API acceptance is complete; browser/upgrade acceptance remains OPEN.
3. Repair and qualify general managed-Vercel configured-mode selection. Complete the existing onboarding/native-button, optional-resource and recovery receipts in their linked plans; this installer does not close those gates.
4. Reconcile package consumability, release automation, security/support and distribution gates before public release. Developer Preview remains the recommended edition. CF-22 is not reactivated.

See [installer guide](../guides/installing-booking-for-x.md) for the supported user flow. Main integration does not imply public-release completion.
