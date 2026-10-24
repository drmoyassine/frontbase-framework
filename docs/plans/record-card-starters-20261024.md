# Editable record card starters

Owner request: enrich the institution design with a logo, one localized title, flag/location and selected institution metadata; provide reusable starting points for other datasets. No ratings or simulated favorite/compare actions.

## Implementation

- Shared Item template panel for Repeaters and bound Cards offers Image, Compact and Text card layouts. Field selections and arbitrary metadata generate normal Card/Row/Column/Image/Text/Heading/Link child trees once.
- The title is a normal Link when a details field is chosen. Metadata labels are optional. Empty optional values reuse shared visibility conditions. Text uses start alignment and identity/location rows follow document direction.
- Replacement is explicit and undoable. Preserve the list binding, controls and independent Block Versions. Refuse changing inherited alternative structures until the author enables the existing override.
- Related metadata uses the existing inspected field catalogue and public admission, not broader grants or a new database adapter. The shared condition reader now recognizes own flat record keys returned by related-field queries, retaining forbidden-key and prototype denial.
- Institution field inventory observed in the native builder includes title, cover, logo, originalPath and institutions.type/city_name/country_name/country_flag/year_founded/total_number_of_students. The flag is an image URL. Inspection edits were discarded.

## Verification and delivery

Pending final delivery. Initial twelve focused tests pass: three normal-tree layouts, English/Arabic rendering, missing-data/escaping, version preservation, UI replacement/Undo and existing repeated-node mapping. Shared condition mutation gates prove both malformed-condition refusal and private-user-context exclusion. Workspace checks/build, final native institution application and English/Arabic layout verification must be recorded before acceptance.

## Boundaries

This is visual authoring, not a new renderer or fixed runtime card configuration. Arbitrary fields remain editable via @ and existing mapping controls. No record translation generation is inferred: the existing localization fallback governs records without translations. Applying/publishing a structural change must retain the locale stale-source and public-field review lifecycle. Preserve the Programs alternative and other page content.
