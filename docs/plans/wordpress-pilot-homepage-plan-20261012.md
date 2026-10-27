# Education template homepage: detailed delivery plan

Status: H1–H3 implemented; H4 technical staging verification complete, owner visual acceptance pending. [Delivery receipt](wordpress-pilot-homepage-delivery-20261012.md) records reviewed491deec1… generation12. Production traffic remains unchanged.

## Objective and finish line

Replace the article-style `/` presentation with an editable directory landing page that helps students discover institutions/programs and contact Studygram. Reuse the existing Frontbase engine, compiler, builder, Repeater, connected datasource/storage and `/frontbase-admin`. Preserve the original homepage URL and SEO identity. Publish a reviewed staging version only after the design and its configurable behavior work together.

Done means an actual staging homepage, responsive desktop/mobile proof, functional supported search and relative navigation, admin changes proven through preview/capture/rollback, and owner visual acceptance. A screenshot-only mockup, hard-coded USA HTML, live Supabase queries hidden in a template, or technical route tests alone do not establish completion. Production traffic cutover remains separately approved.

## Confirmed direction and launch scope

- Owner: neutral white with charcoal or navy; selectable presets and additional controls in template settings.
- Owner: use https://www.booking.com/ as the design reference/general direction. The reference was inspected in the actual browser: compact header/navigation, short hero, prominent horizontal search, modular discovery rows and listing cards. Web text retrieval initially returned a JavaScript challenge; browser navigation subsequently exposed the page normally. No sign-in, purchase or challenge solving occurred.
- Adapt the directory/search hierarchy and information density to education. Use original Studygram branding, copy, imagery and icons; no Booking assets, hotel pricing, loyalty prompts, ratings, scarcity or unsupported claims.
- Owner confirms configurable hero imagery/slider. Expose none, single-image and slideshow modes; search stays prominent and stationary across slides. Initial default is single-image when an approved asset exists, otherwise the preset's plain surface.
- Owner explicitly defers featured institutions as a separate later feature. Omit that section for launch; featured ID pickers, manual ordering, eligibility workflows and generic curation are not homepage prerequisites. No priority institution names are needed now.
- These are visual/content preferences, not new credential requests. No further owner business decision is needed for the underlying architecture; any recommendations remain proposals until implemented/verified.

## Homepage composition

| Order | Section | Initial content and behavior | Admin control |
| --- | --- | --- | --- |
| 1 | Header | Brand/home link; Institutions, Programs, Study guides; compact counselor contact. Narrow widths use a keyboard-accessible menu. No student account/login controls until such a service exists. | Brand/logo, menu labels/targets/order, CTA label/visibility; contacts from shared settings |
| 2 | Hero and search | Single H1, initially “Find your study options in the USA”; short supporting sentence. Programs/Institutions selector, keyword field and Search button. Search stays visible across configurable hero slides. | Heading/copy, hero mode, connected-storage images/alt/focal position, slides/order and motion controls, default collection |
| 3 | Assistance strip | Two or three concise factual benefits, such as discovering options, understanding next steps and contacting a counselor. | Editable text/icons; optional section; no invented statistics or service promises |
| 4 | Featured institutions — later | Explicitly omitted for launch by the owner. Institution browsing remains available through navigation and the search selector. | Separate later feature; no launch picker or ordering workflow |
| 5 | Program discovery | Four to six eligible programs from the existing supported list order, and “View all programs.” Show linked institution/location only where supported. Do not show unverified price/intake/degree/accreditation. | Count, visible fields and heading; automatic supported order for launch |
| 6 | Planning guidance | Three compact steps: explore options, check requirements, talk through your application. Links to existing supported guides/contact paths. | Copy, icons, links, show/hide; reuse approved information |
| 7 | Study guides/articles | Three articles from the supported deterministic list. Cover optional; missing cover produces a polished text-only card. Initially “Study guides,” not “Latest.” | Count, heading, cover treatment; manual curation is later |
| 8 | Counselor CTA | Clear “Talk through your study options” with WhatsApp/email; Apply link can remain secondary, without implying working form submission. | Shared contact destinations; editable heading/copy/action labels |
| 9 | Footer | Useful navigation, original policy paths, contact links and existing required framework attribution. | Group labels/links and approved brand copy |

Subject/degree/city/intake widgets are not launch controls merely because a settings flag exists. The currently served directory accepts `type`, `q`, `page`, and searches titles. Do not label keyword matching as structured subject filtering. Add real structured filtering only as a separately tested extension; hide unsupported controls. Optional collection shortcuts may use clearly described title-keyword searches with verified non-empty results.

Suggested desktop hierarchy: compact navy/charcoal header band, short hero, white search panel, generous white content area, consistent cards and a restrained counselor panel. Search may overlap the hero/content boundary visually if it remains readable and stable. Avoid a full-screen banner, duplicate heroes and article byline/date on `/`.

## Appearance and template settings

Proposed location: Settings → Template settings inside the existing `/frontbase-admin` settings surface, linked from the builder's shared site controls. This is a new panel in the existing admin, not a separate dashboard. Presentation settings are versioned in the existing saved homepage layout root, through its expected-state-hash save flow. Shared site configuration remains the authority for branding, contacts, datasource and routes. This avoids changing the approved content configuration revision for a color or hero change; it adds no separate settings database.

Initial presets:

| Preset | Page surface | Text/header | Accent/action |
| --- | --- | --- | --- |
| Neutral Navy (initial default) | White, subtle gray section surfaces | Charcoal body, navy header/headings | Accessible blue/navy with clear focus |
| Neutral Charcoal | White, subtle gray section surfaces | Charcoal body/header | Restrained dark accent with clear focus |

A preset is an editable starting point. Selecting it updates shared public-template tokens, not the admin's Light/Dark/System preference. Implemented advanced controls expose background/surface, text/muted text, primary/border colors, system/serif fonts, container width, section spacing and radius. Separate hover/focus colors, typography scales and card density are not shipped controls in this increment. Avoid raw CSS/JavaScript fields and externally loaded arbitrary fonts as a shortcut.

Precedence: preset defaults → shared token overrides → intentional builder component overrides. Settings explain when a component's explicit override prevents a shared change. Theme changes preserve record selections, page content and custom layouts. Resetting a preset is explicit and reviewable; draft changes do not silently activate a new version.

Stock template styles must reference these shared tokens; existing literal colors cannot simply be left in place beneath a nonfunctional preset picker. Verify token rendering through the existing style sanitizer/renderer and builder. Track deliberate user overrides separately from stock defaults so an upgrade/preset change does not erase them. The strict saved-layout root contract carries `directoryLanding: {version: 1, settings}` with schema defaults, not arbitrary unvalidated keys. New engine builds must read old captures; an older engine is not promised to read new settings/captures.

Controls cover hero content/slider, section visibility, headings and per-section counts. Section reordering, card-field customization and action labels remain editable in the builder composition, not dedicated settings controls. Featured record selectors and their ordering workflow are deferred. Branding/country/contacts/datasource/storage remain shared site configuration. Each connected-storage asset is selected through the existing media controls; templates contain no Garage domain, bucket or credentials. Missing optional images collapse rather than create blank blocks.

### Configurable hero imagery and slider

- Modes: plain surface, single image, slideshow; selected in template settings and editable through the existing builder/media controls.
- Slides: add/remove/reorder; choose connected-storage image, descriptive alt, crop/focal position. The current overlay is a fixed restrained gradient; dedicated overlay-strength, slide caption and slide-link settings are deferred. Use one persistent H1 and search panel, not repeated page headings or moving search fields.
- Presentation controls: compact/standard hero height, mobile height, text/image arrangement, arrows and pagination indicators. Preserve readable contrast and allow a static-image layout with the same content.
- Motion: manual navigation is default; optional autoplay requires a visible pause control, sensible interval, pause on focus/hover and reduced-motion support. Keyboard controls and accessible slide labels are required. Avoid an infinite animation or autoplay that prevents reading/search.
- Zero images falls back to the plain preset surface; one image renders without redundant slider controls. Reserve dimensions and prioritize the first visible image; later slides must not block first render or load every full-resolution image eagerly.
- Reuse an existing compatible image-carousel component if proven. If absent, add only the bounded generic component/behavior through the existing component system and same renderer; no third-party page builder or separate rendering path. SSR/static fallback and builder parity are acceptance gates.

Accessibility feedback includes contrast failures, missing required labels/alt, invalid local links and unsupported collection selections. Publish preparation must refuse invalid settings; contrast guidance should not imply automated accessibility certification.

## Data and publication design

The USA site continues to use public.institutions, public.programs, public.cities and public.countries through its connected datasource/country mapping. An institution has many programs and one city reference; multiple institutions may share the same city. No copied USA-only content database is introduced. Public cards resolve exclusively from the selected immutable publication after capture, not fresh canonical requests on each visit.

Initial available staging selection is16 institutions/185 programs. Launch program cards use only listings admitted to the published selection;110 held-offering notices are not eligible as available cards. Featured institution selection is later. Expansion beyond the original WordPress selection remains intentional but requires the normal data/availability/publication process, not a homepage filter bypass.

Launch sections use the existing deterministic eligible list order with a bounded count. Manual curation is deferred:

- Later featured feature: choose admitted record IDs through a visual picker, save manual order and revalidate eligibility before capture. These controls are deliberately not required for the launch homepage.
- Automatic: deterministic eligible list with an explicit supported order and count. Initially alphabetical is truthful; do not advertise popularity/ranking/latest without implementing those semantics.
- Empty optional section: hide it in public output; display an actionable editor hint. Required search/header/contact paths cannot silently disappear.

Parent names/location and any program count must be derived from public records in the SAME version. Count only captured available programs, not the larger Supabase catalog. A full institution description cannot be mistaken for a university partnership statement. Provider IDs remain backend/admin data.

Homepage route ownership must be deliberate. `/` currently belongs to a recovered editorial record. Recommended implementation: a saved builder landing page captured as an ordinary/static page with bounded public list bindings, explicitly replacing the selected editorial rendering for `/`. Preserve the original semantic content/approval privately for rollback; remove only the duplicate homepage from the new public capture selection. Never delete its canonical source record or weaken duplicate-route rejection. The original1,280 content routes and1,282 sitemap identities remain accounted for; move across capture page categories may change category counts and must be reported honestly.

Retain the existing guarded page-change and configuration-save contracts, immutable manifest, whole-version review and expected generation/hash activation/rollback. No raw settings/DB edit or ad hoc deployed HTML replacement is the delivery path. One site's changes stay within its engine/owner scope.

## Inspected gaps and bounded implementation prerequisites

These are not shipped capabilities:

| Finding | Required treatment |
| --- | --- |
| Configuration schema currently has no appearance/landing/hero-slider contract | Add optional, versioned/backward-compatible template settings with explicit defaults; preserve old captures/layouts. Save through existing revision controls and capture exact values. Featured/curation schema is later. |
| Current record bindings expose title/summary/body but not location, parent label or per-institution available count | Reuse existing relationships; add narrowly allowed derived public fields/projection and builder controls where needed. No arbitrary record dump/private column access. Hide a field until proven. |
| Current immutable list queries lack curated ID/order selection | Deferred with the separate featured feature. Launch uses the existing supported deterministic list and bounded count; do not build a picker now. |
| Runtime list rendering currently applies directory page size/visitor search rather than each homepage section's saved selection | Honor captured landing/static list parameters while retaining current directory visitor semantics. Bound list reads; no N+1 canonical query per card. |
| Current editorial `/` would collide with a saved homepage | Add an explicit, reviewable capture-selection choice for the homepage only; original route identity/duplicate-route guard remains. Preserve previous version for rollback. |
| Existing DirectoryBrowsing admission is directory/article-index specific; Apply's public form is intentionally inert | Verify existing safe native GET primitives first. If a reusable search primitive/admission change is required, keep it bounded to configured relative directory action and allowed `type/q` fields. Never reuse or enable the Apply form as the search machinery. |
| Current list sorting is alphabetical; “Latest” article list is not proven | Use selected study guides initially, or separately implement/test declared chronological ordering before using that label. |

Do not make search, routing or data selection depend on theme tokens. Layout appearance changes must not affect availability or access rules. Do not use a site-specific second renderer, separate admin, new package or public live Supabase query to avoid these constraints.

## Core, template and site ownership

| Core Frontbase | Education template | Per-site configuration/data |
| --- | --- | --- |
| Existing renderer/compiler/components/Repeater; generic safe GET search, token projection and bounded public selection capabilities if missing; validation, revision/preview/capture/review/rollback and owner isolation | Editable landing layout, card compositions, section defaults, two appearance presets, education collection/relationship mapping defaults | USA/Hungary name/country/domain, chosen preset/overrides, media, selected records/order, copy/contact/menu targets, credentials and source data |

Current education-profile source coupling remains documented in the packaging review. This delivery must leave the landing layout exportable/configurable without pretending the general template installer is already production-ready. No USA name, country ID, service hostname, credentials or selected record IDs become framework defaults. A Hungary configuration smoke proof can use synthetic public records without another deployment or data migration.

## Delivery order and checkpoints

1. **H1: composition and visual draft.** Confirm received preferences, inspect available approved media, finalize desktop/mobile layout and representative card states. Produce a reusable builder composition using existing primitives. Show the visual direction before doing broad new UI work. No listing/content migration or production action.
2. **H2: settings and minimum data contract.** Implement appearance presets/overrides, configurable hero/slider, section controls and bounded automatic list counts through existing admin. Featured selectors are later. Resolve launch prerequisites, preserving old captures and owner controls. Prove shared appearance updates on home/directory/details; changing navy/charcoal must not unexpectedly restyle ordinary custom pages or the admin.
3. **H3: real bound homepage.** Wire program/article Repeaters, hero/media and supported GET search; institution browsing uses navigation/search, with its featured section omitted. Capture the saved landing page as the sole owner of `/`; keep every other content path/data/form intact. Validate automatic lists/counts and hide unsupported relationship labels and exact old/new snapshot differences before review.
4. **H4: staging acceptance and handoff.** Review/render the exact candidate; activate only staging through existing expected-pointer controls. Verify desktop/mobile, keyboard, actual search/contact navigation, appearance settings, published version stability and rollback. Present the final homepage for owner visual acceptance, update the cutover packet/hash and preservation receipt. No production DNS switch without its approval/access.

These checkpoints are sequential dependencies, not four new independent feature waves. Source tests/builds are run once per meaningful code checkpoint, broadened only for a changed contract or failure. Do not reopen the957-article refresh, held-offering survey, Apply upgrade, general installer or deferred backup work to finish this homepage.

## Acceptance checklist

- Hero/search and first discovery section provide a useful first screen at desktop; mobile presents heading/search without excessive whitespace.
- At320/375/768/1024/1280/1440 widths: no horizontal overflow, clipped search/menu, overlapping text or awkward breakpoint jump. Use smooth fluid widths and existing responsive styles; cards1/2/3 columns as space permits. Avoid JS-only carousels for launch.
- Keyboard/visible focus, meaningful labels, menu behavior, touch targets, readable contrast, one H1, logical headings and descriptive card links. No decorative image needs misleading alt text.
- Programs/Institutions search opens the relative configured directory with `type/q`; empty search browses the selected collection; typing special characters cannot inject markup or extra unauthorized query behavior. Relevant no-results state comes from the actual directory.
- Preset and advanced changes persist after reload, appear in builder and exact reviewed output, preserve custom overrides/content, and roll back with the published version. Stale settings saves fail safely.
- Automatic list/count matches admitted records with stable supported ordering. No featured institution section/picker ships in this increment; no held notices shown as available offerings or private/provider fields leaked.
- Parent institution/city labels are not exposed by this landing increment and are omitted. Existing institution/program URLs are unchanged; cards link to those exact paths.
- Empty/missing covers look intentional. Reuse connected public media, reserve image dimensions and lazy-load below-fold images; no new hotlink to the WordPress domain. Hero imagery must have approved provenance.
- Hero modes/slides/order and settings persist in preview/capture/rollback. Test no-image/one-image/multiple-image states, keyboard/manual navigation, pause and reduced motion; search remains usable across slides.
- `/` and original canonical SEO identity remain; article byline/date are omitted on home but retained where appropriate on article pages. Absolute canonicals/sitemap/Open Graph and relative internal links are verified separately. Staging stays noindex.
- Non-home content and original URL/sitemap identities are preserved by exact capture comparison; affected templates/navigation receive targeted route/browser checks. Repeat full enumeration only if route composition changes require it.
- Whole-version review/conditional activation/rollback, owner and public no-leak gates remain; no hidden fetch to private canonical data. Preserve saved Apply layout and its intentionally inert status.
- Required workspace check/build, appropriate component/query/publication/compatibility and changed security mutation gates pass. Record initial failures, correction results and credential-gated skips honestly.

## Owner inputs and execution boundary

All three questions are resolved: neutral navy/charcoal presets; configurable hero imagery/slider; featured institutions as a separate later feature. No further input is required to start H1. Final visual acceptance remains a review of the actual staging result, not an inferred production approval.

The original planning increment changed no source or publication. The subsequent owner-authorized implementation is delivered on staging: reviewed capture and guarded rollback/restore pass. Obtain owner visual acceptance next. Featured selectors remain outside this launch increment.
