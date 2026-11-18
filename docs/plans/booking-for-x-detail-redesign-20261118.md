# Booking for X institution and program detail redesign

Status: implemented and verified locally. Study-in-USA is the first adopter. Its live records and publication were inspected read-only. Draft review and hosted qualification remain open.

## What the comparison shows

- The current Dominican route shows a cover image and the title “Dominican University of California - ELS Center,” then the footer. The legacy Dominican page identifies the university itself and includes a profile, programs, consultation, facts and location. Confirm whether the current route intentionally represents the ELS center before changing any record association. [Frontbase Dominican](https://study-in-usa-frontbase.frontbase.workers.dev/dominican-university-of-california/) · [Study-in-USA Dominican reference](https://study-in-usa.com/dominican-university-of-california/)
- The University of Debrecen reference introduces the school with campus media and a clear Browse Programs action. It separates the profile from practical details such as quick facts, gallery and location. [Debrecen institution reference](https://study-in-hungary.com/university-of-debrecen/)
- The current Advertising route shows the program title and footer. The Biotechnology reference gives the program and institution identities together, puts tuition, duration and Apply in the first screen, then provides overview, syllabus, careers and required documents. Verify which fields Advertising can actually supply. [Frontbase Advertising](https://study-in-usa-frontbase.frontbase.workers.dev/washington-state-university/advertising/) · [Biotechnology reference](https://study-in-hungary.com/university-of-debrecen/biotechnology-bsc/)

Before this redesign, the installer generated both detail pages through the shared directory starter, which created a cover, title and bound body paragraph. The richer Builder detail starter already supports mapped facts, Gallery, actions and an institution-to-program list. Bring those capabilities into the installed defaults through one shared layout implementation. [Existing installer plan](booking-for-x-installer-20261101.md) · [Gallery and layout precedent](detail-gallery-layout-20261025.md)

## Read-only source audit

| Study-in-USA detail | Current binding and evidence | Builder setup for the redesigned draft |
| --- | --- | --- |
| Dominican University of California | USA Institutions uses `public.institutions`. The canonical URL matches record 886, explicitly the ELS Center. It has an 820-character institution description, cover, logo, San Rafael location, street address and website. Three source programs point to it. Confirm any proposed university-versus-center change before changing route ownership. | Bind Full description to `institution_description`, Location to `city_name`, Institution type to `type`, Street address to `street_address`, and Website to `domain_url`. Preserve the current identifier and URL mapping. The live programs section follows the eligible USA Programs records for this institution. |
| Advertising | USA Programs uses `public.programs` and is reported as the published Program detail source. The URL matches record 45933, which relates to institution 508, Washington State University. Description, Bachelor of Arts, four years, tuition amount and USD, and intakes are present. Requirements, program cover and official program URL are empty. The current program page shows the title only. | Bind Full description to `description` and map `institution_name`, `degree_name`, `duration`, `duration_unit`, `tuition_fee`, `currency`, and `intakes` in Optional detail fields. Let missing requirements and cover collapse. Confirm the fee period and configure an approved action destination in the Builder before using an Apply link. |

The mappings above use existing source columns. The implementation introduces no SQL migration or site-specific column names in the template code.

## Proposed layouts

| Area | Institution | Program |
| --- | --- | --- |
| Header | Wide campus image when available, logo, institution name and location. Browse Programs is primary when related records exist. Consultation is secondary. | Program title and linked institution, with logo or approved cover when available. Put degree, duration and verified tuition near Apply. Offer an inquiry or consultation when configured. |
| Navigation | Profile and Programs with shareable section anchors. Desktop can show a compact section index for long profiles. | Horizontal jump links to populated sections. Keep the primary action visible near the title and easy to reach on mobile. |
| Content | About and highlights, then the institution-scoped programs list. Put practical facts, official website, gallery and location alongside the profile where space allows. | Overview, entry requirements and intake first. Add curriculum, careers, tuition and funding when populated. Show institution, location and key facts in a compact side panel. |
| Mobile | Stack identity, primary action and content. Keep section navigation compact. | Put identity, facts and primary action above the first long section. Use the same content order in Arabic with RTL alignment. |

Use existing theme tokens, menus and media. Keep identity and action placement consistent for records with sparse data. Hide empty sections and their navigation together. Show a compact text-led header when no suitable image exists. Show tuition currency and period only when the source supplies them. Actions use the configured destination and current record context. Keep a single primary action per page.

## Delivery order

1. **Check the data first.** In Data Studio and Builder, inspect the Saved Views on both Study-in-USA detail layouts. Verify the Dominican canonical record, then inventory title, cover and logo, location, description, institution relationship, degree, duration, tuition and period, intake and requirements. Distinguish missing source values from unmapped fields and layout omissions. Start with the selected public fields and existing relationships. Propose any source schema change only if this audit finds a specific gap.
2. **Review two desktop and mobile drafts.** Use Dominican and Advertising as the main specimens, plus one richer record and one sparse record per layout. Review English and Arabic. Agree on the hierarchy, action placement and missing-data behavior before wiring the full layouts.
3. **Ship through Booking for X.** Reuse the existing Builder component tree, Gallery, Saved Views, Bind and @, visibility conditions, and Actions. Use one shared layout generator for install and authoring, with ordinary editable nodes and stable identities. Institution programs use the configured relationship and eligible program Saved View with bounded pagination. Program institution links use the existing canonical route. Names, fields, filters, presentation and destinations come from template configuration. The other four installed entries and Explore Block Versions are outside this change.
4. **Offer an explicit draft upgrade.** Use the existing layout revision and review flow. Preview the proposed changes, preserve existing custom sections, binding references, route and translation identities and SEO settings, and prevent duplicate blocks on rerun. Prove the guarded upgrade on an older Booking for X installation before applying it to Study-in-USA. Review both resulting drafts privately before publishing.

## Acceptance

- Fresh install and existing-install upgrade yield two editable detail layouts. Test both in the Builder and in the actual public renderer. Verify that changing representative source facts appears without republishing.
- Existing English and Arabic URLs, canonical and alternate locale URLs, valid media, saved translations, and the correct institution-to-program relationship survive the upgrade. Validate the approved fallback when Arabic data or media is missing.
- Desktop and phone layouts work with short and long titles, sparse and rich records, keyboard navigation and RTL. Actions lead to the intended destination with the right record. Section links have visible targets.
- Reuse the live adapter query path, project only needed public fields, and keep images, video and maps off the critical path where possible. Measure request counts and warm/cold CPU for both detail types against the current Workers Free baseline with HTML caching off.

## Implemented

- Fresh Booking for X installations receive the editable institution and program layouts. A guarded Builder action can upgrade the original detail starter in place as a draft. It preserves the old record slots, preview path, and other page blocks. A customized starter shape stays available for manual editing.
- Owners can change layout and typography in Builder, select optional source fields in Page settings → Directory → Directory source fields, use the existing detail Saved View and URL selector, and configure the action destination under Template defaults → Notices & actions.
- The institution page uses Gallery, identity, optional profile facts, an About section and a related program list. Browse Programs appears only when the scoped program query returns rows. The program page uses a compact fact header, a configured Apply action, overview, requirements and intakes, and an eligible parent-institution link. Empty sections and unavailable media collapse.
- Related reads reuse the existing directory relationship and Saved View checks. Canvas previews resolve the same relationship and respect the selected Saved Views. The additional mapped fields stay out of list reads. Public content and approved translations remain live.

## Verification and next step

- Node 22.23.4 passed the workspace build and checks, the template-install type check, and 50 Builder tests. The installer, directory preview and its six mutations, live layout routes and serving, and English/Arabic source compatibility passed. The full Worker build was 845.6 KB compressed.
- Chrome passed the actual public renderer at 390 px and 1,280 px in English and Arabic using a disposable SQLite datasource and localized fixtures. It verified one heading, no horizontal overflow, cover decoding, related program scope and anchors, safe website destination, the configured Apply action, missing-field behavior, and a live description edit without republishing.
- Next, review the Dominican and Advertising drafts in Study-in-USA using the field mappings above and approved Arabic translations. Review navigation and media with real records, then measure detail-route request counts and warm and cold Worker CPU with HTML caching off before publishing. The current defaults provide Browse programs and its anchor; a separate section index and program jump menu are outside the implemented defaults.
## Study-in-USA publication preflight

- Production is at 100% on Worker version `0e8b832b-6bab-4f22-981b-0d75cf9e6ff1`, live layout generation 3 and configuration revision 6. The active version has 15 bindings and uses `studygram-state`. Both authored details match their active layouts and pass the guarded upgrade. An in-memory release with the two replacements and the existing six page IDs and two locales passed schema validation. Production drafts and the live pointer were not changed.
- On the current production layouts, Chrome confirmed both routes at 390 and 1,280 px in English and Arabic, with RTL, a visible heading and no horizontal overflow. Arabic titles on these specimens fell back to English. The proposed layouts still need hosted visual review and translated copy verification.
- Five tagged GETs per route at the canonical URLs captured 20 matching Cloudflare tail events. Every response was 200 with `X-Frontbase-Data: live` and `Cache-Control: no-store`. No cached response or Error 1102 was observed. Isolate identity was unavailable, so the values are a mixed production baseline.

| Existing layout | English median (range) | Arabic median (range) |
| --- | --- | --- |
| Dominican ELS Center | 9 ms (7–11) | 16 ms (15–26) |
| Advertising | 7 ms (6–19) | 12 ms (11–23) |

The owner explicitly approved uploading the new version to `study-in-usa-frontbase` with all 15 bindings intact. Automatic approval review rejected the upload again before execution. Read-only checks after the rejection confirmed the same 100% Worker version, all 15 bindings, publication generation 3, configuration revision 6 and four healthy no-store URLs. The local Chrome candidate matrix passed again. The next authorized deployment attempt should stage a version with no traffic, verify binding parity and the private candidate with real source records and saved Arabic copy, then publish both layouts using the current pointer as the expected value. Repeat this same desktop, phone and CPU matrix on the promoted version.
