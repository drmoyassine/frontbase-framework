# USA migration: P1 preservation and source recovery

**Executed:** 2026-10-05. **Status:** captured-source preservation complete; canonical reconciliation and publication model remain in progress. [Active plan](wordpress-pilot-roadmap.md), [P0 baseline](wordpress-pilot-p0-results.md). No public cutover, runtime publication change or new schema was performed.

## What changed

All **1,445 records in the captured WordPress export** are now preserved in the existing private Supabase recovery table: 957 posts, 311 listings, 14 pages and 163 attachment records. This added the missing 880 posts and 55 attachments. Attachment records describe files; this is not a claim that all image/download binaries have been copied.

The original 1,445 snapshots remain intact. A second version of each record adds separately captured editorial evidence, making 2,890 stored versions of 1,445 distinct source identities. Original body capture is 2026-10-04 11:28:44 UTC; editorial capture is 2026-10-05 06:11:12 UTC. Each enriched payload records both dates, rather than pretending the reads were one consistent backup.

The reviewed read-only [source collector](../../scripts/migration/wordpress-supplement.py) recovered original publication/local/GMT dates, public author names and attachment MIME types for all 1,445 identities. None of the captured GMT publication dates is zero. It also captured 36 menu items, their metadata/menu assignments and nine Fluent Forms UI definitions. Navigation/form evidence is attached to source homepage ID 132 in its private enriched version. Menus' theme locations, translations, actual form delivery/integrations/consent and submission behavior still require inspection. No user emails/passwords, submissions or site options were read by this collector.

Two precisely guarded canonical corrections were made:

| Record | Change | Verification/limit |
|---|---|---|
| Institution 512, source 3615 | Filled an empty Muhlenberg description with the reviewed 1,553-character plain source text | Exact source/target URL, institution/city/country identity and unchanged blank-before value checked. Readback exactly equals source text |
| Program 46188, source 3639 | Filled an empty cover field with the original `Muhlenberg-College-cover.png` URL | Exact program URL/parent/city/country and blank-before value checked; URL returned 200 `image/png`; protected copy has PNG header, dimensions 1120×630, 286,930 bytes, SHA-256 `4024b4d119f5ae8101988abcacfdecd372a85c3213ded3ba27264cda47183024` |

The cover link currently depends on the old WordPress host. Move the preserved file to approved replacement storage and update its reference before cutover. Header/type/checksum checks are not a malware clearance. The institution cover `Muhlenberg-College.png` returned 404, so its empty canonical cover was not filled with a broken link. Recover it from source uploads or backup.

Muhlenberg program description differs from the source: normalized source body is 1,094 characters; canonical description is 2,646. Canonical requirements are populated. These values were retained for field/editorial comparison rather than overwritten. A longer description alone does not establish which version is authoritative.

## Remaining data decisions

| Area | Evidence / next action |
|---|---|
| 13 original institutions | No reliable canonical matches found by exact source URL/WordPress IDs or bounded name-candidate lookup. Their source children are pathways, rather than the matched original programs. Verify city/provider identity before canonical import; existing `institutions.provider_id` is mandatory. Do not manufacture an internal commercial relationship to satisfy that constraint |
| 34 pathways + anomalous status | Preserve explicit source relations; define the consumer publication model and reviewed mappings separately from CRM commercial agreements |
| Four uncertain paths | Page IDs 134/3811 and posts 5961/7553 still lack stored custom permalink evidence. Slugs/GUIDs are retained as candidates, not approved canonical routes. Blog page GUID references the Hungary clone; do not adopt that origin |
| Original articles | All bodies/categories and recovered dates/bylines are privately preserved. A reviewed article collection/public projection, rich-content sanitation and editor/publish integration still need implementation |
| Media | 163 attachment records preserved; only the bounded program cover binary newly copied in this step. Check/recover other covers, galleries, inline media and downloads |
| Menus/forms/languages | Navigation entries and nine form layouts captured. Verify page-role binding, active menus, delivery settings and actually used language/member/payment behavior before publication |

Content review flags: page 3811 embeds an external jobs service; post 4664 includes an inline JavaScript alert link. These observations do not establish exploitation. Neither is approved for direct execution; decide how to replace the jobs integration and convert the link to safe supported content. All recovered material remains untrusted and publication eligibility stays unreviewed.

Owner clarification supersedes the earlier parallel-listing proposal: harmonize the existing public institutions/programs/cities/countries tables; Supabase content is authoritative and WordPress supplies preserved original URLs and evidence for missing fields. Additional Supabase rows are intentional expansion. Provider assignments are admin fields, not WP source requirements. Media binaries use Frontbase-connected buckets. Only missing editorial content needs its additional reviewed model. See [forward harmonization and verified gap fills](wordpress-pilot-harmonization.md). The shared application configuration/publication architecture from P0 remains proposed.

## Verification and recovery evidence

Protected artifacts remain outside Git under the chat evidence directory named in P0:

- `p1-preservation-verification.json`: 1,445 expected fingerprints, 1,445 actual, zero missing/unexpected.
- `p1-enrichment-verification.json` and detailed verification rows: all 1,445 enriched identities/fingerprints match; body MD5, metadata/term/relation counts and recovered publication dates/bylines match the local expected values, zero mismatches. Body MD5 is an equality check, not a security approval.
- `p1-wordpress-supplement.json`: source dates/bylines/menu/form UI evidence; no transaction-wide consistency claim.
- Before/after canonical record files and `p1-reviewed-corrections-rollback.sql`: guarded restoration of the two exact before-values, prepared but not executed.
- `p1-institution-parent-evidence.json`, `p1-content-review-flags.json`, `p1-program-field-comparison.json`, `p1-muhlenberg-program-cover.png` and `p1-privacy-after.json`: reconciliation, content/media and access evidence.

Post-write checks confirm staging RLS remains enabled, with `anon`/`authenticated` schema usage and table SELECT denied. No grants, policies, providers, commercial links or other canonical fields changed. Imports are idempotent and retain old versions; the private table is recovery evidence, not a public blog API.

Migration tests passed **20/20**, including invalid database rejection, failed-query output redaction and missing-form-schema behavior. `pnpm -r check` and `pnpm -r build` exited 0; existing bundle warnings remain. No new engine/auth/security runtime changes were made, so runtime mutation/provider/cutover gates were not rerun. Existing generated CMS diff remains in the worktree; no deployment or release was made. Owned changes: the source collector, focused migration tests, this report, roadmap and audit notes. Changes are uncommitted; unrelated files remain preserved. R0 remains in progress and CF-22 remains paused.

Automatic approval review rejected a connection to an alternate IP; the supplied recovery file and prior recovery report both identify `31.187.76.205`, which was successfully used instead. A temporary restricted key copy was deleted after each command, leaving the original unchanged. Review also rejected the initial collector's site-options read; the collector was narrowed to exclude those options and then approved. No rejected action was executed.

**Next executable work:** recover the four paths and missing asset files from source/backup, resolve the 13 institution/34 pathway identities with verified city/provider evidence, and present a concrete article/media/publication model. Live template binding and coherent publication follow those decisions; the website replacement is not complete.
