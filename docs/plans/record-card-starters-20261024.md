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

Native application saved Explore302f98d6-440c-489c-b7d9-7f747bcf191f Default item as normal Card7d9b7039-c9a7-40f3-b787-06b4e116964b. Maps title/cover/logo/originalPath, related city/country/flag/type/founding year. Added ordinary numeric year>0 visibility to suppress source zero placeholders. Programs remains an independent alternative; no database records or grants changed. Native Layers exposes Card, Column, Row, Image, Link and Text children; logo/type/location render. External flag image visibility has not been accepted visually.

**Still open: live content activation and real Arabic visual acceptance.** Ordinary Publish refuses this shared-site template. Page Settings → Directory → Prepare private preview fails with the existing generic operation-unavailable message for both full-site (catalog + approved editorial + Homepage) and catalog-only selections. No candidate was returned and no live pointer was changed. Active generation21/hash1f92306ec971e36b2adf47d83cbc4b5fd41fb5484d49f5923a6fead72fc7c5f4 retains the old public card. English and Arabic Explore still render the healthy previous design. Automated Arabic fixture rendering is not a substitute for live Arabic visual acceptance. A local file preview was blocked by browser URL policy; it was not bypassed.

Next executable task: expose safe preparation diagnostics and trace the failed existing preparation path; create/review a candidate that preserves the active route inventory; activate it and re-prepare affected locale releases through supported controls. Then verify actual English/Arabic cards, external flag delivery, Programs preservation, mobile layout and translated metadata labels. Do not publish a reduced catalog-only candidate or replace the reviewed site with raw mutable records just to close this receipt.

## Boundaries

This is visual authoring, not a new renderer or fixed runtime card configuration. Arbitrary fields remain editable via @ and existing mapping controls. No record translation generation is inferred: the existing localization fallback governs records without translations. Applying/publishing a structural change must retain the locale stale-source and public-field review lifecycle. Preserve the Programs alternative and other page content.
