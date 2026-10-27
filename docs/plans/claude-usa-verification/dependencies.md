# Workstream C — Media and internal-link launch triage (dependencies.md)

- Workstream key: **C**
- UTC date of evidence: **2026-10-10T21:08Z – 2026-10-10T21:40Z** (local Asia/Kuwait 2026-10-11)
- Baseline: branch `codex/wordpress-pilot`, HEAD `d3cd12277423e78538527400ba24cfe1c26ce237`, shared dirty tree preserved (no repo file outside `docs/plans/claude-usa-verification/dependencies.md` modified by this workstream)
- Assignment: independently inspect the existing media/internal-link queues; confirm or correct each number with a reproducible extraction rule; classify into (a) missing optional covers / (b) broken inline images+downloads / (c) unsafe URL+MIME / (d) internal links without a reviewed destination; optional bounded availability probe; finite prioritized queue.
- **No unqualified "migration-complete", "security-clean" or "launch-ready" claim is made anywhere in this report.** This is a delivery claim to the coordinator, not acceptance.

## Input hashes (SHA-256)

Private root `P` = `C:\Users\drmoy\.codex\visualizations\2026\10\04\01a105ea-d8e3-7251-9d16-58014053c4d6`; `E` = `P\garage-deployment\usa-fresh-reconciliation-20261010`. All hashed before first use at 2026-10-10T21:10Z and re-hashed at 2026-10-10T21:36:06Z: **identical before/after (no input changed mid-work; single snapshot).**

| Input | SHA-256 | Initial=Final |
| --- | --- | --- |
| `E\ledger-after\import-proposals.json` | `d6abc7a53379c31a3a6591c09d52ee32422d7274703e40bd5d7df88f2ebea340` | yes |
| `E\ledger-after\links-ledger.json` | `7350d56f61337751eb84d52c7d3123e2549bf75f218a623846ebda8a6b0a4d68` | yes |
| `E\ledger-after\media-ledger.json` | `10f5f0b8f404774bfa70e629efb54f509b097e344f46dee233245f280d04deba` | yes |
| `E\ledger-after\reconciliation-ledger.json` | `888b25e7727bfc954912b70ca0ec81987ee0c0a5fc07a30a5f7a9ce7e2db2dba` | yes |
| `E\ledger-after\summary.json` | `2e2d06f4176c172ac9f23d6c351303f0a753417cf8426bedaef32290be761d26` | yes |
| `E\canonical-identities.json` | `a4698691ebc458166380aeb655f01d928c901cabfb165214c8e3e0acaa3da775` | yes |
| `P\study-in-usa-wordpress-inventory.json` | `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847` | yes (matches coordinator-recorded hash) |

All ledger files self-identify as output of `scripts/wordpress-audit/audit-migration.py` version 1 with the same three input digests. Evidence tree: `P\garage-deployment\claude-usa-verification\C\` (scripts, raw-extracts, transcripts, fixtures; `transcripts\commands.txt` has every command, UTC timestamp, exit status).

## Method

1. Hash-verified all seven protected inputs (table above).
2. Read `scripts/wordpress-audit/audit-migration.py` (771 lines), `scripts/wordpress-audit/links.py` and `scripts/wordpress-audit/media.py` in full (read-only) to derive each claimed number's exact production rule instead of assuming it.
3. Recounted every queue from the ledger data with independent Python (`python -I`, scripts in the evidence dir; extracts in `raw-extracts\`).
4. Re-derived the link queues a second way: re-ran a faithful transcription of `links.py::audit()` over the source inventory's record contents with the inventory rebuilt from `reconciliation-ledger.json` `path_ledger` paths + `"/"` (scripts\deep_verify.py).
5. Cross-referenced unresolved paths against `editorial-after-recovery.json` (965 documents' `original_path`) and `canonical-identities.json` (`wp_url` paths).
6. Optional bounded availability probe: 30 distinct public URLs, HTTP HEAD only, concurrency 2, 12 s timeout, no body read, no redirect follow (Location recorded), no executable content rendered. An earlier curl/xargs probe produced interleaved output and was **discarded**; results below come only from the clean Python run (`raw-extracts\availability-probe-results.json`, run start 2026-10-10T21:30Z window, transcript `transcripts\availability-probe-run.txt`).
7. PHP-serialized-looking values were treated as opaque scalar strings only; nothing was unserialized into objects, no recovered PHP executed, no WordPress/WP-CLI booted, no plugins touched, no users/submissions/secrets queried, no writes outside the two owned locations.

## Claim-by-claim verification (step 1 of task)

### 1. "13 ELS SVG logos" — CONFIRMED at institution scope, with a scope correction

- Rule (reproduced): `canonical-identities.json → institutions[]` rows whose `logo` ends `.svg` on host `els.edu`; equivalently `media-ledger.json` `references[]` with `side=="canonical"`, `role=="logo"`, URL containing `els-logo`, grouped by distinct owner row. Evidence: `raw-extracts\deep-verify-extract.json` (`canonical_els`, `media_deep`), 2026-10-10T21:29Z, inputs hashed above.
- Result: **exactly 13 institution rows** (ids 852, 878, 879, 880, 881, 882, 883, 884, 885, 886, 887, 888, 889 — all "…- ELS Center" / ELS Language Centers naming) reference the **single** URL `https://www.els.edu/hubfs/Landing%20Pages/ELS-ILSC-Vancouver-Integration/els-logo.svg`. Of 243 canonical institutions, 14 have any SVG logo (13 ELS + 1 other-host).
- Scope correction (new finding): `wp_program_ids` contributes **35 more rows** referencing the same els-logo.svg (media ledger shows 48 canonical logo refs = 13 institution + 35 program rows), and **98 program rows overall carry SVG logos**. The queue as titled ("13 logos") is institution-scoped; the program-scoped SVG logos surface only in catalog expansion. Confidence: high.
- Availability probe (1 URL, HEAD, 2026-10-10T21:33Z): `els-logo.svg` returns **HTTP 200, `image/svg+xml`** — live, so the gate is the **raster-only publication contract**, not availability. Consistent with `wordpress-pilot-execution-plan.md` (2026-10-10 checkpoint: preparation "correctly refused" on these; 13 institutions explicitly deferred). Per assignment, no bypass proposed and no extension-renaming proposed. Confidence: high.

### 2. "61 unresolved internal paths / 103 occurrences" — CONFIRMED exactly; 95-vs-103 explained

- Rules: distinct = `len(unresolved_paths)` in links-ledger.json; occurrences = per-anchor count from `links.py::audit()` (each `<a href>` occurrence). My independent re-run over the source inventory reproduced **61 distinct paths and 103 occurrences exactly** (also resolved 1025, external 1255, non-http 91 — all six summary numbers match). Evidence: `transcripts\deep-verify-run.txt`, `raw-extracts\deep-verify-extract.json` (`links_recheck.compare`), 2026-10-10T21:29Z. Confidence: high.
- Reconciliation of an apparent discrepancy: `unresolved_paths[].referencing_source_ids` dedupes per record (`sorted(set(...))` in audit-migration.py), summing to **95 distinct (path, record) pairs**; the 103 total counts 8 same-record repeats. Both numbers are correct under their stated rules; any consumer of the ledger should not sum `referencing_source_ids` and call it "occurrences". Confidence: high.

### 3. "Unsafe or relative-link occurrences" — CONFIRMED: 50 occurrences, only 4 distinct href values

- Rule: `links.py` classes `unsafe` (control chars, `javascript:`/`data:`/`vbscript:`/`blob:`/`file:`, `..` segments) + `relative_unresolved`; counted per occurrence. Recomputed 50 = ledger claim 50. Confidence: high.
- Deduplicated (per assignment, repeats of one value are one item, not 50): exactly **4 distinct values** —
  1. `` ${stringifiedtrackedURL} `` — builder template variable leaked into hrefs (bulk of the 50; records incl. 4384, 5286, 5327, 5483, 5969, 6055, 6058, 6105, 6107);
  2. `_wp_link_placeholder` — editor placeholder (record 4088);
  3. `javascript:void(0);` (record 5966);
  4. `https://www.simmons.edu/ alumni` — URL containing a raw space (record 6916).
- Media-side unsafe taxonomy (separate from links): of 22,086 media references, 20,913 carry ≥1 issue, but the hard-unsafe classes are small: `unsafe_scheme` 4 refs (1 distinct `data:image/png;base64,…` logo value), `unsupported_scheme` 130 refs (all 130 are source `_job_cover` values whose text begins `a:` — PHP-serialized payloads, not URLs; treated as opaque data, never unserialized), `relative_reference` 337 refs (all inline `<img src>`), `control_or_whitespace_characters` 203 refs. Benign normalization flags: `surrounding_whitespace_trimmed` 9,625, `query_string_not_permanent` 7,912, `empty_reference` 10,274, `svg_rights_and_safety_review` 2,140. Evidence: `raw-extracts\probe-urls.json` (`scheme_histogram`, `unsafe_scheme_urls`), 2026-10-10T21:31Z. Confidence: high.

### 4. "163 attachment review items" — CONFIRMED

- Rule: `reconciliation-ledger.json` `record_ledger` where `source_type=="attachment"` and `disposition=="awaiting_review"`. Result: **163** (reason `connected_storage_destination_requires_review`, `publication_support=="storage_only"`). Evidence: `raw-extracts\count-verify-extract.json` (`reconciliation`), 2026-10-10T21:24Z. Confidence: high.
- Composition: all 163 are `study-in-usa.com/wp-content/uploads/...` URLs (host_class `source_origin`); extensions jpg 111, png 43, webp 8, jpeg 1 — **no documents/PDFs, no SVGs among attachments**. `post_mime_type` is absent in the source export for all 163, so the ledger records `content_type: none` — MIME evidence does not exist in these inputs (see follow-ups). Confidence: high.

## Classification (step 2 of task) — duplicates grouped by distinct URL / distinct row

Universe: 22,086 media references over **1,250 distinct non-empty URLs** (+1 distinct empty value): source_origin 176 distinct (453 refs), external 821 distinct (10,888 refs; contains all 23 distinct SVG URLs), unparsable 253 distinct raw values (471 refs), absent 1 distinct (empty; 10,274 refs). Links ledger is a separate universe (anchor occurrences).

### (a) Missing optional covers — owner-deferred enrichment, NOT launch blockers

- **10,274** absent-reference occurrences are blank canonical fields, not broken files: 1 distinct (empty) URL. Breakdown: `wp_program_ids.program_image` blank 10,044 rows; `institutions.institution_image` blank 229 rows (14 of 243 institutions have images); `institutions.logo` blank 1 row. (media-ledger `host_class=="absent_reference"`; `raw-extracts\deep-verify-extract.json` `absent_owner_breakdown`.) Confidence: high.
- **297** of those blanks have matched source evidence and already exist as dry-run `media_reference_update` proposals (institutions 6, `wp_program_ids` 291; `executable: false` on all 299 proposals; policy `execution_permitted: false`). The remaining 9,976 blanks have no proposal. Confidence: high.
- Additional source-side cover damage in the same category: **130** source `_job_cover` values are `a:`-prefixed PHP-serialized payloads (not URLs) — a conversion must treat these as "no cover", never decode them as objects. **181** source cover refs point at legacy-origin uploads (subset of the 453 legacy refs, exposed to the (b) availability risk). Also noted beyond the ledgers: `cities.city_image` is blank for **190 of 190** cities (canonical-identities.json) — same owner-deferred category. Confidence: high on counts, medium on treatment sequencing.
- Text-only layout is accepted per assignment: none of (a) is a launch blocker.

### (b) Broken inline images / downloads

- Inline `<img>` refs: **952** occurrences, source-side only. Split: external **593** occurrences / **583** distinct URLs; legacy-origin (`study-in-usa.com`) **22** occurrences / **18** distinct URLs; relative `src` **337** occurrences (253 distinct raw values shared with the unparsable bucket; baseless until conversion). Confidence: high on counts.
- Probe (sample only, HEAD, 2026-10-10T21:33Z): external inline sampled 8 of 583 → **8/8 HTTP 200 image/**`jpeg|png` (hosts b2857029.smushcdn.com, b2857029.assetcdn.net, cdn.wou.edu). Legacy uploads sampled 6 of 176, lexicographically clustered in `uploads/2023/06/` → **4/6 HTTP 404** (American-Flag.png, Business-Management-Program.png, Case-Western-Reserve-University-Logo.png, Dominican-University-of-California-Logo.png), 2/6 HTTP 200. So at least four 2023-06 legacy upload URLs are already dead, while same-directory neighbors live: legacy-origin availability is **unreliable and unproven either way at scale** (170 of 176 unchecked). Never generalize the sample. Confidence: high on the 10 checked URLs; low beyond them.
- Downloads: the 163 attachments are all images (see above); no document/PDF download links exist in the attachment inventory. The 163 are also exposed to the same legacy-404 risk (one of them, Case-Western-Reserve-University-Logo.png, is among the checked 404s). Confidence: high.

### (c) Unsafe URL / MIME

- 1 distinct `data:` PNG logo value across 4 program-row refs (unsafe scheme; also blocks the raster contract trivially — it is a raster already, just unhosted). Treatment: host it. Confidence: high.
- All 2,140 SVG-flagged refs (23 distinct SVG URLs; hosts: kc-usercontent 4 distinct, intostudy 5, wikimedia 3, navitas 7, oxfordinternational 1, oncampus 2, els.edu 1) fail the raster-only contract by format; probe of 10 of the 23 distinct SVG URLs (incl. the ELS logo): **10/10 HTTP 200 `image/svg+xml`** — available but contract-rejected. Confidence: high on checked URLs.
- MIME: no MIME evidence exists for the 163 attachments (source export lacks `post_mime_type`); observed content types across the 30 probed URLs were only `image/svg+xml`, `image/jpeg`, `image/png` (the 19 URLs returning 200) and `text/html` (the ten 404s and one 301). No executable content type was observed in any checked header. This is **not** a "MIME-clean" claim — 1,233 of 1,250 distinct media URLs were never probed. Confidence: high on checked, explicitly unknown elsewhere.
- `query_string_not_permanent` 7,912 refs (e.g. smushcdn/applyboard/presspage image CDs) — availability depends on third-party query params surviving; category (c) follow-up, not a demonstrated breakage.

### (d) Internal links without a reviewed destination

- All **61 distinct paths / 103 occurrences** have **no reviewed destination**: 0 of 61 match any of the 965 editorial documents' `original_path` and 0 match any of the 314 distinct canonical `wp_url` paths (`raw-extracts\probe-urls.json` `unresolved_vs_editorial`, `unresolved_vs_canonical_wp_url`, 2026-10-10T21:31Z). Confidence: high.
- Top paths (occurrences): `/news` 9, `/contact` 8, `/admission-and-aid/apply` 6, `/apply` 6, `/admissions/apply-now` 4, `/about/contact-us` 3, `/academics/programs` 3, then 54 paths with ≤2 — these are predominantly site-chrome navigation/CTA links embedded in recovered article bodies, not per-article editorial links.
- Probe (6 of 61, HEAD on legacy origin, 2026-10-10T21:33Z): **5/6 HTTP 404**; `/academics/engineering` 301 → `https://study-in-usa.com/washington-state-university/engineering/`. So most sampled unresolved paths are already broken upstream in WordPress — pre-existing legacy breakage, not something the migration broke. Sample is lexicographically clustered (about/academics); 55 of 61 unchecked. Confidence: high on the 6; indicative only beyond.

## Optional availability probe — checked vs unchecked (step 3 of task)

Method: HEAD, no body, no redirect follow, concurrency 2, timeout 12 s, `User-Agent: frontbase-verification-probe/1.0`, TLS verification disabled for the probe only (availability check, no credentials exchanged). Selection: deterministic lexicographic "first K" per bucket over well-formed `https` URLs (scheme https, host present, no control/whitespace chars). Full per-URL results: `raw-extracts\availability-probe-results.json`.

| Bucket | Checked | Unchecked in bucket | Result |
| --- | --- | --- | --- |
| A: ELS logo URLs (2 distinct) | 2 | 0 | els-logo.svg **200 image/svg+xml**; legacy ELS-Logo.png **404** |
| B: other SVG logos (23 distinct total) | 8 | 15 | **8/8 200 image/svg+xml** |
| C: legacy-origin uploads (176 distinct) | 6 | 170 | **2/6 200; 4/6 404** (2023/06 cluster) |
| D: external inline images (583 distinct) | 8 | 575 | **8/8 200 image/jpeg|png** |
| E: unresolved internal paths on legacy origin (61) | 6 | 55 | **5/6 404; 1/6 301→** `/washington-state-university/engineering/` |
| **Total** | **30** | — | 30 checked of 1,250 distinct media URLs (2.4%) + 6 of 61 unresolved paths; **no bucket is fully checked; no bucket-wide claim is made** |

Not accessed: Garage admin UI/secrets, bucket policies, uploads, any authenticated endpoint. No broad scan (30 requests total, ~31 s wall time).

## Prioritized queue (finite)

Priority order: P1 = must resolve before any page that references it is published; P2 = required for the currently planned staging checkpoint; P3 = deferred enrichment/quality.

| # | Item | Category | Count (deduped) | Launch blocker | Treatment — consumer/configuration | Treatment — reusable code |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 13 ELS institution logos = 1 distinct els-logo.svg URL, SVG on live origin (probe 200) | (c)/(a) format + rights | 13 rows / 1 URL / 35 sibling program rows | **Yes for any published page rendering those rows** (contract rejects SVG); already excluded from the 5-institution capture | Owner acquires/rasterizes ELS brand logo with rights, uploads via the guarded six-stage pipeline (acquire→verify/strip→review→upload→public readback→guarded reference update) | Add a preflight lister that emits all SVG-logo rows (institutions AND programs) before preparation, so the "13" cannot silently grow during catalog expansion |
| 2 | 61 unresolved internal paths / 103 occurrences; 0/61 has a reviewed destination; 5/6 sampled already dead upstream | (d) | 61 paths (7 paths cover 39 of 103 occurrences) | Per-page: published drafts containing them produce broken nav/CTA links (P1 for those pages); not a framework blocker | During editorial conversion: strip or map; start with the top 7 paths (`/news`, `/contact`, `/admission-and-aid/apply`, `/apply`, `/admissions/apply-now`, `/about/contact-us`, `/academics/programs`); `/apply` interacts with the acknowledged apply non-goal — owner decision, not auto-mapping | Reusable link-health gate in the guarded import: fail (or flag for review) any draft whose body contains an href not in the route inventory; emit the 61-path list as a redirect-map worksheet |
| 3 | Legacy-origin media dependency: 453 refs / 176 distinct URLs; sample shows dead files (4/6 in one 2023/06 cluster; ELS-Logo.png 404) | (b) | 176 URLs (170 unchecked) | Potentially yes for pages whose inline images or thumbnails point there (18 distinct inline URLs) | Owner decision per asset: migrate to connected Garage storage via the guarded pipeline, or accept breakage; prioritize the 18 inline + 76 thumbnail + 181 cover refs | Storage-manifest run of the audit (`--storage-manifest`) so `availability` becomes manifest hit/miss instead of `unknown_offline`; re-run ledger after uploads |
| 4 | 163 attachment review items (storage_only; no MIME evidence; 1 sampled 404) | (b)/(c) | 163 records | No (attachments are not rendered unless referenced), but referenced ones inherit #3's risk | Owner connects storage destination and re-runs triage; capture MIME at acquisition time | Extend audit to warn when `post_mime_type` is absent for attachment_file refs (evidence gap, currently silent `none`) |
| 5 | Broken/placeholder hrefs in source bodies: `${stringifiedtrackedURL}`, `_wp_link_placeholder`, `javascript:void(0);`, `https://www.simmons.edu/ alumni` | (c) links | 50 occurrences / 4 distinct values | Per-page quality issue, not a gate | Conversion rule: drop placeholder/template hrefs; fix or drop the malformed simmons.edu href | None needed beyond #2's gate which already catches these |
| 6 | 130 source covers are `a:`-serialized non-URLs | (a)/(c) | 130 refs | No | Treat as "no cover" during conversion; never unserialize | Audit could add a distinct issue code (e.g. `serialized_reference`) so these do not masquerade as URLs |
| 7 | 337 relative inline `src` (253 distinct raw values) | (b) | 337 refs | Per-page: images resolve only against legacy origin | Resolve against `https://study-in-usa.com` at conversion, then route through #3's storage decision | Conversion helper: base-URL resolution step for relative media in recovered bodies |
| 8 | External inline images: 593 refs / 583 distinct URLs; 8/8 sampled live; rights unknown | (b)/(c) | 583 URLs | No (live today); long-term dependency + rights exposure | Owner rights review only where images are kept; prefer re-hosting hero/important images | None (audit already flags `external_source_rights_unknown`) |
| 9 | 297 blank-cover proposals with source evidence (6 institutions + 291 programs); 9,976 further blank covers without proposals | (a) owner-deferred | 297 proposals / 10,273 blank cover refs | No (text-only layout accepted) | Owner executes or declines via the guarded six-stage pipeline; nothing manufactured | None (proposals and guards already correct; `executable:false` verified on all 299) |
| 10 | 98 program rows with SVG logos (35 of them the ELS URL) | (c)/(a) | 98 rows | Only at catalog expansion, not current capture | Same raster re-sourcing as #1, sequenced with expansion | Same preflight as #1 (covers programs automatically) |
| 11 | 7,912 refs with query-string URLs (CDN image CDs) | (c) | subset of 583 external + others | No | Prefer canonical (query-free) asset URLs when re-hosting | None |
| 12 | 190/190 blank `cities.city_image` | (a) | 190 rows | No | Owner-deferred enrichment alongside #9 | None |

## Three-way categorization

**(1) Demonstrated launch blockers (with bounded evidence):**
- B1: The 13 ELS institution logo rows cannot pass the raster-only publication contract until a rights-cleared raster logo is supplied and uploaded through the guarded pipeline (blocking any page rendering those rows; the current 5-institution capture already excludes them, so nothing today is blocked — this is a blocker for including them). Evidence: canonical-identities + media ledger + probe 200 image/svg+xml; hash-stable inputs.
- B2: At least four `study-in-usa.com/wp-content/uploads/2023/06/*` image URLs are dead (HTTP 404) while recovered content references them — any published draft whose body/thumbnail points at one of these renders broken. Scope bounded to the 10 legacy URLs probed; full exposure (170 of 176 legacy URLs unchecked) is follow-up F2.

**(2) Unresolved evidence requiring follow-up:**
- F1: Destination decision for all 61 unresolved internal paths (0/61 has an editorial or canonical destination today; top 7 paths = 39 occurrences).
- F2: Legacy-origin availability at scale (170 of 176 URLs unchecked) and connected-storage destination + MIME capture for the 163 attachments.
- F3: Rights review for 583 distinct external inline image URLs (8 probed, all live).
- F4: SVG logo census beyond institutions: 98 program rows (35 ELS) — re-run the publication-schema preflight over any expanded candidate set before preparation.
- F5: Re-run the audit with a storage manifest so availability stops being `unknown_offline` for all 22,086 references (summary currently reports `unknown_offline: 22086`).

**(3) Owner-deferred improvements (never manufactured by tooling):**
- D1: 10,273 blank canonical covers + 1 blank logo (297 with source-evidence proposals); D2: 190 blank city images; D3: alt-text gaps (`alt_text_absent` inside `rights_questions` counts); D4: query-string URL canonicalization; D5: duplicate-URL acquisition dedupe (249 duplicate groups; largest group 669 refs of one applyboard URL) whenever assets are migrated.

## Skips and access limits

- No Garage/S3 admin access, no bucket policy reads or changes, no uploads, no service restarts, no process kills, no broad scan (30 HEAD requests total).
- Storage manifest was not among ledger-after inputs; media availability is `unknown_offline` in the audited data and was not independently established beyond the 30-URL probe.
- No WordPress/WP-CLI boot, no plugin execution, no PHP object unserialization (serialized cover values handled as opaque scalars), no user/submission/secret queries.
- No GET bodies downloaded; MIME/redirect evidence is HEAD-header-only for the 30 probed URLs; TLS verification disabled inside the probe script only.
- Lexicographic sampling clusters (2023/06 uploads; about/academics unresolved paths) — bucket results are not representative beyond stated checked counts.
- Whether any of the 61 unresolved paths is served by an editorial document under a *different* `original_path` mapping was not verifiable from these inputs (only exact `original_path` equality checked).
- One earlier curl/xargs probe run produced interleaved output; it was discarded and redone in Python (documented in commands.txt).

## Exact next actions (finite)

1. Coordinator replay: re-run `scripts/C/check` of one number with an independent method (suggested: recount 163 from `reconciliation-ledger.json` with a one-liner; recount ELS rows from `canonical-identities.json`).
2. Owner: decide destinations for the top-7 unresolved paths (39 of 103 occurrences) — strip vs redirect-map; `/apply` stays inside the acknowledged non-goal.
3. Owner: source rights-cleared raster ELS logo(s); run the guarded six-stage media pipeline for the 13 institution rows before any of those pages is prepared.
4. Owner: connect storage destination for the 163 attachments and re-run the audit with `--storage-manifest` to replace `unknown_offline` evidence (F2/F5).
5. Engineering (reusable): add the SVG-logo preflight lister (institutions + programs) and the draft link-health gate (items #1/#2 reusable column).
6. Engineering (reusable): audit evidence-gap warnings for absent `post_mime_type` and serialized cover values (#4/#6).

## Evidence index (all under `P\garage-deployment\claude-usa-verification\C\`)

- `transcripts\commands.txt` — every command, UTC timestamp, exit status.
- `scripts\schema_probe.py`, `scripts\count_verify.py`, `scripts\deep_verify.py`, `scripts\crossref_and_probe_list.py`, `scripts\availability_probe.py` — all read-only, run with `python -I`.
- `raw-extracts\schema-probe.txt`, `count-verify-extract.json`, `deep-verify-extract.json`, `probe-urls.json`, `availability-probe-results.json`.
- `fixtures\probe-list.txt` — the exact 30 probed URLs with bucket labels.
- `transcripts\count-verify-run.txt`, `deep-verify-run.txt`, `crossref-run.txt`, `availability-probe-run.txt`.

*Report end. Status: verification complete within the stated limits; this is a delivery claim to the coordinator, not acceptance and not a launch clearance.*
