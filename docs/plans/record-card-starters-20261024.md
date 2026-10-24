# Editable record card starters

Owner request: enrich the institution design with a logo, one localized title, flag/location and selected institution metadata; provide reusable starting points for other datasets. No ratings or simulated favorite/compare actions.

## Implementation

- Shared Item template panel for Repeaters and bound Cards offers Image, Compact and Text card layouts. Field selections and arbitrary metadata generate normal Card/Row/Column/Image/Text/Heading/Link child trees once.
- The title is a normal Link when a details field is chosen. Metadata labels are optional. Empty optional values reuse shared visibility conditions. Text uses start alignment and identity/location rows follow document direction.
- Replacement is explicit and undoable. Preserve the list binding, controls and independent Block Versions. Refuse changing inherited alternative structures until the author enables the existing override.
- Related metadata uses the existing inspected field catalogue and public admission, not broader grants or a new database adapter. The shared condition reader now recognizes own flat record keys returned by related-field queries, retaining forbidden-key and prototype denial.
- Institution field inventory observed in the native builder includes title, cover, logo, originalPath and institutions.type/city_name/country_name/country_flag/year_founded/total_number_of_students. The flag is an image URL. Inspection edits were discarded.

## Verification and delivery

Implementation8f03ebb and staged artifact69c0a62 are committed/pushed. Uploaded archive SHA256: `20D310BE1C8FE48B49BD25F8EFDBD288F38CBBE6C184DB88FD06E47A9923BB3A`. Native staging exposes Card starting points after upload; deployment image digest was not collected. Twelve focused tests, shared condition tests and two condition mutation gates pass. Workspace `pnpm -r check`, `pnpm -r build`, console staging/client checks and cf-full host build pass. Full standalone console typechecking retains historical debt; it is not clean. Final shared-renderer recheck of the actual saved nested card passes English/Arabic fixture values, populated flag URL and zero-year exclusion.

Native application saved Explore302f98d6-440c-489c-b7d9-7f747bcf191f Default item as normal Card7d9b7039-c9a7-40f3-b787-06b4e116964b. Maps title/cover/logo/originalPath, related city/country/flag/type/founding year. Added ordinary numeric year>0 visibility to suppress source zero placeholders. Programs remains an independent alternative; no database records or grants changed. Native Layers exposes Card, Column, Row, Image, Link and Text children; logo/type/location render. This describes the initial draft; final asset and publication acceptance follow below.

**Initial activation gap — resolved by the final acceptance below.** Ordinary Publish refuses this shared-site template. Page Settings → Directory → Prepare private preview fails with the existing generic operation-unavailable message for both full-site (catalog + approved editorial + Homepage) and catalog-only selections. No candidate was returned and no live pointer was changed. Active generation21/hash1f92306ec971e36b2adf47d83cbc4b5fd41fb5484d49f5923a6fead72fc7c5f4 retains the old public card. English and Arabic Explore still render the healthy previous design. Automated Arabic fixture rendering is not a substitute for live Arabic visual acceptance. A local file preview was blocked by browser URL policy; it was not bypassed.

Historical next step (completed below): expose safe preparation diagnostics and trace the failed existing preparation path; create/review a candidate that preserves the active route inventory; activate it and re-prepare affected locale releases through supported controls. Then verify actual English/Arabic cards, external flag delivery, Programs preservation, mobile layout and translated metadata labels. Do not publish a reduced catalog-only candidate or replace the reviewed site with raw mutable records just to close this receipt.

## Boundaries

This is visual authoring, not a new renderer or fixed runtime card configuration. Arbitrary fields remain editable via @ and existing mapping controls. No record translation generation is inferred: the existing localization fallback governs records without translations. Applying/publishing a structural change must retain the locale stale-source and public-field review lifecycle. Preserve the Programs alternative and other page content.

## Preparation failure traced and repaired

The staging RPC successfully selects an institution ID. Full scope selects 243 institution rows and 10,050 program rows; four program URLs belong to study-in-caribbean.com while the configured origin is study-in-usa.com. The exact failure is publication_route_serialization, not missing RPC support. No source records were altered. Saved-template preparation now reuses the existing layout derivative store, retains the entire reviewed inventory, and requires a saved-state hash and unchanged role/configuration. Native publication and locale acceptance are recorded below.

## Final staging acceptance — 2026-10-24

COMPLETE for this scoped task. Backend repair42686d3/artifact25a8862 and UI-policy repaira2b0fe4/artifact58a19aa are committed. Final uploaded archive SHA256 `E7AA3303EBB9B33B4BCBD987CEA5054A557862C7A818609E17C267043E88D92E`; native controls after rollout prove the new runtime. No deployment image digest was collected.

The native saved-template action prepared the exact reviewed base without recapturing the mutable datasource. Final candidate `30e3d1cbb6441148e0be590f2b070fe80aa8f77feb9bca67242c2ade22598ce3` was privately previewed, explicitly reviewed and activated through the existing CAS controls as site generation22. Authenticated read-back proves the same ordered 1,282 public paths and counts (16 captured institutions,185 programs,957 articles,122 pages). The institution list still uses its existing live saved view. Programs visible content matches the pre-change baseline exactly. No source database records, functions, grants, provider settings or credentials were changed.

The source countryflags.com image failed to load (naturalWidth0). The USA-scoped authored Image now uses the verified `https://flagcdn.com/w40/us.png` asset, which loads40×21 on every visible card. This instance's flag is explicitly a configured USA asset, while logo, city/country, type and founding year remain field-bound. The generic starters retain image/emoji field mapping for other datasets. No broken asset is concealed as a successful binding.

Live Arabic inspection exposed a separate existing UI defect: selecting per-unit source fallback did not enable preparation unless every field was translated. The UI now evaluates each missing/outdated state against the operator-selected policy; strict defaults and explicit review/preview/publication remain enforced by the unchanged backend. Fifty manual Arabic interface drafts were saved (no model calls), reusing12 shared drafts. The native review → preview → publish flow activated `/explore/` Arabic generation1, catalog `23cc7cb6365845c715f423c2121f3ebd042c8e7c1bd34888c43cf75235802f6c`, with62 translated units and13 datasource text units using explicit source fallback. This is layout/interface acceptance, not complete record translation coverage.

Actual public English and Arabic cards pass: one title, logo before the title in logical reading order, flag/location/type/year, absent zero years, loaded images, wrapping and no horizontal overflow at1281px. Arabic is `lang=ar`, `dir=rtl`, logo/title rows mirror, title links retain `/ar/`, and visitor pagination reaches page2 and back with Arabic labels and RTL intact. Native375px mobile canvas shows one fitted card column. Public Programs remains intact in both languages, with RTL/localized links on Arabic. Anonymous final HTTP checks: both homepages and four Explore variants200; `/api/pages/`401. English/Arabic screenshots and mobile proof are retained in the task's artifact directory.

Verification: recursive workspace check/build and production staging/client-symbol gates pass after both source changes;16 preparation/card UI tests and10 language-workspace tests pass; functional landing/template preservation tests pass. Four existing landing faults were proven red; the final three template faults (state/review/public-page) are3/3 red. A redundant role fault was replaced because the manifest independently rejected it; ordinary role-refusal tests remain green. Retained chunk-publication integration/capacity, publication controls, compatibility security, Supabase RPC/credential parsing and per-page translation publication/fallback/fence tests pass. Full standalone-console historical type debt is not claimed resolved.

No scoped activation or English/Arabic layout delta remains. Broader public-release gates and datasource translation completeness remain separate.

[Structured acceptance receipt](../reports/record-card-publication-20261024.json).
