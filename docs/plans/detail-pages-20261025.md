# Editable institution and program detail pages

Status: source implementation locally qualified; staging deployment, saved-template publication and native acceptance pending.

## Authorized delivery

Reusable institution and program templates built from ordinary elements, datasource/relationship bindings and Properties → Actions. Institution profile includes overview, facts, location/map/directions, inquiry and bounded related programs. Program profile includes cover fallback, institution, overview, facts, requirements, fees, intake badges and available optional sections. Empty fields hide their sections and section links. No invented fees, rankings, deadlines or admission facts.

## Architecture and authoring

Page Settings → shared template settings offers a detail starting point using an existing bound source. The generated tree is normal editable content. Every child can be moved, restyled, replaced or rebound using the existing Layers, properties and @ picker. Existing hidden filters bind the current record ID from the immutable route index. `page.parentId` is also available. Source IDs do not come from user-controlled query parameters or saved example paths. Public list continuation re-applies the reviewed route filter, including localized paths. Preview substitutes only a transient sample identity.

Section navigation uses the existing Scroll to Section quick action. Details, institution and inquiry links use Open Page actions, rendered as real accessible anchors. The explicit legacy record-link migration preserves existing workflows and unrelated static links. Existing source/translated-record/UI save provenance and publication guards stay in force.

Detail paths become targets of the existing per-page language lifecycle. Live detail templates retain per-unit source fallback policy; missing record translations do not become invented translations. No AI jobs are required by this delivery.

## Verification

Workspace check/build exit0. Full engine suite passes;38 focused authoring/renderer/language-workspace tests pass. Route/continuation integration, actual retained live-list/per-page translation and English/Arabic editing suites pass. Five route/capture faults, three navigation faults, nine retained frontend editing faults and four retained source-write faults were detected and restored. Native host/language normalization applies after interpolation, including client-rendered records, while media/external URLs remain unchanged. CF artifact715.2KiB gzip and Vercel965.0KiB gzip pass their existing budgets. Standalone console diagnostics retain the documented pre-existing debt; no errors were identified in the new starter/template modules.

Pending: staging deployment, saved-template publication, actual English/Arabic desktop/mobile acceptance, Actions click-through and save/reload/restoration.

## Boundaries

No other sites, registry publication, production cutover, shared-source schema changes, new keys or unrelated release scope. Maps use existing Embed elements and address/coordinate bindings; directions remain ordinary Actions links.

## Native authoring follow-up

Initial source52be8cc is pushed and deployed automatically by EasyPanel source upload. Native authoring exposed a cold-open source-picker gap: other page bindings were not cached, and API-enriched compiled request fields need authoring-only projection. The explicit Load sources from saved pages action reuses the existing Pages service, preserves the builder's unsaved page state, strips derived request fields and validates the remaining binding through the unchanged strict schema. Its UI regression proves cold loading, safe application and no store overwrite/compiled-request copying. Workspace check/build and the focused regression pass. Saved-template publication and final native acceptance remain pending.

Native private preview confirmed the institution's bound image, description, facts and map. A separate authoring-only defect was traced to the existing copy projection marking an unseeded noninteractive Repeater localeReadOnly. Canvas now re-enables hydration only for unseeded bound Repeaters; seeded SSR previews and public localization remain unchanged. Eleven canvas regressions and workspace check/build pass. Native activation is still pending.
