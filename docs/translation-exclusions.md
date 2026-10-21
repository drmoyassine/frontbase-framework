# Translation exclusions ledger

Consolidated, verified record of what the localization system **deliberately does not
translate or serve localized**, with the precise reason and the enforcing surface for each
entry. Consolidated 2026-10-22 as the task-10 close-out deliverable (execution ledger:
`docs/plans/frontbase-study-in-usa-translations-execution-20261020.md`, task 10). Every entry
is either pinned by a test or carries its enforcing file:line. An entry here is a designed
boundary, not a gap — moving any of them is a product decision that must update this ledger,
the pins, and the visible refusals together.

## 1. Structural exclusions (what never becomes a translation surface)

- **Record-detail template pages** stay outside per-page translation: only template listing
  paths and static pages release (`templateListingPath`); detail records translate through the
  shared shell plus per-record units, never as per-page copies. Enforced by the
  `homepage_required` gate and per-page review scoping; pinned in `translation-homepage.mjs`.
- **Rich article bodies are refused** as a translation surface for task 10: the body is a
  different block/run schema than the approved release inventory, and claiming equivalence is
  refused. The ready-but-consumer-less `LocalizedRichNode` interchange is recorded
  (`rich-text.ts` is reference-parity-tested); the approval-fingerprint join
  (`editorial-approval-store.ts:46-60`, `verifyManifestEditorial`) keeps released bodies
  SHA-256-verified per read.
- **Gated private pages** hardcode `lang="en"` with no `dir` (`htmlDocument.ts:68`): they are
  an English-only surface (publication-v2 pages never set `isPublic`, so the localized gate
  cannot intercept). Parity deferred.
- **Builder canvas renders `lang="en"` LTR by design**; the console translation workspace
  corrects client-side (`localePreviewHtml` stamps lang/dir on the real renderer canvas —
  pinned). Canvas is authoring chrome, never public output.
- **Public forms are authoring-preview only** — there is no submit admission, so form
  validation/error copy has no public serve to localize.

## 2. Audience and transport exclusions (who never sees localized output)

- **Audience-authenticated sessions never receive the language step**: the whole locale walk
  is gated on `!audience?.authenticated` (`site-publication-serving.ts:59`), so a signed-in
  menu member's `/ar/…` request resolves as a source URL (404 for a nonexistent source path)
  instead of a localized page. Designed no-injection exclusion — audience-conditioned menu
  content is not captured in localized releases, and injecting public localized chrome into a
  personalized page would mix audiences. **Pinned** in `translation-page-publication.mjs`
  (authenticated `resolveAudience` on `/ar/about/` → 404).
- **Transport-level error bodies stay English** (truthfulness): claiming `Content-Language:
  ar` on a 503/400 body that carries English text would lie. Localized error replies stay
  undeclared.
- **`Content-Language` is declared only where the payload carries released localized text**
  (`publication-list-source.ts` reply logic): a locale prefix without a path-matched release
  keeps pure source semantics and ships no language claim.

## 3. Live-data exclusions (visible refusals, slice 2 of the live-data milestone)

- **Live-bound DataTable/Grid refuse localization** with `localized_live_table_not_supported`
  (review → 422 → console operator guidance): their SSR renders skeletons and the visitor's
  browser fetches rows via `/api/data/execute` with no locale channel, so no honest localized
  serve exists. Pinned in `translation-live-list.mjs`. Parity work (SSR rows +
  `localeReadOnly` equivalent + unit extraction) is backlog, not silently missing.
- **Interactive live lists refuse localization** with
  `localized_interactive_list_not_supported` (count/search/pager controls have no released
  localized semantics). Pinned in `translation-live-list.mjs`.
- **Localized live queries refuse beyond the bounded scan**: a view over more than
  `LIVE_LOCALIZED_SCAN=1000` rows throws `localized_live_query_beyond_cap` (whole-page 503)
  instead of silently ordering a window. Pinned in `translation-live-list.mjs`.
- **Search (`q`) on localized static pages**: URL parameters are refused on localized static
  paths exactly as their source paths refuse them (`translation-homepage-serving.ts:117`);
  search semantics on localized live pages remain an open backlog item, not a claimed feature.
- **Hydrated DataTable/Grid chrome stays English**: `localeReadOnly` mount suppression exists
  only on the Repeater render path (`data.ts:477`); DataTable/Grid always emit fetch markers.
  Documented reach of the hydrated-chrome exclusion.

## 4. Content exclusions (what text is never translated)

- **IDs, executable code, binding expressions, and URLs are never translated** — these guards
  are SHIPPED and pinned, not excluded: `translationPlainText` chokepoint, emit guards
  refusing `{{}}`/`@{`/engine refs/URLs, placeholder-token parity
  (`translation/src/revisions.ts`), supplement plain-text guard
  (`supplementTemplateRecords`).
- **Monetary values have no mechanical guard on the generic record path**: protection is the
  column-allowlisted published inventory plus human review. Documented acceptance.
- **Browsing no-state fallback** "Visitor browsing controls appear in the prepared site
  preview." (`directoryBrowsing.ts:8`) is a registry-composed string but intentionally
  describes builder-only state; it joins this ledger rather than the release inventory.

## 5. Declared-but-unwired (contracts awaiting a consumer)

- **`languageConfigurationSchema`'s per-locale direction field has zero consumers**: interim
  direction semantics are the `localeDirection` 8-script helper; the field wires when a
  per-locale store lands.
- **`MessageResolver`** (`contracts.ts:102-104`) is declared but unimplemented; composed
  chrome currently flows through the released pattern registry (`patterns.ts`), which is the
  bounded substitution mechanism — deliberately NOT full ICU/MF2.

## 6. RTL physical-CSS inventory (visual-only, bounded; audited 2026-10-22)

Public documents stamp `dir` at `shell.ts:58` from `localeDirection`, and **no
`[dir="rtl"]` override CSS exists anywhere in `packages/edge-core/src`** — every physical
declaration below has no compensating rule. Read-only audit verdict: **every site is
cosmetic-only** (misplaced indentation/anchors/alignment); none clips text, overlaps content,
or produces unusable controls on RTL pages. All listed logical-property swaps
(`left` → `inset-inline-start`, `margin-left` → `margin-inline-start`,
`text-align:left` → `text-align:start`, `right:0` → `inset-inline-end:0`) are visually
identical for LTR. Documented as the known, bounded exclusion ahead of public Arabic launch.

Audit-list sites (as flagged by the 2026-10-21 reconciliation audit):

| Site | Construct | RTL effect |
| --- | --- | --- |
| `ssr/components/landing/Sidebar.ts:15` | `padding-left:16px` submenu indent | nesting cue lost; dead space on non-reading side |
| `ssr/components/landing/themeSwitcher.ts:6` | `.fb-theme-options{right:0}` panel anchor | panel anchors physical-right in RTL flex row; minor crowding |
| `ssr/components/interactive.ts:265` | `text-align:left` accordion trigger | no-op (flex container) |
| `ssr/components/interactive.ts:317` | `text-align:left` dropdown item | no-op (flex container) |
| `ssr/components/static.ts:475` | `text-align:left` alert description | Arabic alert text hugs physical left; legible |
| `ssr/components/data.ts:385` | `margin-left:auto` icon alignment | preserves author's picked physical side; benign |
| `ssr/styleHelpers.ts:116-126` | `horizontalAlign` → `margin-left/right` | author-chosen alignment; byte-contract caveat below |

Additional offenders found by the 2026-10-22 bounded sweep (same cosmetic class):
`baseStyles.ts:108` (table header `text-align:left` vs start-aligned body cells — worst
visual mismatch), `baseStyles.ts:102-103` (search icon `left` + asymmetric padding, no
overlap), `templateLanding.ts:28` (hero controls `right:24px`/mobile `left:24px`),
`interactive.ts:337` (dropdown `left:0`), `interactive.ts:357` (toggle thumb `left`),
`interactive.ts:204` (spinner `margin-right` gap lands outer edge), `static.ts:471` (alert
accent `border-left-*`), `static.ts:377` (required asterisk `margin-left`),
`interactive.ts:487` + `gatedPage.ts:146` (auth/link `margin-left` gaps),
`badge.ts:29,37` (fixed `right:16px` watermarks — public only), `PageRenderer.ts:151`
(mobile menu panel `right:0`, max-width-guarded), `gatedPage.ts:97,155` (translateX
centering — direction-agnostic, cleared), `utilitiesCss.ts:10` (generated Tailwind physical
utilities consumed by `FAQ.ts:53`, `CTA.ts:58`, `Hero.ts:82`, `Pricing.ts:93` — systemic,
regenerated via `scripts/regen-utilities.mjs`). Cleared as direction-agnostic:
`baseStyles.ts:79-90` marquee `translateX(-50%)`/mask.

Caveats on two sites: `styleHelpers.ts:116-126` and `data.ts:385` encode **persisted,
author-chosen physical alignment** — a logical-property swap there changes emitted CSS bytes
(the style pipeline's own contract pins byte-identical published output across renderers,
`styleHelpers.ts:80-83`, parity-tested) even though LTR rendering would be unchanged. If a
fix pass is later authorized, the LTR-safe value order is: `baseStyles.ts:108`,
`static.ts:475`/`471`, `Sidebar.ts:15`, then the panel anchors (`themeSwitcher.ts:6`,
`interactive.ts:337`, `templateLanding.ts:28`, `PageRenderer.ts:151`).

## Verification status (survey-exit, 2026-10-22)

English functional and preview/public agreement re-pinned: edge-core direction-mutation 3/3,
patterns-mutation 5/5, localization PASS, directory-bindings 16/16; backend
translation-page-publication (now also pinning §2's authenticated exclusion and the app-menus
picker), translation-coverage, site-publication-seo (og:locale pins) PASS; console
NavbarProperties.test 2/2; earlier the same release slice: translation-homepage,
pilot-live-lists, translation-navigation, translation-homepage-explore,
translation-live-list, list-chrome-surfaces PASS; `pnpm -r check`/`build` EXIT 0;
compat-conformance 257 CONFORMS / 0 VIOLATES / 77 PRODUCT_VERIFIED_REFUSAL / 0 STUB — exact
baseline. **translation-homepage-mutation is recorded gate debt** (its 2026-10-22 background
run was killed by the OS memory reaper, not a test failure) and must rerun green before the
next staging deployment claim.
