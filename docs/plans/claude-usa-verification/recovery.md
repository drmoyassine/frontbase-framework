# Workstream B — Canonical coverage and editorial recovery (verification report)

- Workstream key: B (owns `recovery.md` and private evidence directory `...\claude-usa-verification\B\` only)
- Report UTC date: 2026-10-10 (all timestamps UTC; local Asia/Kuwait date 2026-10-11)
- Baseline: branch `codex/wordpress-pilot`, HEAD `d3cd12277423e78538527400ba24cfe1c26ce237`, shared dirty tree (~137 pre-existing modifications) preserved untouched; no repo-tracked file modified by this workstream.
- Scope: read-only verification. No approval, no import replay, no repair, no policy change, no live database access.
- Claim status: this is a delivery claim for coordinator review, not acceptance.

## 1. Input hashes (SHA-256)

Hashed before use (2026-10-10T21:15Z) and re-hashed after work (2026-10-10T21:39:47Z). All unchanged; no snapshot split needed. `P` = `C:\Users\drmoy\.codex\visualizations\2026\10\04\01a105ea-d8e3-7251-9d16-58014053c4d6`; `E` = `P\garage-deployment\usa-fresh-reconciliation-20261010`.

| Input | SHA-256 | Before=After |
| --- | --- | --- |
| `P\study-in-usa-wordpress-inventory.json` | `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847` | yes (matches packet-expected) |
| `E\canonical-identities.json` | `a4698691ebc458166380aeb655f01d928c901cabfb165214c8e3e0acaa3da775` | yes |
| `E\editorial-before-recovery.json` | `a988096a21ed604518620462fe68ce3332b58de9bdd35a25624ea2ea96c30cd1` | yes |
| `E\editorial-after-recovery.json` | `c3f7a0f63ef8112236759575bd28bd7fc72fad1e9c19d220c3aaab6476585874` | yes |
| `E\editorial-import-validation.json` | `6bafe01d17dc25242aead0ef946786b262df8dcdcad4598bfe8efe7998634f5d` | yes |
| `E\editorial-recovery-verification.json` | `1f6b7e0ad256547af0f6ec466236cde40c4b16b60ebc9f166ea5d5b777fb768a` | yes |
| `E\editorial-identities-after.json` | `a6fdf4b6220728dcefb787bc9ee2a2fe2422ba0ac9a7f9c0fadb307c028b5d1f` | yes |
| `E\ledger-after\import-proposals.json` | `d6abc7a53379c31a3a6591c09d52ee32422d7274703e40bd5d7df88f2ebea340` | yes |
| `E\ledger-after\links-ledger.json` | `7350d56f61337751eb84d52c7d3123e2549bf75f218a623846ebda8a6b0a4d68` | yes |
| `E\ledger-after\media-ledger.json` | `10f5f0b8f404774bfa70e629efb54f509b097e344f46dee233245f280d04deba` | yes |
| `E\ledger-after\reconciliation-ledger.json` | `888b25e7727bfc954912b70ca0ec81987ee0c0a5fc07a30a5f7a9ce7e2db2dba` | yes |
| `E\ledger-after\summary.json` | `2e2d06f4176c172ac9f23d6c351303f0a753417cf8426bedaef32290be761d26` | yes |

Auxiliary inputs also used (hashed once, read-only): `P\p1-wordpress-supplement.json` `ffc73fff5873292e86834c2123945f03939f63c613f11ece9def17f2c446f97b`; `E\editorial-import-batches.json` `9156f1b4264ceadf69819f6eda95cb3dbfe5d2901601564c1633b83b20296bf3`; `P\garage-deployment\ac-reconciliation-2026-10-07\ledger-reviewed\summary.json` (before-recovery ledger snapshot) `f0c1daba85e911487f0636fe81bed2991b346767baa02b3d8fc9404d48faaad1`; repo tooling as-run: `scripts/wordpress-audit/audit-migration.py` `2e96cf9e01d26ce6bc3641b55c596132ce6bf82d859175234013ca8c66a74987`, `media.py` `7b583bc7...`, `links.py` `af279da4...`, `scripts/migration/reconcile-wordpress.py` `2a0ae4a2...`, `test_audit.py` `b24601b4...` (working-tree copy; see Skips).

## 2. Method

1. Read `scripts/wordpress-audit` README and all code before running anything (audit-migration.py, media.py, links.py, test_audit.py, and its dependency `scripts/migration/reconcile-wordpress.py`; also `import-editorial-draft.py` and `editorial-drafts-schema.sql` for interpretation only). Learned actual CLI: `--source --canonical --editorial --storage-manifest --exclusions --field-map --country-id --uploads-base --output --self-check`; only source/canonical/output required.
2. Structure-discovery on every input with my own `python -I` inspectors (evidence: `B\raw-extracts\shapes-*.txt`); schemas differ per file and were not assumed.
3. Ran the committed offline synthetic suite: `python -I <repo>\scripts\wordpress-audit\test_audit.py` — 39 tests, OK (2026-10-10T21:21:06Z).
4. Independently reproduced the deterministic audit (2026-10-10T21:22:22Z) with exactly:
   `python -I <repo>\scripts\wordpress-audit\audit-migration.py --source P\study-in-usa-wordpress-inventory.json --canonical E\canonical-identities.json --editorial E\editorial-identities-after.json --country-id 22 --output B\audit-reproduction-B --self-check`
   (`--uploads-base` left at documented default `wp-content/uploads`; no manifest/exclusions/field-map, matching the `input_digests` keys recorded inside `ledger-after`).
5. Byte-compared all five reproduction artifacts against `E\ledger-after\*` and re-derived every claimed count from the reproduction plus independent extraction (`B\scripts\verify_counts.py`, `B\scripts\verify_readback.py`, results in `B\raw-extracts\verify-counts-result.json`, `readback-result.json`).
6. Full transcript with timestamps/exit codes: `B\transcripts\commands.txt`.

## 3. Verified counts (all cross-checked by my own extraction)

| Claim | Result | My evidence (UTC 2026-10-10) | Confidence |
| --- | --- | --- | --- |
| 243 USA institutions, 10,049 programs, 190 cities | **CONFIRMED** — 243 / 10,049 / 190 rows in `canonical-identities.json`; IDs unique per table; every row `country_id=22`; single-country export (USA id 22); `export_evidence`: "single SELECT statement", observed_at `2026-10-10T19:30:10Z` (historical/offline — not a fresh read) | shapes-1, verify-counts-result.json §canonical | high |
| All 310 standard published original listings/paths matched | **CONFIRMED** — source `job_listing` records: 311 total = 310 `publish` + 1 `published` (id 2606). Record ledger: publish-status listings exactly_matched = 310 (18 institution + 258 program + 34 pathway); path ledger independently agrees (310). The `published` pathway 2606 is disposition `awaiting_review` / `nonstandard_source_status`, correctly not counted | verify-counts §listings_claim_310; ledger row 2606 | high |
| Recovery added 954 articles + 10 pages, retained prior edited article, yielding 955 article drafts + 10 page drafts | **CONFIRMED** — before 1 document, after 965; added 964 (954 article + 10 page by role-diff); retained 1 (`source_post_id` 3986, same document id `606bbbd5-…`, same `created_at`, revision 3→3, status draft, review_state draft, review_note equal, evidence equal); removed 0; 965 distinct source identities and 965 distinct `original_path` values, zero duplicate paths | verify-counts §editorial_recovery; readback-result §retained_article_3986 | high |
| Post-recovery ledger 1,275 matched / 2 missing / 168 awaiting review | **CONFIRMED** — exactly_matched 1,275 / missing 2 / awaiting_review 168; sums to 1,445 records | verify-counts §ledger_claim_1275_2_168 | high |
| Ledger-after produced by the committed tool from these inputs | **CONFIRMED byte-identically** — all five `audit-reproduction-B` artifacts `cmp`-equal to `ledger-after\*`, hashes equal (e.g. summary.json `2e2d06f4…`); `--self-check: identical`; embedded input digests match my computed input hashes | audit-reproduction-run.txt; §1 hashes | high |
| Offline audit tests supported and passing | **CONFIRMED** — 39/39 OK on committed synthetic fixtures (21:21:06Z) | transcripts/test_audit-output.txt | high |

Populations and overlap (explicit):

- 1,445 source records = 957 articles (`post`) + 14 pages + 311 listings (`job_listing`) + 163 attachments (incident-time inventory, captured_at `2026-10-04T11:28:44Z`).
- Editorial-capable set = 971 (957 + 14): 965 exactly_matched (imported drafts) + 4 awaiting_review (`source_path_unresolved`: 134 Blog, 3811 Jobs, 5961, 7553) + 2 missing (`not_yet_imported`: 133 `/explore/`, 2495 `/apply-2/`).
- 168 awaiting_review = 163 attachments (storage destination review) + 4 path-unresolved editorial + 1 status exception (2606).
- **Disjointness demonstrated**: the four missing-path editorial items {134, 3811, 5961, 7553} and the one status exception {2606} share no member with the two missing documents {133, 2495}. None of the seven appears in any import batch (checked against all 964 batch sourceIds).
- The larger canonical catalog vs WordPress is intended expansion: the tool classifies 9,978 canonical rows as `expansion_rows` and 4 as other-origin references; these are never counted as source gaps (reproduction summary `canonical_expansion`). This is stated as intended expansion, not a gap.
- Arithmetic closure against the before-recovery ledger (Oct 7 reviewed snapshot): before missing 966 = 954 articles + 12 pages; recovery accepted 964 and refused 2 → after: article missing 0, page missing 2. `missing: 966` inside `editorial-import-validation.json` equals that before-ledger missing count (954+12), then 964 imported + 2 refused = 966.

## 4. Imported field/body evidence, revision/review state, retained record

- Accepted-vs-read-back, full population: all **964/964** accepted documents equal the read-back export on every carried field (origin, source_post_id, role, country, original_path, title, excerpt, language, byline, published/modified GMT, categories, tags); all **964/964** private evidence blobs byte-equal. (readback-result §accepted_vs_readback; confidence high)
- Stored bodies: read-back exports carry `body_sha256` only, **not** `body_blocks`, so stored-body equality cannot be independently recomputed from these exports. I tried 8 JSON serializations of the accepted `body_blocks` against the read-back `body_sha256`: no variant matched (best 17/50), so the hash is computed over a normalization not archived in the repo. Body fidelity therefore rests on (a) `editorial-recovery-verification.json` claiming insertedVerified 964 / mismatches 0, and (b) the batch-0 replay — both generator-produced, not independently reproducible offline. (confidence: medium)
- `evidence.source_body_sha256` (source capture hash) differs from read-back `body_sha256` for all 964 rows — different hash domains (raw captured HTML vs normalized stored body), not evidence of corruption; flagged so nobody reads it as one. (confidence high on the observation, medium on the interpretation)
- Retained article 3986: unchanged in identity, revision (3), status (draft), review_state (draft), review note, evidence hash, and all read-back fields; body comparison not possible from read-back (absent field). My first-pass "body_blocks_equal: false" was a present-vs-absent artifact of the schema difference and is retracted in favor of this characterization. (confidence high on what is compared)
- Review/approval state: all 965 drafts `status=draft`, `review_state=draft`, revision 1 (964 new) / 3 (retained); importer schema constrains `status='draft'` and `revision=1` on insert; nothing approved or activated by this evidence. (confidence high)

## 5. What the first 25-row replay actually proves

- Batch 0 of 39 contains exactly 25 sourceIds (`editorial-import-batches.json`); `editorial-batch-execution-receipt.json` records `replayBatch0Passed: true` (2026-10-10 22:47 local file time).
- The importer SQL (`scripts/migration/import-editorial-draft.py`) is idempotent **by construction**: per-row advisory lock on `(source_origin, source_post_id)`; on existing row it raises `editorial_import_conflict` unless stored fields equal the payload AND `status='draft'` AND `revision=1` AND private evidence matches. So a passed replay of batch 0 demonstrates, for those **25 rows only**, that the stored rows exactly equal the import payloads (fields + draft status + revision 1 + evidence) at replay time, and that no duplicates were created.
- It does **not** demonstrate re-import idempotency for the other 939 inserted rows (batches 1–38 were never replayed), nor across a changed canonical state. The receipt's prose "Every imported field, normalized body hash and private evidence matched" must be read as scoped to that replayed batch plus the separate full-population read-back claim. Whole-run replay is NOT claimed and NOT evidenced. (confidence high)

## 6. Batch SQL provenance nuance

All 39 on-disk `editorial-batch-*.sql` files are CRLF; their raw SHA-256s mismatch `editorial-import-batches.json` manifest hashes 39/39, but after LF normalization all **39/39 match exactly** (e.g. batch 000: manifest `57d11214…` = sha256 of LF-normalized content; raw file `32f4efbf…`, +452 bytes on 452 lines = 1 byte/line). Conclusion: content-equal, line-ending-only divergence from the manifest snapshot — a Windows-copy artifact, not a content change. Exact executed-SQL provenance would be cleaner if LF-normalized digests were the recorded ones. (confidence high)

## 7. RLS / no-public-read evidence (reviewed; nothing changed)

- Design evidence (committed, read at HEAD d3cd122): `scripts/migration/editorial-drafts-schema.sql` — `public.editorial_documents`: RLS **enabled**, zero policies, ALL revoked from `public, anon, authenticated, service_role`, then `grant select … to service_role` only (server-held datasource); `frontbase_migration.editorial_import_evidence`: RLS enabled, zero policies, all revoked from every role including service_role; no grants.
- Dated live claims (historical, not re-verified): `docs/plans/wordpress-pilot-p1-results.md` ("staging RLS remains enabled, anon/authenticated schema usage and table SELECT denied") and the 2026-10-10 recovery paragraph in `wordpress-pilot-execution-plan.md` / `wordpress-pilot-parallel-handoff.md` ("RLS enabled, zero policies, anon/authenticated SELECT privileges absent on both document/evidence tables").
- This workstream had **no Supabase read path available** (no MCP/DB tool in this session), so no fresh aggregate read was performed and the live posture is not re-demonstrated here. Design evidence: high confidence; current live state: medium confidence, pending one bounded catalog read (below). No policy text was modified anywhere.

## 8. Skips and access limits

- No live Supabase aggregate read: no Supabase tool/MCP available to this session; per packet, offline evidence labeled historical/offline. No credentials were imported anywhere.
- No live WordPress/storage HTTP checks (workstream A/C scope; also unnecessary for B).
- No import replay of any batch (forbidden); replay evidence is the receipt's, not re-executed here.
- `test_audit.py` was run from the shared working tree, where it carries another session's additive, non-weakening change (one extra determinism test); the four audit tool modules themselves are identical to HEAD (audit-migration.py/media.py/links.py/reconcile-wordpress.py hash-verified). Suite writes only to system temp by design.
- Producer script of `editorial-import-validation.json` is not archived in the repo or `E\`; its `accepted`/`refused` contents are fully cross-confirmed against the ledgers and batches, but the generator itself is not available for inspection.
- `body_sha256` normalization not reproducible offline (see §4).

## 9. Three-way categorization

**(1) Demonstrated launch blockers found by this workstream:** none. Every count claims verified; no duplicates, no identity collisions (965 distinct identities and paths), no silent exclusions of the seven exceptional records, no unexplained ledger entries. (This says nothing about scopes owned by A/C/D or about live-state checks not performed.)

**(2) Unresolved evidence requiring follow-up (with exact next actions):**
1. Fresh RLS/no-public-read re-demonstration: one bounded SELECT over `pg_catalog.pg_tables`/`pg_policies`/information_schema role grants for the two tables on project `uwzosvzynnpbxpnwqgkm`, timestamped separately from the 2026-10-10 inventory; owner/coordinator to run when a read path exists. (Owner-deferred until access; not a content defect.)
2. Whole-run idempotency: either a guarded replay of batches 1–38 against a disposable clone, or an explicit statement that only batch-0 (25-row) replay is evidenced. No replay was executed here.
3. Stored-body equality independence: archive the body-normalization code that computes `body_sha256`, or add an offline verifier, so read-back body fidelity does not rest solely on generator-produced files.
4. Regenerate or re-digest the 39 batch SQL files with LF-normalized (or as-executed) SHA-256s so the manifest proves executed content byte-exactly.
5. Archive the producer of `editorial-import-validation.json` (its `accepted/refused/missing` semantics are inferred; contents cross-confirmed).
6. The two missing documents (133 `/explore/`, 2495 `/apply-2/`) and the six review items (134, 3811, 5961, 7553, 2606 + attachment queue 163) remain open owner decisions — disposition table is workstream A's; counts here confirm the sets and their disjointness.

**(3) Owner-deferred improvements (not blockers, no work authorized by this report):** optional cover enrichment (297 blank-with-evidence field-gap candidates recorded by the audit); media/links queues (22,086 references, 249 duplicate URL groups, 453 legacy-domain references, 61 unresolved internal paths / 103 occurrences — detail is workstream C's); 512 KiB/48-record chunk sizing is a proposal, not a host performance proof (workstream D's).

## 10. Evidence index (all under `P\garage-deployment\claude-usa-verification\B\`)

`audit-reproduction-B\` (5 byte-identical artifacts), `raw-extracts\` (shapes-1..5, verify-counts-result.json, verify-counts-stdout.txt, readback-result.json, readback-stdout.txt, batch-manifest-check.txt), `transcripts\commands.txt` (every command + UTC time + exit status), `transcripts\test_audit-output.txt`, `transcripts\audit-reproduction-run.txt`, `scripts\` (inspect_shapes.py, verify_counts.py, verify_readback.py — all fully readable, all run with `python -I`). No secret values appear anywhere in this report or the evidence tree.
