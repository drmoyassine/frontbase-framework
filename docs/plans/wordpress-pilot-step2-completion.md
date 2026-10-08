# Step 2: card-link purpose and public request contract

**2026-10-08. Primary-owned bounded integration; locally verified and complete for this increment.** Completes the remaining priority link/request work in the [execution plan](wordpress-pilot-execution-plan.md). Existing combined uncommitted changes were preserved. No canonical data, saved pilot layouts, actual review/approval/activation or deployment was changed. Full migration, template/catalog acceptance and R0 remain open.

## Delivered behavior

New directory and article-index CTAs retain their visible wording. Their optional `recordBindings.ariaLabel: 'title'` adds the current record title to the accessible name, e.g. `View details: Muhlenberg College`. This preserves the visible label within the accessible name. The binding is restricted to Links with `originalPath` href binding and only the allowed title field; private fields cannot be selected. Titles and visible-prefix strings remain literal during projection, and the existing Link renderer escapes the optional attribute. Empty record titles fall back to the visible text by omitting the attribute. Legacy Links without the option keep their markup; the existing builder exposes the option without changing record data. Identical record titles may still yield identical names; the change supplies meaningful record context, not an invented unique title.

The reviewed-publication runtime now throws `PublicationRequestError` only for explicit visitor-input failures. Artifact integrity and exact-capture review precede request validation. The serving boundary recognizes the type rather than inspecting error strings; a failed database with the same message remains unavailable.

| Publication state/request | Public GET | HEAD | Fallback |
|---|---|---|---|
| No active pointer | Existing inactive continuation | Existing behavior | Authorized owner's legacy path only |
| Unknown/unresolved capture route | 404 `Not found` | Same headers/status, empty body | None |
| Intact reviewed route, invalid parameters | 400 `Invalid request` | Same headers/status, empty body | None |
| Unreviewed/corrupt capture or failed state read/render | 503 `Site unavailable` | Same headers/status, empty body | None |
| Intact reviewed route, valid parameters | 200 capture-bound HTML | Same identity, empty body | None |

Invalid includes unknown/duplicate query keys, unsupported collection, invalid positive page syntax, offset above 10,000 and search above 100 trimmed characters. The page syntax retains its existing four-digit limit. Valid empty/exhausted queries return the existing 200 empty state; no automatic clamp or larger capture bound is introduced. Trimmed search values enter the normalized cache identity. Detail routes allow no parameters; sitemap parameters also return 400. All terminal errors remain no-store/noindex with generic bodies and no capture hash/generation, diagnostics, query echo or private data. Missing-route and damaged-state precedence is explicit.

These are existing-engine/builder/runtime corrections, not another renderer, activation API, schema package or installable-template acceptance. Current saved layouts do not silently receive new bindings; a later customization-preserving update remains necessary. The real local pilot server was not restarted or activated.

## Verification

| Gate | Result |
|---|---|
| `pnpm -r build` | Pass; final CF 511.4 KB gzip, no prohibited client symbols; existing chunk/import warnings |
| `pnpm -r check` | Pass, including final check after all mutation restoration |
| Console directory Vitest, `--pool=threads --maxWorkers=1 --no-file-parallelism` | 47/47 pass; accessible-name option is editable and reversible |
| Edge-core `test` | Final rebuilt baseline pass, parity15/15/WYSIWYG14/14, scope/fallback/workflow/bindings; quote/markup/literal canaries and visible-prefix fallback included |
| Backend `test/site-publication.mjs` | Pass; typed invalid state, GET/HEAD400, exact page boundary, normalized search identity, missing404, unreviewed/corrupt503, error-message collision and existing CAS/owner/review checks |
| Backend `test/site-publication-seo.mjs` | Pass; invalid sitemap/detail/list parameters now400; canonical/indexing/identity intact |
| cf-full Chromium `-c e2e/pilot-quality/quality.config.ts` | 30/30 pass on final rebuilt self-host, temporary SQLite/port4393; actual accessible-name assertions for directory/blog CTAs and public request400 |
| cf-full `node dist/smoke-host.mjs` | Pass; staged Vercel/Deno artifacts, state/boot guards and infrastructure route matrix |
| Backend strict `test/compat-conformance.mjs --gate` | Exit1 retained:248 conforming/zero violations/77 refusals/nine unreachable; no CF-22 restart |
| Binding mutation `test/directory-bindings-mutation.mjs` | 13/13 faults RED, restored baseline GREEN |
| Corrected publication `test/site-publication-mutation.mjs` | 26/26 faults RED; changed package rebuilt and functional baseline GREEN after every fault; final compiler/backend rebuild and baseline GREEN |
| Corrected SEO `test/site-publication-seo-mutation.mjs` | 8/8 faults RED; changed package rebuilt and functional baseline GREEN after every fault; final core/backend rebuild and baseline GREEN |
| Exact source restoration | All 14 mutation-target source hashes match the pre-mutation working state, including pending integrated changes |
| Documentation/artifact consistency | `git diff --check` passes; 61 unique local targets in 12 affected documents resolve; `api/cms.mjs` is byte-identical to `dist/vercel.mjs`. Full-file trailing-space scan exits 1 for one unchanged line in DECISIONS.md (current line 474, identical in HEAD); preserved rather than rewriting unrelated history |

First publication run found one remaining old assertion classifying `country=99` as unavailable; it was updated to the new invalid state, leaving unreviewed/corrupt503 assertions intact. The first workspace build preceded a final visible-prefix fallback refinement; a second workspace build and final core tests verify the completed source. Browser tests use invented captures/approvals, not real content authorization. Fresh canonical or storage audits, hosted update timing, real production traffic, clean install and deployed recovery were not run in this increment.

Primary found a verification defect during the initial publication mutation run: source restoration did not rebuild the changed compiler dependency, so later backend faults could inherit an already-broken compiled query module. The SEO harness similarly crossed backend/core boundaries. Both now rebuild the changed package and require a GREEN functional baseline after every restored fault; baseline dependencies are built first. Initial/older cross-package RED counts alone are not accepted as independent guarantees. The corrected sequential 26/26 and 8/8 reruns govern acceptance. This changes test rigor, not a runtime guard.

## Remaining work

Step 2's targeted navigation/heading/alt/link-purpose/request defects are addressed. Broken-URL cover presentation, missing search/filter/sort/pager controls and related-program continuation remain documented template/catalog work. Current captures are still bounded to 48 rows per collection, 1 MiB and seven templates; real USA migration and whole-catalog availability are not implied by these tests.

Next executable task is [T3 guarded admin publishing](wordpress-pilot-t3-implementation-plan.md): expose the existing reviewed activation wrapper through authenticated trusted-owner controls, require exact reviewed hash plus expected active hash/generation (null for first publication), treat conflicts and lost responses as read-back/recovery states rather than blind retries, and prove update/rollback through the existing admin on temporary state. Preserve inactive-only fallback and terminal 400/404/503. Do not expose the low-level activation store. Actual pilot publication and production cutover remain separate owner-review/authorization gates.

R0 stays in progress. The recommendation remains Framework Developer Preview, subject to [release strategy](../history/PUBLIC-RELEASE-STRATEGY.md) external-consumer, clean-install/security/recovery, documentation and release-operation evidence; no general-availability claim follows this pilot pass.
