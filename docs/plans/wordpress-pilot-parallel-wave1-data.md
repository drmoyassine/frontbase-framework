# Wave 1 P1-A — fresh coverage and conversion evidence (data packet report)

**Worker:** P1-A (parallel-session swarm). **Date:** 2026-10-10. **Baseline:** `codex/wordpress-pilot`, HEAD `d3cd12277423e78538527400ba24cfe1c26ce237`, shared dirty worktree preserved. **Owned files touched:** `scripts/wordpress-audit/test_audit.py` (post-change SHA-256 `b24601b47e745d7d3148430a8e8245c889ac1e12cf8b921be0b2f9c317da2220`; one added test plus the `hashlib` import) and this report. No other file was created or modified; no Git mutation was performed.

**Correction record (2026-10-10, applied by the packet coordinator per primary's [review](wordpress-pilot-wave1-primary-review.md)):** five required corrections are applied in this revision — located/hash-verified protected inputs replace the earlier not-found claim (§1); ELS 852 owner confirmation restored as a completed fact (§4); path-unresolved records kept disjoint from the 966 `missing` bucket (§4); repeat *generation* distinguished from repeat *import* (§9, §10); access-statement scope aligned with the allocation (§1). A coordinator reproduction against the located inputs is added as §3.1.

**Headline (corrected):** the protected 2026-10-07 audit inputs **are** present on this machine and hash-verified — an earlier revision wrongly reported them absent because the worker's bounded search did not cover `C:/Users/drmoy/.codex/`; primary located them and this packet's coordinator independently re-verified all three digests and reproduced the run (§3.1, byte-identical to history and to primary's replay). The packet delivers (1) verified tool evidence on the committed synthetic fixtures, including a fresh deterministic CLI run with digests, (2) the reproduced 2026-10-07 pilot counts as historical snapshot evidence, never as fresh data, and (3) verified test coverage of all four required properties, with one genuinely new repeat-**generation** test (repeat *import* idempotency is neither claimed nor implemented). Suite is now **39/39 passing**.

## 1. Access and snapshot-age statement (read this before quoting any count)

- **Protected inputs located and hash-verified (corrects the earlier "not found" claim).** The 2026-10-07 run consumed protected inputs with recorded SHA-256 digests — WordPress source `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847`, canonical identities `f5ef65b31d32d4d2aa5f5bd605dcf5e7c58c6700030c2a61962a33f2c5c3e89a`, editorial identities `113fc51792506e35c850dfa3579ff36a691d99dddbe358a1fa346a88e410a6fe` ([A/C reconciliation](wordpress-pilot-ac-primary-reconciliation.md)). Primary located all three on this machine on 2026-10-10: the source at `C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6/study-in-usa-wordpress-inventory.json` and both identity exports under that directory's `garage-deployment/ac-reconciliation-2026-10-07/` (`canonical-identities-current.json`, `editorial-identities-current.json`). All three digests match the historical reconciliation receipt — verified by primary and independently re-verified by this packet's coordinator on 2026-10-10. The worker's bounded search (repo tree, OneDrive/VsCode siblings, `Claude`/`Documents`/`Desktop`/`Downloads`/`.claude`) did not include the `.codex` tree; that search gap, not absence, produced the earlier claim. The private inputs stay outside Git; nothing was moved or copied into the repository.
- **Access statement (scope corrected).** The input-tree gap from the earlier revision is closed (see above). This packet used **no** network, database, storage or live access of any kind, and held no Supabase/storage connector or credential. That is a fact about this packet, not a prohibition: the owner-authorized allocation permits bounded read-only evidence refresh when access is available, and primary's existing authorized read-only scope is unaffected by this packet's disclosure. Fresh live pulls remain open work for whoever holds access (primary/owner).
- **Snapshot age.** The recorded pilot numbers below are incident-time evidence: the source is the protected incident-time WordPress inventory (run date 2026-10-07; canonical identity export observed 17:57:59 UTC, program batches 17:58:41–17:59:28 UTC, nontransactional reads). Re-running the CLI against these hash-verified 2026-10-07 inputs on 2026-10-10 reproduces the same counts byte-identically (§3.1) — a reproduction of the snapshot, not a freshness claim. Supabase current content takes precedence wherever the two differ; these counts must not be quoted as current.

## 2. Fresh tool-level evidence on committed synthetic fixtures (this packet's run)

All-fixture CLI run, private output outside Git. Inputs are synthetic (`usa.example`); **no real or private pilot data was used or produced.**

```
cd scripts/wordpress-audit
python audit-migration.py \
  --source fixtures/source-snapshot.json --canonical fixtures/canonical-export.json \
  --editorial fixtures/editorial-export.json --storage-manifest fixtures/storage-manifest.json \
  --exclusions fixtures/exclusions.json --field-map fixtures/field-map.json \
  --country-id 5 --output "$TMP/wp-audit-p1a-2026-10-10" --self-check
# stdout: self-check: identical  (run 2026-10-10)
```

Output directory (private, outside Git, retained for review): `C:\Users\drmoy\AppData\Local\Temp\wp-audit-p1a-2026-10-10\`. The tool itself also refuses any output path inside the repository (`test_outputs_refused_inside_repository`).

| Artifact | SHA-256 |
|---|---|
| Input `fixtures/source-snapshot.json` (captured_at `2026-10-01T09:00:00Z`) | `7ed7af84a298c1d8b34c04c1b1cf43479e9767dedb85b225ae72361a3d6837a6` |
| Input `fixtures/canonical-export.json` (captured_at `2026-10-02T09:00:00Z`) | `67bd007dbfc3156b4cdd422825b515178c815fe4e4b0bf57b9b2b05d942a970b` |
| Input `fixtures/editorial-export.json` (captured_at `2026-10-02T09:30:00Z`) | `66572594b1bb2ab9cc2b6a1bf17eb4963bf0a367e154ed3857d497d25630ddd2` |
| Input `fixtures/storage-manifest.json` (captured_at `2026-10-02T10:00:00Z`) | `499895c68b816648c432822befb470077b817c9e797de321d67cc468bd1a23da` |
| Input `fixtures/exclusions.json` | `52fe8e4f8cfa6a286bba4673b55b889facc5dc6f766a541b4c32cf1fb78ead2e` |
| Input `fixtures/field-map.json` | `149659264e95a7f4af041815bf423bb2130a84da7f387c24e9403c18cb4f4383` |
| Output `reconciliation-ledger.json` | `7878b0e576640f16e4eea2c02d5fa972b93ed98778402e99f6a4f79d6c7a4b24` |
| Output `media-ledger.json` | `ad4f131bf6b8048d4ccf3ef9faef174b6a7f72e2c4723d7c220caf6111ff2f28` |
| Output `links-ledger.json` | `53ae3b90ebe6348dcd34ccd929573ea13d5b8379a77c47417a988c693f2db1d2` |
| Output `import-proposals.json` | `dcf65b9977de0976b7a2cdc53e49b9d0bcd0f456a8db8eabadbe6ffc43936bc9` |
| Output `summary.json` (sanitized) | `09ca27624ff3923cb53ec3d1ae3d5e2a652ac2e08ab03e89b92e273c74366050` |

Sanitized fixture counts (`summary.json`, safe to paste): 14 records — 4 `exactly_matched`, 3 `missing`, 1 `ambiguous`, 5 `awaiting_review`, 1 `intentionally_excluded`; by type: 3 institution (1 matched / 1 ambiguous / 1 missing), 1 program (matched), 2 pathway (1 matched / 1 awaiting review — the synthetic anomalous-status record), 3 article (1 matched / 1 missing / 1 path-unresolved), 2 page (1 owner-excluded / 1 missing), 2 attachment (both awaiting connected-storage review), 1 unsupported. Relationships clean (`findings_by_code: {}`); expansion 2 rows + 2 other-origin references; media 17 references (2 manifest hits, 1 manifest miss, 14 unknown-offline; 4 legacy-domain, 2 external; 2 duplicate URL groups, 1 checksum duplicate group, 7 rights questions); links 3 resolved / 1 unresolved occurrence (1 distinct path); field gaps 1; proposals 5 (1 editorial import, 1 field fill, 1 directory insert, 1 media reference), **`executable: 0` everywhere**.

The real-run invocation is no longer pending: it was executed on 2026-10-10 against the located, hash-verified protected exports — see §3.1.

## 3. Recorded pilot evidence, 2026-10-07 (historical snapshot; reproduced byte-identically 2026-10-10 — not live data)

From [A/C reconciliation](wordpress-pilot-ac-primary-reconciliation.md) (CLI `--country-id 22 --self-check`, byte-identical rerun, five private ledgers):

| Original source type | Matched | Missing canonical | Awaiting review |
|---|---:|---:|---:|
| Institutions | 18 | 0 | 0 |
| Programs | 258 | 0 | 0 |
| Pathways | 34 | 0 | 1 |
| Articles | 1 | 954 | 2 |
| Pages | 0 | 12 | 2 |
| Attachments | 0 | 0 | 163 |
| **Total** | **311** | **966** | **168** |

All 310 standard published listings matched an exact canonical source URL (identity coverage only — not field completeness, editorial accuracy, approval, SEO equivalence or deployment). The extra canonical catalog is designed expansion: 9,978 additional institution/program rows reported separately, plus 4 other-origin references. The tool emitted 1,263 nonexecutable proposals: 966 editorial imports and 297 media-reference candidates. Relationship diagnostics: 2 nonunique campus-parent mappings, 1 city-term evidence mismatch, 33 records with multiple source institution terms (source campus/umbrella taxonomy ambiguity — not proof of invalid canonical `institution_id`s; investigate per record before any relationship write). Link scan: 61 distinct unresolved internal paths across 103 occurrences plus 50 unsafe/relative occurrences (route-normalized; not comparable with older editorial-only link reports). Media scan: 22,086 references including 10,274 absent values, 10,888 external, 453 source-domain, 471 unparsable, 249 duplicate URL groups; without a manifest every availability was `unknown_offline` — that does not mean 22,086 original assets are missing.

### 3.1 Coordinator reproduction against the protected inputs (2026-10-10)

Executed by this packet's coordinator after primary's review located the inputs, with all three input digests verified before the run and no input overwritten:

```
cd scripts/wordpress-audit
python audit-migration.py \
  --source "C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6/study-in-usa-wordpress-inventory.json" \
  --canonical "…/garage-deployment/ac-reconciliation-2026-10-07/canonical-identities-current.json" \
  --editorial "…/garage-deployment/ac-reconciliation-2026-10-07/editorial-identities-current.json" \
  --country-id 22 --output "…/garage-deployment/parallel-wave1-data-2026-10-10" --self-check
# stdout: self-check: identical; exit 0  (run 2026-10-10; output directory private, outside Git)
```

Results: `self-check: identical`; 1,445 source records; 311 exactly matched / 966 missing / 168 awaiting review; `paths.without_source_path: 4` reported separately from the missing bucket; 1,263 proposals (966 editorial import + 297 media reference), `executable: 0`; relationship, media and link findings match §3's narrative. All five output artifacts are **byte-identical (SHA-256) to both** the historical `ac-reconciliation-2026-10-07/ledger-reviewed/` outputs and primary's same-day replay `garage-deployment/primary-wave1-review-2026-10-10/`:

| Artifact | Common SHA-256 (identical across all three runs) |
|---|---|
| `summary.json` | `f0c1daba85e911487f0636fe81bed2991b346767baa02b3d8fc9404d48faaad1` |
| `reconciliation-ledger.json` | `c0abad2929b4704e4d1e4314d4c1d0822c7b244c97bf019f2be49d8f1c14dc21` |
| `media-ledger.json` | `6b428d4fb0e095c0b9dd8e2dd642e8afc8c9893afb45f625814025804fd48423` |
| `links-ledger.json` | `d42da04737b597ccfbe4e0e62abce3f1929cdb60612b4fd1de72af74455129b9` |
| `import-proposals.json` | `d3ed681de30e187459051168ebd84082eab727399568849c8db415f71cb9e158` |

This is three-way agreement on the same 2026-10-07 snapshot: deterministic repeat **generation**, verified. It does not convert the counts into current data.

## 4. Unresolved identities (dated record + tool disposition mechanics)

| Identity | Recorded state (2026-10-07 / earlier increments) | Tool disposition and required decision |
|---|---|---|
| Anomalous pathway source 2606 | Source status `published` (nonstandard); never imported; review-only ([harmonization](wordpress-pilot-harmonization.md)) | `awaiting_review` / `nonstandard_source_status` (fixture analog: record 11 with status `published`). Disposition requires an explicit owner decision: either confirm intended publication and import through the reviewed pathway-as-program path, or exclude with recorded reason + authority. It stays out of every batch until decided. |
| 4 editorial records without permalink evidence | 2 articles + 2 pages held in `awaiting_review` — **disjoint from the 966 `missing`** (which are 954 articles + 12 pages with resolved paths); the summary reports them separately (`paths.without_source_path: 4`) | `source_path_unresolved` / `awaiting_review`; GUIDs and slugs are never permalink evidence (fixture: record 21 + a planted GUID stays unresolved). Import proposals require `resolved_original_path` first. |
| 163 attachments | Awaiting connected-storage review; a primary-fixed defect had auto-marked them excluded | `awaiting_review` / `connected_storage_destination_requires_review`. Only an explicit reason + authority can exclude; excluded attachment references remain in the media ledger (fixture-proven). |
| ELS umbrella source 3458 (`/els-english-language-services/`) | **Owner-confirmed (2026-10-05):** the [harmonization header](wordpress-pilot-harmonization.md) records owner confirmation of ELS umbrella institution 852 and that its original URL was filled — this confirmation is complete and is **not** an open owner decision | The historical caution stands as executed process: no arbitrary first-city assignment, no duplicate creation; URL persistence was performed under the confirmed decision. Remaining work, if any, is fresh read-only canonical verification — a different item from the (resolved) owner confirmation. |
| Editorial paths (4) + route conflicts | Recorded as unresolved | Any editorial document claiming a different `original_path`, or duplicate identities, becomes `ambiguous` (`editorial_path_divergence` / `duplicate_editorial_identity` / `editorial_route_conflict`), never silently resolved. |

## 5. Field conflicts and cautions (dated record; the tool never overwrites)

- **Preserved fresh values:** the tool proposes a `field_fill` only when the canonical field is blank; a populated canonical value is always preserved over older source data (fixture-proven: populating the target yields zero fill proposals). Filling an empty field does not certify recovered source facts as current.
- **Required institution fields:** the 12 new ELS campus records (878–889) received owner-corrected type/super_type/status/domain/logo and nine street addresses (2026-10-05); remaining: six matched institution covers, 17 coordinate pairs — **all 17 matched source institutions still hold default `0,0` coordinates, which must never display as valid map pins**; Cincinnati's geocode ZIP mismatch (45219 vs 45221) is held for review; ELS Houston off-campus and ELS Minnesota's Minneapolis-address/St.-Paul-city conflict each need one coherent correction.
- **Program fields:** remaining matched-course gaps recorded 2026-10-05: 291 covers, 283 admissions requirements, 34 degree labels/currencies/duration units/modes/intakes, 35 categories, 289 external program URLs, 292 entry points. All 34 ELS courses carry zero duration/tuition defaults — **zero is an unknown value, not verified free pricing or zero duration**; the schema lacks a fee billing-period field, so recovered prices must not display without currency, period and verification date.
- **City/country relations:** canonical tables `public.institutions`, `public.programs` (via `wp_program_ids` projection), `public.cities`, `public.countries`; USA country id 22. Nine missing cities inserted with source term IDs (2026-10-05) plus Minneapolis 443; Cleveland 208 / New York 112 / St. Paul 225 retained; Saint Paul→St. Paul required both term ID 205 and bounded name equivalence — no fuzzy merges. One city-term evidence mismatch recorded in the 2026-10-07 run; provider/city/status assignments are never inferred by the tool.
- **ELS scope cautions:** eleven former ELS profiles carry whole-university text and are annotated `profile_scope: historical` in the private preview (not a schema column); university mottos suppressed on ELS cards, founding years labeled host-institution facts; center-specific descriptions and current availability remain content-acceptance work. ELS New York's image is a logo, not a photograph; Tampa 889's cover remains blank with its earlier access-blocked source unresolved.

## 6. Editorial status (dated record)

The editorial collection proposal records 957 articles / 14 pages with complete recovered dates and bylines, 58 thumbnail references and 151 unresolved internal-link occurrences ([editorial model](wordpress-pilot-editorial-model.md)); the 2026-10-07 route-normalized scan separately found 61 distinct unresolved paths / 103 occurrences — the two are not comparable. No canonical article table or public content grant exists; bodies are preserved only in protected snapshots; configuration/publication architecture remains a proposal. Internal-link status is scan output only: resolved/unresolved per record with referencing IDs; builder-embedded dynamic/JSON links are outside the scan.

## 7. Covers and assets: broken vs empty, inline vs download

- **Empty cover** = the reference value itself is blank: `host_class: absent_reference`, issue `empty_reference` (fixture: institution 701 cover). Nothing to acquire from the source value.
- **Broken/unavailable cover** = a populated reference whose target cannot be shown to exist: `manifest_miss` when it resolves into a configured storage base but the key is absent (fixture: program 801; raises `missing_asset_review`), or `unknown_offline` when no manifest covers it — availability is never implied offline. A 403/429 source response likewise does not prove absence (recorded 2026-10-05 checks: 1×200/image, 7×403, 12×Imgur 429).
- **Inline assets:** extracted as data with alt text from recovered bodies; missing alt raises `alt_text_absent`; external hosts raise `external_source_rights_unknown`; unsafe schemes/relative references are inventoried with issues, never dropped; `.svg` requires a rights/safety review.
- **Download/attachment assets:** `_wp_attached_file` keys become uploads-path references with content type (GUID never used); duplicates group by URL and by manifest checksum; source-origin (legacy-domain) references raise `legacy_domain_dependency` and still need cutover disposition.

## 8. Anomalous original listing disposition

Source pathway 2606 is the only anomalous original listing in the recorded run (`published` vs authorized `publish`). Disposition stays `awaiting_review` with reason `nonstandard_source_status`; it is excluded from all proposed batches; the owner decision (normalize-and-import as a reviewed pathway-as-program, or explicit exclusion with reason + authority) is a precondition for claiming zero source residue. Fixture record 11 keeps this behavior under regression test.

## 9. Proposed batch design (all `executable: false`; dry-run evidence only)

Batching derives mechanically from the audit proposals; the recorded 2026-10-07 quantities size the queues. Nothing here authorizes a write.

| Batch | Recorded size (2026-10-07) | Required guards (from proposals) | Before/after invariants |
|---|---|---|---|
| Editorial import | 966 proposals | `resolved_original_path`, `conversion_draft_from_protected_capture`, `route_conflict_free`, `owner_review_before_any_import`; via the existing guarded consumer import | Before: each source record `missing`/path-resolved, no editorial doc at its identity+path. After: exactly one editorial doc per imported record with preserved original path/URL/date; no existing doc mutated. Rerun of the unchanged audit reproduces identical proposals; re-audit of the refreshed export shows those records `exactly_matched`, never duplicated. |
| Media reference update | 297 proposals | `acquire_source_asset`, `decode_verify_and_strip_metadata`, `visual_owner_review`, `authenticated_upload_to_connected_storage`, `anonymous_public_readback_check`, `guarded_canonical_reference_update_with_rollback_manifest` | Before: canonical media field blank with matched source evidence (blank-only; populated values never overwritten). After: content-addressed connected-storage reference, unchanged original WP URL/ID, unchanged `updated_at` except the guarded write, rollback manifest retained. |
| Field fill (field-map gated) | none outstanding from the audit run; 8 admissions fills executed separately under guards 2026-10-05 | `exact_target_identity`, `prior_value_blank`, `owner_review_required`, `unchanged_updated_at` when present; identity/naming/status/relationship fields refused by construction | Before: canonical field blank, source metadata nonempty; After: plain-text recovered value with provenance retained; every populated canonical value byte-identical before and after. |
| Identity dispositions (not a batch) | 2606; 4 unresolved paths; 163 attachments (ELS 3458 is **resolved** — owner-confirmed 2026-10-05, see §4) | Explicit owner decision each; reason + authority for any exclusion | No mass action; each resolution is recorded individually before any later batch may include the affected records. |

Repeat **generation** of identical proposals is proven (§10, property d). Repeat **application** — idempotent guarded import with read-back — is not implemented or proven by this packet; no importer was delivered.

## 10. Test evidence (all four required properties)

Suite: `cd scripts/wordpress-audit && python -m unittest test_audit`. Baseline **38/38 OK** (0.355s, Python 3.11.3). After this packet's one added test: **39/39 OK** (0.572s).

| Required property | Demonstrating tests (all pass) | Fixture evidence |
|---|---|---|
| (a) A missing original route is detected | `CoreAuditTests.test_status_unsupported_path_and_attachment_distinctions`, `test_exact_ambiguous_and_missing_listing_identities`, `test_guid_is_never_permalink_evidence`, `LinkAuditTests.test_unresolved_internal_paths_listed_with_referencing_records` | Record 21 (no permalink evidence) → `awaiting_review`/`source_path_unresolved`, planted GUID never used; record 61 → `missing`/`no_canonical_destination`; attachment 31 with empty key flagged; link to `/gone-page/` reported unresolved with referencing record [20] |
| (b) Extra canonical rows are allowed (expansion, not failure) | `CoreAuditTests.test_expansion_and_cross_origin_are_not_source_gaps` | Canonical 701/802 (no `wp_url`) → `expansion_rows`; 704/803 (other-origin URLs) → `other_origin_references`; summary `missing` counts provably exclude expansion rows |
| (c) A populated fresh canonical field is preserved over older source data | `ProposalTests.test_field_fill_only_for_blank_canonical_values` | Blank canonical target → exactly one guarded fill from source metadata (script content stripped); populated canonical target → zero fills, value retained |
| (d) Repeat **generation** does not duplicate records — byte-identical CLI output; repeat *import* idempotency is not claimed or implemented | `CoreAuditTests.test_deterministic_and_source_unmodified`, `CliAndSafetyTests.test_cli_deterministic_and_self_check`, **new** `CliAndSafetyTests.test_repeat_run_into_same_output_directory_does_not_duplicate` | Two in-memory runs byte-identical with the input object unmodified; two CLI runs into separate dirs byte-identical across all five artifacts; new test runs the CLI twice into the *same* output directory and requires the exact five-file set (no appended duplicates) plus identical per-file SHA-256 and unchanged record/proposal totals |

The new test covers the previously untested refresh workflow (repeat *generation* into a live output directory). It proves only that regeneration is deterministic and non-duplicating; it proves nothing about database insert/update idempotency — no importer exists yet (§9). It initially failed on its own bug — an unsorted expected-file list compared against a sorted listing — and was fixed in the same session; the failure was in the test's assertion, not the tool. Suite count moves 38 → 39; the 38/38 figure recorded elsewhere describes the 2026-10-07 suite.

## 11. Boundaries, residue, next executable task

- **No live writes, uploads, approvals, or publication occurred.** No canonical mutation, no storage transfer, no Supabase/storage/network access, no Git mutation (no add/commit/stash/checkout/reset), no pnpm build/check (primary owns builds).
- **`__pycache__/` note:** no manual action on the bytecode directory. Running the mandated suite after editing `test_audit.py` caused the interpreter to regenerate only `test_audit.cpython-311.pyc` (automatic cache refresh for the edited source); `audit-migration`, `media` and `links` cache entries retain their 2026-10-07 timestamps.
- **Pre-existing dirty paths** (docs/plans execution plan, handoff, roadmap, packages/, examples/, etc.) were never touched.
- **Residual gaps:** the snapshot-reproduction gap from the earlier revision is closed (§3.1: inputs located, hash-verified, three-way byte-identical reproduction). What remains open is **fresh current state** — a new WordPress delta export, current Supabase canonical/storage reads, a storage manifest, full field/body fidelity, and editorial/publication acceptance (wave-plan M3 work). Reproduced 2026-10-07 counts stay historical; no milestone is closed from fixtures or reproductions alone.
- **Next executable task (updated):** the digest-verify-and-rerun task is complete — primary's replay and this packet's §3.1 reproduction are byte-identical to the historical outputs, with zero drift. Next: primary's acceptance review of this corrected report, then fresh-state work — obtain or authorize a read-only pull of current WordPress/Supabase/storage state (new exports or live reads by the access holder) so a genuinely fresh gap ledger can replace the 2026-10-07 snapshot counts. The remaining identity dispositions (2606; 4 unresolved paths; 163 attachments) are the owner decisions that unblock later batches.
