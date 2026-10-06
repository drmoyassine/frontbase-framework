# USA forward harmonization

**Updated:** 2026-10-05. **Status:** city/admissions/import/classification and bounded location fills verified; detailed program/editorial audits complete, full field/media/publication acceptance open. Owner confirmed ELS umbrella institution 852 and its original URL was filled; anomalous course remains open. Twelve reviewed images now use connected Garage storage (eleven ELS institution images and one Muhlenberg program image). [Current media/preview evidence](wordpress-pilot-garage-storage.md), [active plan](wordpress-pilot-roadmap.md), [P1 preservation](wordpress-pilot-p1-results.md). Older counts and unresolved-state statements below describe their original increments, not the current media/identity state.

## Owner-confirmed rules

The main directory collections remain `public.institutions`, `public.programs`, `public.cities` and `public.countries`. Supabase content is authoritative; preserve WordPress's original public URLs and use source evidence for verified empty/missing fields. Do not create parallel institutions/programs collections. Extra Supabase records are intended expansion, never completeness failures. Completeness runs from each original WP record/public URL to its canonical destination. Source snapshots alone do not satisfy the live directory requirement.

`provider_id` is backend/admin data and need not exist in WordPress. Preserve current assignments; exclude them from public projections. New canonical institutions need real admin assignments because the existing required FK references `public.providers`. There is no valid provider 0/unassigned record; no existing institution uses that default. Do not invent one or treat its absence from WP as a source gap.

Media binaries use administrator-connected Frontbase storage buckets. Content rows reference those files. Original blog/page content still needs its additional reviewed content model; this does not replace the existing directory tables. Supabase descriptions take precedence over recovered WP descriptions; filling an empty field does not certify recovered source facts as current.

## Verified work

Read-only refresh inspected all 739 canonical institutions, the 258 source-domain program URL matches and USA city records. It confirmed all 258 original programs have canonical descriptions, valid institution parents and populated city/USA country IDs. It did not establish complete field-level/content/media equivalence.

Nine missing source cities were inserted into `public.cities` with USA country ID 22 and their source term IDs, under a transaction/table lock and guards against duplicate city names or conflicting source term IDs:

| City | New canonical ID | Source term ID |
|---|---|---|
| Cincinnati | 434 | 195 |
| Houston | 435 | 197 |
| La Verne | 436 | 198 |
| Melbourne | 437 | 199 |
| Murfreesboro | 438 | 200 |
| Philadelphia | 439 | 202 |
| San Rafael | 440 | 204 |
| St. Petersburg | 441 | 206 |
| Tampa | 442 | 207 |

Existing Cleveland 208, New York 112 and St. Paul 225 were retained. Saint Paul→St. Paul requires both the matching source term ID 205 and bounded name equivalence in USA; no city was merged by a broad fuzzy-name guess. Before/after records and an unreferenced-city rollback proposal are protected outside Git.

Eight original programs had empty canonical admissions requirements and nonempty source admissions fields. Filled requirements for IDs 46181–46187 and 46189 with source text reduced to plain text. Every update required exact original URL/ID/institution/city/country, an empty field and the unchanged prior value. All eight exact readbacks passed. The preexisting populated requirements value was retained; every populated description was retained. Before/after/source fields and exact-value guarded rollback are protected. These are recovered admissions facts, not newly verified current university policies; retain provenance and review before public launch.

The [forward analysis tool](../../scripts/migration/harmonize-wordpress.py) classifies original institutions/programs/pathways against canonical tables, ignores extra canonical rows as gaps, separates identity/publication approval and reports provider/city/parent prerequisites. Original pathway courses are candidates for `public.programs`, not a new parallel pathway directory. All 35 captured pathway records have a unique campus candidate established by explicit source parent relations plus nested original route; 34 use normal `publish`, while source 2606 has anomalous `published` status and remains review-only. This relation evidence is not an internal provider assignment.

## Confirmed campus assignment and remaining identity

Twelve missing campus/university institutions now have unique existing/new city matches:

| Original institution | City |
|---|---|
| University of Cincinnati | Cincinnati |
| Case Western Reserve University | Cleveland |
| University of St. Thomas, Houston | Houston |
| University of La Verne | La Verne |
| Florida Institute of Technology | Melbourne |
| Middle Tennessee State University | Murfreesboro |
| ELS New York | New York |
| Saint Joseph's University | Philadelphia |
| Dominican University of California | San Rafael |
| University of St. Thomas, Minnesota | St. Paul |
| Eckerd College | St. Petersburg |
| University of Tampa | Tampa |

Owner confirmed ILSC Language Schools (provider 34) for these ELS campuses and requested names that reflect their ELS scope. All 12 were inserted into existing public.institutions as IDs 878–889 with their verified city/country and original WP URL/ID. University/college names use ` - ELS Center`; New York is `ELS New York Center`. Existing university/provider records were preserved. The original source titles remain in private evidence. `connect_wp=false` prevents enabling legacy synchronization for these new records.

Imported all 34 normal-published source pathways into existing public.programs, linked to the corresponding new campus. Original names and nested WP URLs were retained. Type is Pathway, language English and level Short Course; the source Preparatory Foundation taxonomy is retained in private source evidence, not added to the backend's managed level list. New records have Draft status for publication review. Tuition/duration defaults are unknown values, not verified free pricing or zero duration; gate public display until reviewed. Source 2606 with nonstandard status was not imported automatically.

The first course attempts rolled back: the existing managed-level trigger rejected Preparatory Foundation; after using the allowed Short Course level, a separate existing logo-copy trigger copied NULL from the new campus into a required program logo. Normalized only the 12 new campus logos to empty text, leaving actual media migration pending. No trigger/constraint/list/schema/security policy was weakened or changed. Final course readbacks verified all 34 IDs/names/URLs/parents/cities/country/type/level/draft states.

Also confirm whether source institution 3458, ELS English Language Services at `/els-english-language-services/`, is the existing ELS Language Centers institution 852. This source page references 14 cities, so do not assign it an arbitrary first city or create a duplicate. If confirmed, preserve its existing city/provider/content and add the original website URL using guarded persistence. Multiple old aliases, if needed, require an explicit alias map rather than overwriting a populated canonical URL.

The earlier 48 protected candidates are historical pre-import evidence. Fresh forward audit now matches 17/18 institutions, 258/258 original programs and 34/35 captured pathways (all 34 normal-published pathways). Remaining listing identities are the ELS umbrella and anomalous-status course. There are 309 canonical matches among the 310 normal-published source listings; this is identity coverage, not live HTTP/content/publication approval. The four unresolved article/page paths and live blog collection remain separate open work.

## Evidence and checks

### Detailed-data continuation

Inserted verified missing Minneapolis city 443 (USA 22; no invented WP term ID), then jointly corrected ELS institution 887's physical city/address. Existing triggers correctly updated its three linked Draft courses to Minneapolis, preserving all original URLs. Stored nine coordinate pairs from single US Census address matches whose city/state/postcode matched official ELS street addresses. These are **interpolated approximate street-address points**, not surveyed entrances: [Census accuracy documentation](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html). Exact request/results, benchmark and precision notes are preserved privately and in each new institution's admin notes. Cincinnati's same-street match has ZIP 45219 versus ELS 45221 and is held for review. Cincinnati/New York/Tampa coordinates are now NULL rather than misleading 0,0; the five preexisting authoritative university profiles remain unchanged. Independent readback verified every expected field and Minnesota's three course city/draft states.

The reusable [program-field auditor](../../scripts/migration/audit-program-fields.py) accounts for 293 original courses, 292 matched and the anomalous-status identity separate. Source awards/taxonomies establish the original 258 university programs as academic degrees/certificates. Filled only the 257 blank canonical type values with existing Academic vocabulary, retaining the one populated Academic value and 34 Pathway classifications. Exact source ID/URL/parent/level/prior-value and parent-logo guards protected the fills. Before/after comparison across every fetched field found zero unexpected changes, allowing only these type fills and the previously verified Minnesota city correction. No populated fees, duration, description, admission, category, status or URL was replaced.

Remaining matched-course field gaps: 291 covers, 283 admissions requirements, 34 degree labels/currencies/duration units/modes/intakes, 35 categories, 289 external program URLs and 292 entry points. Some fields are optional or not applicable; classification as a gap does not authorize fabricated values. All 34 new ELS courses have zero duration/tuition defaults, and 35 matched courses have zero application fees requiring interpretation. Zero is not a verified free price. Historical source tuition includes 35 weekly and 248 yearly fees plus ten amounts without an explicit period. The current programs table lacks a fee billing-period field; the public data contract must preserve currency, period and verification date before showing a recovered price. Historical source values are privately preserved, not certified current.

Availability checks covered 20 distinct original course cover references: one 200/image (already populated), seven 403 responses and 12 Imgur 429 responses. No new course image was falsely marked available or blindly copied. A 403/429 does not prove the file absent; recover originals from source storage and transfer reviewed assets into connected storage. Current ELS IELTS pages flag a [closed New York testing center](https://ielts.els.edu/portfolio_category/new-york/) and a [Tampa testing location moved to St. Petersburg](https://ielts.els.edu/portfolio/); testing-specific notices do not conclusively establish language-course availability, so the owner-selected Active admin status was retained and the availability review stays open.

The [editorial collection proposal](wordpress-pilot-editorial-model.md) records 957 articles/14 pages, complete recovered dates/bylines, four unresolved paths, 58 thumbnail references and 151 unresolved internal-link occurrences. No canonical article table or public content grant was created; source snapshots already preserve every captured body privately. Configuration/publication architecture remains a proposal.

Protected artifacts: `p1-els-geocoding.json`, `p1-els-geography-before.json`, `p1-els-geography-changes.json`, `p1-els-geography-verification.json`, `p1-program-detail-before.json`, `p1-academic-type-fills.json`, `p1-program-detail-after.json`, `p1-program-detail-audit-after.json`, `p1-program-cover-verification.json`, `p1-editorial-field-audit.json` and guarded `p1-detailed-data-rollback.sql` proposal. Migration tests passed 27/27. Required workspace check passed after an unsandboxed rerun resolved access to existing React dependency junctions; initial sandboxed check failed TS2875 without a code change. Workspace build passed with existing warnings; tracked CMS artifact refreshed. No runtime security, schema/grant/policy or production publication changed; new mutation/provider/cutover checks were not run for analysis/data tooling.

### Institution field completeness correction

The campus import established identities/relationships but omitted required profile fields. Following the owner's correction, guarded fills on all 12 new ELS records set `type=Language School`, `super_type=Institution`, owner-selected `Status=Active`, `domain_url=https://www.els.edu` and the available official ELS brand logo. Eleven `institution_image` references passed HTTP 200/image-content-type checks: ten current official destination hero images and the preserved available New York image. Nine current center street addresses were saved from official ELS location pages. Original WP URLs/IDs/provider assignments remain unchanged. These are externally hosted references; connected-storage media transfer is still outstanding.

Separate readback found zero field/identity mismatches across 12 institutions. Existing database triggers propagated the logo and `institution_listed=true` to all 34 linked courses; all 34 course statuses remain Draft. Active is the owner's admin selection, not certification that every historical center still operates. The official [destination list](https://www.els.edu/destinations) and [ILSC center profiles](https://resources.ilsc.com/en/knowledge/els-center-location-profiles) omit New York and Tampa from their main lists; current availability needs review. Tampa's recovered cover is access-blocked and has no verified replacement yet.

Coordinates remain unverified, including all five previously matched universities: all 17 matched source institutions still contain default `0,0`, which must never be displayed as valid map pins. WP campus metadata contains no coordinates; current official map embeds use textual place queries rather than explicit coordinate pairs. Exact center geocoding and validation remain a required acquisition step. [ELS Houston](https://www.els.edu/destinations/houston) is off campus; [ELS Minnesota](https://www.els.edu/destinations/st-paul) lists a Minneapolis address rather than the original St. Paul city. Minnesota address/city/coordinates need one coherent correction; no conflicting street address or guessed university coordinates were written. Host-university founding years, student counts and mottos were not copied into language-center fields because their scope differs. Empty galleries/videos and unavailable media are explicitly incomplete, not silently accepted.

Protected `p1-original-institution-field-ledger.json` accounts for all 17 matched source institutions across classification/status/domain/logo/cover/address/tagline/year/student-count/gallery/video/coordinates; source 3458 remains unmapped. A populated field is not automatically current or approved. Six matched institution covers and 17 coordinate pairs remain incomplete. The five existing authoritative institution profiles were retained. Protected field-fill before/source/proposal/after/separate-verification files and `p1-els-fields-rollback.sql` provide exact evidence and a guarded rollback proposal. No framework code, schema, constraints, managed lists, grants or publication runtime changed in this correction; workspace tests/build were not rerun for the data/documentation-only increment.

Protected evidence in the P0 chat directory: `p1-harmonization-baseline.json`, `p1-harmonization-canonical-current.json`, `p1-harmonization-cities-after.json`, `p1-forward-harmonization-plan.json`, `p1-guarded-import-candidates.json`, `p1-requirements-before.json`, `p1-requirements-fills.json`, `p1-requirements-after.json` and guarded rollback files. No recovered bodies, connection secrets or raw backend exports are added to Git.

Migration suite **23/23 passed**, including expansion direction, provenance-bound city abbreviation and campus/umbrella separation. `pnpm -r check` and `pnpm -r build` exited 0 with existing warnings. No schema/grant/policy/provider changes, production deployment or publication-guard removal occurred. Runtime security gates were not rerun because runtime security behavior did not change. Required build refreshed the existing tracked CMS artifact. Code/docs remain uncommitted; unfamiliar diffs preserved. Framework release scope and CF-22 pause are unchanged.

Protected continuation artifacts: `p1-els-campus-inserts.json`, `p1-els-campus-after.json`, `p1-els-course-inserts-final.json`, `p1-els-course-after.json`, `p1-els-canonical-after.json`, `p1-els-forward-audit.json`, and guarded import rollback proposal. Final inputs use Short Course; the earlier candidate file with the rejected source level is retained as historical evidence, not an executable final plan.

Next executable action: confirm the ELS umbrella mapping, review anomalous-status course 2606, then complete editorial/media/publication acceptance. Preserve expanded canonical rows and current content. No production publication occurred; the new courses remain drafts.
