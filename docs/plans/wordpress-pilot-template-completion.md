# Reusable contacts, dates and synthetic editorial-host proof

2026-10-07. Status: implemented in isolated managed worktree from checkpoint `0629e80`, submitted for primary review. This is bounded T2 work; no real article/content approval, saved-layout change or publication occurred. Primary retains design, integration, acceptance and final core/template packaging decisions. R0 remains in progress; CF-22 remains paused. Public release scope in strategy/milestones/README is unchanged.

## Delivered behavior

- `siteBindings.hideWhenEmpty?: boolean` is additive. It is allowed only on a Link with a supported bound href. False/omitted preserves old nodes. Empty projected href replaces the contact with the existing hidden empty Container; brand, custom/root nodes and authoring source stay intact. Header defaults opt email and WhatsApp in. Validation runs during layout capture as well as preview projection.
- `recordBindings.format?: 'date'` is allowed only with `text: 'publishedAt'`. Old bindings stay literal. Valid ISO calendar dates or explicit-zone datetimes display as UTC Gregorian dates with Latin digits; locale comes from the saved/captured configuration, with validated supported locale or declared `en` fallback. Missing/invalid values collapse instead of showing raw dates, inferred local time or invalid calendar rollovers. No machine clock is used. Date display is selectable in existing builder properties; changing the text field removes an incompatible format.
- `projectDirectoryRecords` receives additive `{locale}` options. Canvas passes `saved.configuration.site.locale`; captured runtime passes `artifact.configuration.site.locale`. The backend hunk is only the third projection argument and must be reconciled with the parallel SEO runtime edits.

No new package, renderer, admin surface, expression engine, datasource connection or consumer-specific branch was introduced. Template defaults use generic core projection capabilities; installable-template packaging is not claimed.

## Reproducible verification

Install locked dependencies, then run from repository root:

```powershell
pnpm install --frozen-lockfile --offline
pnpm -r build
pnpm -r check
pnpm --filter @frontbase/console test -- src/components/builder/directory
pnpm --filter @frontbase/edge-core test
```

Run from the named package directories:

| Directory | Command | Result |
|---|---|---|
| packages/edge-core | node test/directory-bindings.mjs | Passed; optional contacts, strict date projection, invalid combinations, immutable source and literal/escaped records |
| packages/edge-core | node test/directory-bindings-mutation.mjs | 9/9 RED-on-break, restored and final baseline passed |
| packages/edge-core | binding gate with TZ=Pacific/Honolulu and TZ=Asia/Tokyo | Both passed; explicit UTC output unchanged |
| packages/backend | node test/site-publication.mjs | Passed |
| packages/backend | node test/compat-security.mjs | Passed |
| packages/backend | node test/compat-database-security.mjs | Passed |
| packages/backend | node test/compat-tenant-matrix.mjs | 175/175 passed |
| packages/backend | node test/compat-conformance.mjs --gate --behavior --behavior-gate | Exit1:248 conforming,0 violations,77 verified refusals,9 unreachable fixtures; not a clean gate |
| packages/compiler | node test/sw-no-leak.mjs | Passed |
| examples/cf-full | node dist/smoke-publication.mjs | Passed normal CMS dispatch, owner isolation, fail-closed states and version updates |
| examples/cf-full | node test/template-editorial.mjs | 18/18 Chromium viewport checks; normal host/CSS, no custom stylesheet |

Workspace build/check passed with existing bundle warnings; directory admin suite44/44 across9files, full engine suite passed including golden parity15/15 and WYSIWYG14/14. CF artifact gzip510.5KB, Vercel510.8KB, Deno511.7KB informational; no prohibited client symbols. These are isolated build measurements, not updated release-wide claims.

## Synthetic approval/browser evidence

The standalone fixture creates a unique temporary database; requires exact article/configuration approval snapshots and then whole-version review before internal activation solely for the test. The second configuration has fresh approvals; an old configuration approval is explicitly unavailable under that configuration. HTML is requested through the actual `createCmsEngine` public host, without an injected cssBundle. Chromium checks the index and two original-path details at375/768/1280 under both empty/configured contacts. All18 combinations have zero horizontal overflow. The same core projection is bundled into a temporary Chromium probe under Pacific/Honolulu and matches Node for en-GB, French and invalid-date cases; this checks browser/SSR formatting rather than only reading server text. Index columns1/2/3 and browser navigation preserve original paths; empty cover/date disappears, populated synthetic raster loads, long headings/body wrap, date is20April2025 for the offset-crossing fixture and captured en-GB locale. Public body escapes executable-looking text and leaves template-looking text literal; private approval/configuration canaries are absent.

Final temporary evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-template-proof-1thzg6/results.json`, HTML and18screenshots. Empty-contact and configured phone screenshots were visually inspected. A visible generated/intercepted raster is a synthetic loading fixture, not media fidelity or rights evidence. Service workers are blocked in this browser proof to isolate presentation; real old-controlled-browser transition belongs to the separate T1 workstream. Real pilot article remains unapproved; synthetic evidence does not authorize its publication. The script uses normal engine fallback CSS; saved user layouts and the local4389server are untouched.

## Attempts, residuals and handoff

The managed worktree requires ordinary approved shell escalation; initial sandbox Git inspection could not operate on the linked tree, escalated inspection succeeded. Offline locked install succeeded; no dependency/lockfile change. Initial synthetic approvals returned null because the fixture stored an unparsed configuration; parsing through the existing draft schema fixed the equality contract. Initial second activation passed the active wrapper instead of its pointer and returned null; the corrected fixture asserts exact-pointer activation. Two patch attempts used a repository-relative path from package cwd and failed before edits; corrected paths succeeded. These fixture-only mistakes were not worked around by relaxing implementation gates. Initial9-case browser proof was expanded to18 and then strengthened to prove fresh configuration approval; final18passed. A new UI label encoding artifact was replaced by ASCII before final verification. No automatic approval rejection or bypass.

Strict-conformance9unreachable cases remain open. The existing broad S3 fixture failures are assigned to the separate browser/storage workstream and are not claimed resolved or freshly measured here. Full backend publication24-case mutation chain, full infrastructure mutation chain, remote control-store races, real content approval, saved-layout reconfiguration, deployment/staging SEO, cache/SW transition, clean-install/upgrade and second-country reuse are not demonstrated by this chunk.

Commit only scoped source/tests and this evidence plus audit/decision additions. Generated `examples/cf-full/api/cms.mjs` remains an uncommitted isolated build output for the primary to regenerate after integration, avoiding a competing generated-artifact merge. No push. Primary next: review/cherry-pick this chunk, reconcile the single runtime locale hunk with SEO, independently rerun gates and only then apply new template defaults to intended saved layouts after recovery snapshots. Final packaging remains a separate review.
