# General and Template settings: field ownership analysis

**2026-10-13 implementation update:** Global field placement/compatibility is implemented as recorded in the [delivery receipt](wordpress-pilot-pages-settings-delivery-20261013.md). The field map below describes the pre-refactor baseline; source-origin separation, captured branding and generic add-on registration remain future work.

Date: 2026-10-12. Scope: source analysis of the current General and Template tabs. Recommendations are proposed, not accepted architectural decisions or implemented migrations. No live settings were changed.

## Finding

General mixes a legacy project record with an education-specific directory record. These are separate authorities, not synchronized aliases. Template settings currently edits only the education homepage presentation, although some appearance values are inherited by other captured pages. Moving the directory card alone would improve navigation but would not fix duplicated identity, URL and branding authority.

Distinguish three things: core owns reusable infrastructure; an installed template owns its specialized schema, defaults and controls; the site owner owns configured values. A template can consume core site identity without owning or copying it. The current education code is embedded in framework source; this report does not claim it is already an independently installable add-on.

## Current persistence and publishing

| Form | Actual store | Current effect of saving |
| --- | --- | --- |
| Project Settings | Owner-scoped settings KV key `project`, GET/PUT `/api/project/` | Updates mutable project metadata. Logo/favicon auto-save separately from the text Save button. Does not update directory site configuration. |
| Shared Directory Settings | Owner-scoped `site_configuration:v1`, `/api/project/site-configuration/`, expected revision | Updates shared authoring configuration. Captures retain their previous configuration; saving does not activate a version. Editorial approvals are configuration-revision bound. |
| Template Settings | Homepage layout `root.directoryLanding.settings`, guarded `/api/pages/:id/changes/` | Updates homepage draft presentation, not shared configuration revision. Prepare/review/activation is a separate operation. Other template pages inherit appearance from the captured homepage. |

These distinctions must survive any reorganization. Core identity changes must eventually be captured with the published version rather than read from unrelated mutable settings at render time. Presentation-only changes must not require reapproving the entire article catalog. Splitting the existing configuration requires a versioned migration and compatibility plan, not a silent UI-only move.

## General: Project Settings fields

| Field | Actual current purpose/consumer | Proposed ownership and location |
| --- | --- | --- |
| Project Name | Saves `project.name`. Does not drive education header/site bindings or captured Open Graph site name. | Core General: rename **Project label** if retained as an internal name. Default it from Site name at setup; do not expose two apparently equivalent public names. |
| App URL | Saves `project.appUrl`; UI describes publish/preview URL. No consumer of this value was found in the inspected engine/publication/console paths beyond form/store/API plumbing. It does not govern captured canonicals or template links. | Do not keep as a second ambiguous public URL. Core General should have one **Canonical site URL**; actual preview/deployment addresses belong under deployment/Edge configuration. Migrate/remove the legacy field only after checking integrations. |
| Favicon | Saves `project.faviconUrl`; normal host engine resolves it for browser icons and Navbar branding. Captured publication explicitly supplies an empty favicon override instead. | Core General → Site identity. Capture its asset reference with the site version. Use connected asset selection without making one storage vendor a prerequisite. |
| Logo | Saves `project.logoUrl`; no direct consumer found for this project property in the inspected public template path. Navbar's project-logo option actually uses `faviconUrl`. Auth-form logos are separate configuration. | Core General → Site identity. Templates bind the site logo explicitly; favicon and logo must remain distinct. |
| Project Description | Saves `project.description`. Captured page description comes from record summary or template/page description, not this field. | Core General → internal project description, explicitly labelled. If a public default SEO description is desired, define a distinct documented fallback rather than implying this already provides one. |
| Delete Project | Visible destructive button currently has no handler in SettingsPanel. | Core project lifecycle, normally Advanced/Danger zone. Hide or disable until implemented; never present an inert button as functioning deletion. |

## General: Shared Directory Settings fields

| Field | Actual current purpose | Proposed ownership and location |
| --- | --- | --- |
| Site name | `configuration.site.name`: shared text bindings for header/footer and captured Open Graph site name. | Core General → **Public site name**, authoritative for all templates. |
| Destination | Public country/destination wording; substitutes `{destination}` in hero. Does not itself filter database rows. | Education template → Site setup. Keep separate from numeric country/site data scope. |
| Site origin | HTTPS origin used for canonical URLs, Open Graph URL, sitemap URLs, original-path normalization, same-site relative-link conversion, and editorial source-site constraints. | Core General → **Canonical site URL**. Editorial source origin must be separated from canonical origin during a future migration; changing domains must not accidentally change which source articles qualify. |
| Locale | Document language fallback and supported publication-date formatting. Not a content translation system. | Core General → Language/locale. |
| Data source | Selects an existing owner-accessible datasource ID. Changing it resets collection mappings in this editor. Credentials live in the existing connection subsystem. | Core owns Data Studio/connections; template → Data setup selects which connection its collections use. |
| Collection selectors | Institution, program, city, article and pathway mapping panels. | Education template → Data setup. Generic collection/query tooling remains core. |
| Default collection | Default directory request collection; homepage search selects program or institution. Schema offers all five roles, but captured directory currently accepts only institution/program. | Template → Directory browsing; expose only supported choices. |
| Cards per page | 12/24/48, sets directory/blog pagination and related list bounds. Homepage program/guide counts have separate controls. | Template → Directory browsing. Generic pagination mechanics remain core. |
| Default sort | Stores name/latest. Inspected directory and captured query implementations order by title/id and do not consume this setting. | Template → Directory browsing, but Latest must be disabled/removed until the backend actually supports it. |
| Search | Captured directory/blog search-widget visibility. Request parsing still accepts `q`; homepage search is separately projected and does not consume this flag. | Template → Directory browsing. Clearly separate **show directory search** from **show homepage search**; not a permission boundary. |
| City filter | Stored flag, no implemented consumption found in captured directory. Public route parser accepts type/q/page only. | Template → Directory browsing; do not advertise as active until fully wired. |
| Degree filter | Same unsupported stored flag; no degree mapping in this settings form. | Template → Directory browsing when supported. |
| Intake filter | Same unsupported stored flag; no intake mapping in this settings form. | Template → Directory browsing when supported. |
| Directory path | Index route and collection navigation, e.g. `/explore/`. Does not rewrite individual record URLs. | Template → URLs/navigation; core owns route validation and collision checks. |
| Blog path | Article index route and template blog navigation, e.g. `/blog/`. | Template → URLs/navigation. |
| Counselor email | Public `mailto:` contact action, hides empty bound links. Does not configure an outgoing email transport or send mail. | Template → Contacts/CTAs for now. Core may provide generic named contact settings later; don't introduce another copied site-wide email field. |
| WhatsApp link | Public HTTPS `wa.me` action, hides empty bound links. Does not send a message automatically. | Template → Contacts/CTAs; generic links/components remain core. |

### Every collection-mapping field

These are column mappings, not duplicate copies of institution/program/article data and not file-storage settings. They belong in the template's Data setup, using core datasource/schema/relationship tools.

| Mapping control | Purpose/current boundary |
| --- | --- |
| Table | Source table for that collection. Changing table resets its fields/scope. |
| Record ID | Stable row identity used for records and relationship resolution. |
| Title | Public record heading/card text and deterministic name ordering. |
| Original URL/path | Original per-record public path; authoritative for detail links/routes. |
| Summary | Card/intro text and captured description metadata. |
| Content | Detail body; articles/pages use validated semantic blocks. |
| Cover image | Public image reference from each record; optional image bindings collapse when empty. Does not upload or select the storage provider. |
| Logo | Record-specific institution/program logo reference; different from the overall site's logo. |
| Gallery | Accepted mapping field, but no gallery record-binding or captured gallery field exists in the inspected current contracts. Do not imply a working gallery UI. |
| City relationship | Institution/program city ID mapping; institution-city parent validation uses it. Not a implemented visitor city filter. |
| Institution relationship | Program/pathway parent ID mapping; implemented program-parent detail/list relationships. Pathway runtime is not implemented by the captured query contract. |
| Scope field | Column constraining collection selection, e.g. country_id. |
| Scope value | Matching string/number, e.g. USA's country ID. This filters eligible data; it does not grant datasource permissions or replace tenant/owner isolation. |
| Content type (article) | Distinguishes article/page editorial content roles in the adapter/query boundary. |
| Source site (article) | Source-origin column used to constrain editorial selection; currently compared with Site origin. |
| Byline (article) | Public author/byline text. |
| Original publication date (article) | Original date and locale-aware display; it does not currently make Latest sorting work. |
| Cover alt text (article) | Alt-text column mapping. Present in schema/editor iteration, but the current label lookup omits `coverAlt`, leaving this control without its intended visible label. |

Visibility: ID/title/path/summary/content/cover/logo/gallery appear for every collection; city relationship only institution/program; institution relationship only program/pathway. Article adds content type/source site/byline/publication date/cover alt. Scope controls appear on every collection. The UI exposes pathway configuration even though no pathway list/detail query ID is registered; mapping availability is not runtime feature completion.

## Template Settings: all current fields

| Field(s) | Current purpose | Proposed location/ownership |
| --- | --- | --- |
| Preset: Neutral Navy / Neutral Charcoal | Public palette defaults; does not change admin light/dark/system theme. | Template → Appearance; template owns these named presets. |
| background / surface / text / muted / primary / border | Optional six-digit hex overrides for public template slots/tokens. Explicit component styles win. | Template → Appearance → Advanced. Core owns reusable design-token/style machinery. |
| Font: system sans serif / serif | Public template font family. | Template → Appearance. |
| Content width | Maximum marked-section width, 900–1440px. | Template → Appearance → Layout. |
| Section spacing | Marked-section vertical padding, 24–88px. | Template → Appearance → Layout. |
| Card radius | Marked-card corner radius, 0–24px; button radius capped at 12px. | Template → Appearance → Layout. |
| Hero heading | Homepage heading, supports `{destination}` replacement. | Template → Homepage → Hero. |
| Hero introduction | Homepage hero copy. | Template → Homepage → Hero. |
| Hero mode: plain / single image / slideshow | Hero media behavior; empty media falls back to plain, one image avoids unnecessary slider controls. | Template → Homepage → Hero. Generic media/slider behavior remains core. |
| Hero height / Mobile hero height | Desktop 240–560px and mobile 200–460px media area. | Template → Homepage → Hero. |
| Image URL / Choose from connected storage | Public image asset reference for each of up to eight slides. Uses existing connected file picker. | Template → Homepage → Hero; storage connections, credentials and file browser stay core. |
| Image alt text | Accessible description for each slide. | Template → Homepage → Hero. |
| Horizontal / vertical focal point | 0–100 crop position per image. | Template → Homepage → Hero. |
| Slide order / remove / add | Move up/down, remove, add via existing storage picker. | Template → Homepage → Hero. |
| Show slide controls | Manual slider navigation visibility. | Template → Homepage → Hero. |
| Autoplay | Optional automatic advancement; pause/reduced-motion behavior provided. | Template → Homepage → Hero. |
| Seconds per slide | 5–30s, shown when autoplay is enabled. | Template → Homepage → Hero. |
| guidance / programs / articles / counselor | Visibility of four marked homepage sections; not global collection publication eligibility. | Template → Homepage → Sections. Use reader-friendly labels instead of internal keys. |
| Program cards / Guide cards | 1–12 homepage list limits; separate from directory page size. Uses eligible deterministic queries, not curated featured items. | Template → Homepage → Sections. |
| Programs heading / Guides heading | Homepage section headings. | Template → Homepage → Sections. |
| Counselor heading / Counselor introduction | Homepage CTA wording; email/WhatsApp destination currently supplied by shared directory config. | Template → Homepage → Sections, linked to Template Contacts/CTAs. |

Reset overrides, Save, Reload, Open builder, Prepare version and private preview are actions, not settings fields. Core should own guarded saving, draft/version review, preview and activation. Template supplies its settings schema/UI; a generic Template Settings host should not assume every template is education or always has a homepage.

## Proposed user-facing organization

General (core): public site name, canonical site URL, language, logo, favicon; optionally collapsed internal project label/description; honest functional lifecycle controls. Deployment/preview host URLs are operational values in the existing Edge/deployment area, not a competing canonical URL.

Template Settings (for the active education template):

1. Site setup: destination.
2. Data setup: connection selection, five collection mappings with only supported capabilities exposed, scope/relationships and validation.
3. Directory browsing: default collection, page size, implemented search/sorting/filter controls.
4. URLs and contacts: directory/blog index paths, counselor email and WhatsApp.
5. Appearance: presets, colors, font, width, spacing and radius.
6. Homepage: hero/media/slider, section visibility, counts and copy.

Core still owns datasource connections, connected storage, query execution, Repeater, generic relationships, router, SEO generation, design tokens/components, settings registration/validation, isolation, guarded versioning and publishing. Education owns institution/program/city/pathway meanings, country destination/scope choices, counselor wording, education page compositions and presets. USA names, IDs, country values, domain, contacts and media are site-specific values, never shipped template defaults bound to Studygram.

## Finite follow-up recommendation

First agree this placement and the single public identity authority. Then implement a bounded compatibility migration of identity/branding and settings presentation, preserving existing configuration revisions, captured URLs and approvals. Retain internal project label only with an explicit distinct use. Separate source-origin identity from canonical-domain identity. Replace stale “linking/runtime pending” text and expose only actually wired controls. Verify the same saved site renders identically before/after restructuring, including canonical URLs, logo/favicon, contacts, owner isolation and rollback. No extra content refresh, homepage redesign or generalized plugin marketplace is required to complete this cleanup.

## Source evidence and verification

- `packages/console/src/components/dashboard/SettingsPanel.tsx`: tab composition and inert Delete Project button.
- `packages/console/src/components/dashboard/settings/shared/ProjectDetailsForm.tsx`: six project fields, separate asset autosaves.
- `packages/console/src/stores/slices/createProjectSlice.ts`, `packages/backend/src/compat/routes/project.ts`: project API/store boundary.
- `packages/console/src/components/dashboard/settings/shared/SiteConfigurationForm.tsx`, `packages/console/src/components/builder/directory/DirectoryConfigurationPanel.tsx`: shared editor, field visibility and stale labels.
- `packages/edge-core/src/directory/configuration.ts`, `bindings.ts`, `browsing.ts`: strict mapping/site/browsing schemas and supported bindings.
- `packages/compiler/src/queries/directory.ts`, `packages/backend/src/compat/site-publication-chunk-queries.ts`: implemented query parameters and deterministic ordering.
- `packages/backend/src/compat/site-publication-runtime.ts`, `site-publication-chunk-runtime.ts`, `site-publication-sitemap.ts`: captured routing, canonical/metadata/locale, empty favicon and browsing projection.
- `packages/backend/src/compat/editorial-adapter.ts`, `catalog-route-inventory.ts`: editorial source-origin coupling.
- `packages/console/src/components/dashboard/settings/shared/TemplateSettingsForm.tsx`, `packages/console/src/components/builder/directory/TemplateSettingsEditor.tsx`: homepage store, settings controls and guarded actions.
- `packages/edge-core/src/directory/template-settings.ts`, `landing.ts`: presentation projection and limits.
- `packages/console/src/components/builder/properties/landing/NavbarProperties.tsx`, `packages/edge-core/src/ssr/navbarFavicon.ts`, `examples/cf-full/src/worker.ts`: favicon/project-logo behavior.

Verification: source reads and targeted reference searches, no runtime mutation. Documentation diff check is recorded in the audit. No code changes or new build/test claims. Existing source diffs and conflict files preserved.
