# Claude USA verification — final report

Independent verification of the "Study in USA" WordPress-to-Frontbase pilot, per `docs/plans/wordpress-pilot-claude-verification-packet.md`. Delivered by the coordinator session 2026-10-10 22:24 UTC (2026-10-11 Asia/Kuwait). **This report is evidence for the primary session and owner. It is not acceptance, not publication approval, and not a launch-clearance or release decision.** Four workers delivered reports; the coordinator independently replayed one substantive offline check per workstream (all four: agreement = confirmed). Worker reports are delivery claims; the primary retains acceptance, repairs, integration, and cutover review.

---

## 1. Baseline, coordination state, and input hashes

**Two-state baseline (ruled on, not left flagged).** Work was declared and executed against branch `codex/wordpress-pilot`, HEAD `d3cd12277423e78538527400ba24cfe1c26ce237`, with a shared dirty tree (~137 files cited by the packet; workers observed 141–146 entries as concurrent activity moved it).

**Coordinator ruling on the mid-window commit:** another concurrent session committed `2c51295` ("feat: advance WordPress pilot staging and chunked publication admission", 2026-10-10T21:32:21Z, parent = `d3cd122`, ~151 files per its own diff) while the workstreams ran. It was authored by **no participant of this assignment**: all four workers and all four replay reviewers independently attest zero writes outside their two owned locations, and `git status` at coordinator start and end shows **zero modified tracked files** — only the two untracked entries noted in §6. All protected inputs live outside the repository, so no input hash was affected; D's 21 contract source/test hashes are identical before and after the commit; verify-B and verify-C independently confirmed that among the audit tooling only `scripts/wordpress-audit/test_audit.py` changed `d3cd122..HEAD` (additive, non-weakening). The pre-commit dirty inventory is not itemized in the evidence, so attribution of absorbed files is possible only at commit granularity via `2c51295`'s own diff — no per-file worker attribution is claimed. **No verification result is invalidated by the shift.** Audit-tooling-derived claims (B, C) scope to the `d3cd122` tooling; the only tooling delta is the additive test.

**File ownership.** This directory (`docs/plans/claude-usa-verification/`) is the assignment's only repository output. `progress.md` and `final-report.md` are coordinator-authored (progress.md was claimed before investigation, 2026-10-10 21:10 UTC); the four workstream reports are worker-authored; workers and reviewers touched nothing else in the repository.

**Protected input SHA-256s** (verified before use by every worker; re-verified after — all identical, single-snapshot results; full table with timestamps in `progress.md`):

| Input | SHA-256 (first 16) | Note |
| --- | --- | --- |
| `study-in-usa-wordpress-inventory.json` | `9e6558398c7ee19e` | matches packet-expected historical hash |
| `canonical-identities.json` | `a4698691ebc45816` | |
| `editorial-before/after-recovery.json` | `a988096a…` / `c3f7a0f6…` | |
| `editorial-import-validation.json` | `6bafe01d17dc2524` | |
| `editorial-recovery-verification.json` | `1f6b7e0ad256547a` | |
| `editorial-identities-after.json` | `a6fdf4b6220728dc` | |
| `remaining-source-routing-live.json` | `4304d162c5ca4db9` | fresh source read 2026-10-10T20:59:48Z |
| `remaining-page-form-evidence.json` | `5e79fff0a7cef74d` | |
| `measure-content-chunks.py` / `content-chunk-sizing.json` | `61662d0453b65033` / `f7b2953b2326197f` | |
| `ledger-after/*` (5 files) | see `progress.md` | |

**Protected SSH key note:** `E\wordpress-recovery-key` is the packet-designated protected copy. No worker read, printed, moved, or loosened it; A's transcript attests no SSH command was ever composed. This is the packet's intended state, not a finding.

## 2. Method, commands, and evidence locations (no secret values anywhere)

Each worker: hashed inputs before/after; read the relevant repo tooling in full before running anything; ran `python -I` scripts it had authored and reviewed, with inputs as quoted absolute paths; kept `commands.txt` transcripts with per-command UTC timestamps and exit statuses; sealed evidence in its private directory under `<private root>\garage-deployment\claude-usa-verification\{A,B,C,D}\`. Each coordinator reviewer did the same under `…\claude-usa-verification\verify-{A,B,C,D}\`.

Coordinator replays (one substantive offline check per workstream, independent method each time, plus a selected record and an explicit failure case):

- **verify-A** — own fail-closed PHP scalar/array decoder; re-decoded all three maps and 8 options; re-derived dispositions for 2606 and 134; decoded maps semantically identical to the worker's; selected record 2606 (verbatim fields, nonstandard `published` corroborated); failure cases: truncated array, object payload `O:8:"stdClass"`, trailing data — all rejected cleanly, no object instantiation by construction.
- **verify-B** — own counting method (no audit CLI re-run): 243 institutions (all `country_id=22`, unique ids), 10,049 programs, 190 cities; 955 article + 10 page drafts; 964 revision-1 + exactly one revision-3 retained doc (3986, 19 identifying fields equal across both exports); selected record 3986; failure case: 70%-truncated copy of canonical-identities fails loudly (`JSONDecodeError`, exit 1).
- **verify-C** — own anchor-extraction classifier written from scratch after reading `links.py`: reproduced **all six** links-ledger summary numbers exactly (1025 resolved / 61 distinct / 103 occurrences / 1255 external / 91 non-http / 50 unsafe-or-relative), plus 163 attachments, 4 distinct unsafe values, 13 ELS rows with exact ids, 0/61 destinations vs 965 editorial + 314 canonical paths; selected record `/news` (9 records, 1 occurrence each); failure case: `javascript:void(0)`, `../` traversal, tab-obfuscated `java<TAB>script:`, `data:text/html` — all flagged, zero silent passes (one documented blind spot: a raw `>` inside an href is skipped by the anchor regex — inherited from the production scanner rule, does not affect the counts).
- **verify-D** — hand-rolled canonical JSON serializer (cross-checked byte-exact against stdlib) over the derived 965-record corpus: total bytes 9,904,692 and largest document 25,625 reproduced exactly, plus every secondary aggregate (21 chunks, per-chunk counts, index 249,711, manifest hash `57e88f3d…`, uniqueness, ordering, round-trip); selected record: largest document (source_post_id 7823) round-trips byte-equal; failure case: **zero-build offline unit test against the repo's pre-built chunk validator** (own sqlite fixture DB): flipped byte → refused `publication_chunk_unavailable`; tail truncation → refused; structurally-valid record-drop → refused via descriptor re-verification; tampered descriptors → refused; `put()` retry over corruption refused (`ON CONFLICT DO NOTHING`); missing → `null`, never fallback. 13/13 PASS. Caveats: the harness exercised pre-built `dist` artifacts (mtime 21:25:38Z, after last src edits; refusal logic read line-by-line as identical to source — strong but not cryptographic dist-freshness evidence); manifest-level `loadVerifiedChunk` refusal was established by code inspection only. (The first replay attempt for D was killed by a provider rate-limit error mid-run; its partial files remain in `verify-D\` and were left untouched by the second attempt, whose artifacts are separate.)

Disclosed failures/skips (full lists in each report): A — one script exited 1 (sort_keys TypeError) and was fixed, no conclusion drawn from it; optional SSH read not used. C — one interleaved curl/xargs probe run discarded and redone in Python. D — an f-string syntax fix in its verifier. B — no live Supabase path existed (offline evidence labeled historical). Nobody ran builds, installs, mutation suites, form submissions, crawls, source writes, or any policy/state change.

## 3. Findings: routes, recovery, dependencies

### 3.1 Seven-record route disposition table (workstream A; replay-confirmed)

Routing facts (decoded from `remaining-source-routing-live.json`, fresh 2026-10-10T20:59:48Z, values identical at incident): `home`/`siteurl` `https://study-in-usa.com`; `page_on_front`=132 (not one of the seven); **`page_for_posts`=0 — no posts page configured**; permalink `/%postname%/`; URI map 1,514 fresh / 1,512 incident entries; **`permalink-manager-redirects` empty in both snapshots (zero internal redirects configured)**; external-redirects 548 fresh / 540 incident with **every value an empty string — zero redirect destinations configured anywhere**. All seven identities field-identical across snapshots.

| WP ID / path | Status / type | URI map | Demonstrated treatment | Disposition | Confidence | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| 133 `/explore/` | publish / page | explicit `explore`, both snapshots, unique | empty body consistent with directory shell; `sourceRoutes.directory="/explore/"` agrees; GET 200 today | **CONFIRMED-MAPPING** | high | none for routing; directory rendering is B/C scope |
| 2495 `/apply-2/` | publish / page | explicit `apply-2`, unique | GET 200; Fluent Forms 3 captured (31 fields, 8 uploads, hidden prefill, 2 consent checkboxes); **no Frontbase form runtime demonstrated anywhere**; local draft `bada7b47…` unpublished/inert | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | verify/build Frontbase apply runtime; fix cross-brand consent links (see §5 blocker 2) |
| 134 `/blog/` | publish / page | **absent** (default-derived); `page_for_posts`=0 | foreign GUID (`study-in-hungary.com`) **rejected** as evidence; GET 200 serves Elementor shell `page-id-134` with 0 articles; template 3601 content uncaptured | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | capture template 3601; decide the `/blog/` destination treatment |
| 3811 `/jobs/` | publish / page | **absent** (default-derived) | content is an external careers iframe (`crm.velents.com`), not an article; GET 200 | **TEMPLATE-OR-CONTACT-TREATMENT-NEEDED** | high (facts) | decide embed treatment; no mapping work remains |
| 5961 | publish / post | **absent** both snapshots | incident permastruct derives `/blog/<slug>/`, but live today: `/blog/<slug>/` → **301** → bare `/<slug>/` → **200** (observed 21:23–21:24Z) | **DERIVED-CANDIDATE-AWAITING-CONFIRMATION** | high (observed chain) / medium (stable rule) | one bounded permastruct SELECT resolves the rule (U1) |
| 7553 | publish / post | **absent** both snapshots | same observed 301→200 chain as 5961 | **DERIVED-CANDIDATE-AWAITING-CONFIRMATION** | high (observed chain) / medium (stable rule) | same as 5961 |
| 2606 `eckerd-college/american-explorer-course/` | **`published` (nonstandard)** / `job_listing` (pathway) | explicit, both snapshots, unique | GET today **404** — stored URI demonstrably not publicly served; external-redirect entry empty; neither excluded nor approved; no database change made | **UNRESOLVED** | high (facts) | owner decision: normalize source status vs Frontbase-side pathway treatment, then one verification GET |

Evidence rules held: slug+permastruct = derived candidate only; GUIDs carry zero canonical weight; today's HTTP responses recorded as current serving behavior, never historical routing proof; 10 bounded GETs total, no forms, no crawl.

**Systemic finding (gates rows 5–6 and the blog route table):** the incident permastruct (`post: blog/%postname%`; `mylisting_permalinks` line additionally abbreviates — `category_base` and `region_base` also present) contradicts today's observed canonicalization, and 1,010 fresh URI entries are `blog/`-prefixed with unknown coverage. One bounded SELECT of `permalink-manager-permastructs` + `mylisting_permalinks` resolves it (U1). Source drift: uris +2, external-redirects +8 in 6 days — recapture routing state immediately before any cutover.

### 3.2 Recovered data comparison (workstream B; counts replay-confirmed)

- **Ledger provenance proven byte-identically:** an independent reproduction of the committed audit (`audit-migration.py --source … --canonical … --editorial … --country-id 22`) is `cmp`-equal on all five artifacts to `ledger-after/*`, with `--self-check: identical` and matching embedded input digests. Offline suite: 39/39 OK.
- **Canonical:** 243 institutions / 10,049 programs / 190 cities — all `country_id=22`, unique ids; export evidence `single SELECT statement` observed 2026-10-10T19:30:10Z (**historical/offline**).
- **310/310 standard published listings matched** (18 institution + 258 program + 34 pathway). The 311th listing (2606, status `published`) is correctly `awaiting_review`/`nonstandard_source_status`, not counted.
- **Editorial recovery:** 1 → 965 documents; added 964 (954 articles + 10 pages); retained article 3986 unchanged (same id, created_at, revision 3, draft state, review note, evidence); 0 removed; 965 distinct identities and paths.
- **Ledger:** 1,275 matched / 2 missing (133 `/explore/`, 2495 `/apply-2/` — `not_yet_imported`) / 168 awaiting review (163 attachments + 4 path-unresolved {134, 3811, 5961, 7553} + 1 status exception {2606}). **Disjointness demonstrated**: the four missing-path items and the status exception share no member with the two missing documents; none of the seven appears in any import batch. Larger canonical catalog = intended expansion (9,978 expansion rows), never counted as a gap.
- **Read-back:** 964/964 accepted documents field-equal; 964/964 private evidence blobs byte-equal. **Stored-body equality is medium-confidence**: read-back carries `body_sha256` but not the normalization, which is unarchived and not reproducible offline (8 serialization variants tried; best 17/50); body fidelity rests on generator-produced verification artifacts. `source_body_sha256` ≠ read-back `body_sha256` is a hash-domain difference, not corruption.
- **Replay scope:** batch 0 (25 rows) replay receipt passed; importer is idempotent by construction; **whole-run idempotency is NOT evidenced** (batches 1–38 never replayed) — the receipt prose must stay scoped.
- **Batch SQL provenance:** 39/39 files content-equal to the manifest only after LF normalization (CRLF Windows-copy artifact; +1 byte/line).
- **RLS:** committed schema has RLS enabled, zero policies, all privileges revoked, service_role select on documents only; dated live claims agree — **live posture is historical-only** (no Supabase read path existed; no policy changed).

### 3.3 Media / internal-link queue (workstream C; ledger numbers replay-confirmed)

All four packet numbers confirmed: **13** ELS institution SVG logo rows (single URL, ids 852/878–889); **61 unresolved internal paths / 103 occurrences** (95 distinct path-record pairs + 8 same-record repeats — both numbers correct under their rules); **50** unsafe-or-relative occurrences (**4 distinct values**: `${stringifiedtrackedURL}` template leak, `_wp_link_placeholder`, `javascript:void(0);`, a raw-space simmons.edu URL); **163** attachment review items (all images, `storage_only`, **no MIME evidence exists in the export**). Scope correction: 35 program rows also reference the ELS SVG (98 program rows carry SVG logos overall).

Finite prioritized queue (12 items in `dependencies.md`; deduped highlights):

| # | Item | Category | Launch blocker | Treatment (consumer/config vs reusable code) |
| --- | --- | --- | --- | --- |
| 1 | 13 ELS logo rows — SVG live (probe 200 `image/svg+xml`) but raster-only contract rejects | (c)/(a) | **Yes for any page rendering those rows**; current 5-institution capture already excludes them | rights-cleared raster via the guarded six-stage pipeline; reusable: SVG-logo preflight lister (institutions **and** programs) so "13" cannot silently grow |
| 2 | 61 unresolved internal paths / 103 occurrences — 0/61 has a reviewed destination (vs 965 editorial + 314 canonical paths); 5/6 sampled already 404 upstream | (d) | per-page for pages containing them | strip/map at conversion, top-7 paths first (39 of 103); `/apply` stays inside the acknowledged non-goal; reusable: link-health gate + redirect-map worksheet |
| 3 | Legacy-origin media: 453 refs / 176 distinct URLs; ≥4 of 10 probed already 404 (2023/06 cluster) | (b) | potentially, for pages referencing dead assets | per-asset owner decision (18 inline + 76 thumbnail + 181 cover refs prioritized); reusable: re-run audit with `--storage-manifest` |
| 4 | 163 attachments — storage destination unreviewed, MIME evidence absent | (b)/(c) | no (storage_only) | connect storage; capture MIME at acquisition; reusable: warn on absent `post_mime_type` |
| 5 | 4 broken/placeholder href values (50 occurrences) | (c) | per-page quality | drop/fix at conversion; covered by #2's gate |
| 6 | 130 `a:`-serialized cover values — non-URLs, never to be unserialized | (a)/(c) | no | treat as "no cover"; reusable: distinct `serialized_reference` issue code |
| 7 | 337 relative inline `src` | (b) | per-page | base-URL resolution at conversion |
| 8 | 583 distinct external inline images — 8/8 sampled live; rights unknown | (b)/(c) | no today | owner rights review where kept; prefer re-hosting hero images |
| 9–12 | 297 blank-cover proposals (`executable:false` verified) + 9,976 further blanks; 98 program SVG rows; 7,912 query-string refs; 190/190 blank `cities.city_image` *(attested-only — no named extract in evidence; see §6 limits)* | (a) | no — owner-deferred enrichment | sequenced with expansion; text-only layout accepted |

Probe discipline: 30 HEAD requests total, concurrency 2, 12 s timeout, no bodies, no redirect-follow, no rendering; **no bucket fully checked; no bucket-wide claim made** (2.4% of 1,250 distinct media URLs).

## 4. Capacity findings and requirements for the primary's implementation (workstream D; replay-confirmed)

**Sizing verified exactly and deterministically** (both checked headline measurements derive from `editorial-import-validation.json` + `editorial-before-recovery.json`; `canonical-identities.json` contributes only `canonicalIdentityBytes`): 965 documents (955 articles, 10 pages), **9,904,692** canonical UTF-8 bytes, largest document **25,625** bytes, **21 chunks** bounded by 524,288 bytes and 48 records (16 at exactly 48 records; largest chunk 523,770; min 60,045), index 249,711 bytes / 965 entries, manifest hash `57e88f3d434c09a19…`. Two script runs byte-identical; independent re-derivation matches every aggregate; ordering `(collection_role, original_path)`, uniqueness 965/965, exact round-trip. Normalization caveats: exactly 14 fields retained; the recovered before-recovery document drops 8 keys (incl. `cover_url`, `review_state`); `language` null on 964/965; `roundTripExact:true` is a written constant (property enforced by assert and independently re-proven). **Synthetic chunk counts are not host performance proof.**

**Contract as read from source** (hashes in `capacity.md`): v1 whole-artifact (48/collection, 1 MiB, templates 1–7, `directory-snapshot-v1`); v2 chunked manifest (512 KiB/48-record hashed chunks, 2,048 chunks, 80,000 index entries, 256 MiB catalog, `directory-chunks-v1`) — **referenced only by its own modules and tests; public serving uses v1 only (grep-verified independently)**. Immutable SHA-256 content hashes re-verified on read; corruption never overwritten; review gate requires the activation target's own five-check review; CAS active pointer with advancing generation (forced-race: exactly one winner); serving derives pagination/detail/sitemap/SEO/cache keys from one pointer read, no mutable draft access, missing→404 / invalid→400 / corrupt→503, never fallback. **Generic pages are NOT supported — verified, not assumed** (no page role, no page records, non-captured paths 404); the 10 migrated page-role documents cannot publish under the current contract.

**Implementation acceptance requirements R1–R8 (requirements only — the primary owns the design decision; nothing was implemented, no schema edited, no limit raised, no architecture declared accepted):** R1 bounded hashed chunks/index with descriptor re-verification at write/read; R2 global path/parent/route-collision admission before any persistence; R3 refusal (never repair/skip) of missing/corrupt/foreign chunks, index re-derivation as tamper detector; R4 no mutable draft datasource reads during public requests, strict parameter allowlists; R5 atomic CAS activation/rollback with advancing generation; R6 legacy v1 compatibility preserved — including closing the honest gap that chunked serving is currently unproven end-to-end; R7 paginated queries/detail/SEO from one same-generation pointer read; R8 public articles trace to an exact `(id, revision, fingerprint)` editorial approval with the target's own review; missing/tampered review → 503, never stale content. Any implementation lands with behavior + mutation tests of equal strength to the existing five suites, then `pnpm -r check`, `pnpm -r build`, and the publication suites re-run (outside this assignment).

## 5. Consolidated categories (deduped across workstreams)

### (1) Demonstrated launch blockers

| # | Blocker | Evidence | Next action |
| --- | --- | --- | --- |
| L1 | **Pathway 2606 has no working source route**: stored URI 404s live; status literal `published` is nonstandard; excluded from the 310 as awaiting_review. One subject, two facets (A-B1 + B status exception) — single entry. | A disposition row 7; GET 2026-10-10T21:23:38Z; B ledger; verify-A selected record | Owner decision: normalize source status vs Frontbase-side pathway treatment; one verification GET; no DB change made by this assignment |
| L2 | **Apply conversion path runtime undemonstrated** (2495): route live, form 3 captured (31 fields), but no Frontbase form runtime in any input; consent checkboxes link to `study-in-uk.com` legal pages. Distinct from the apply-path internal links in queue item 2 (cross-referenced, not merged). **Non-goal preserved**: saved Apply form unchanged; draft `bada7b47-783b-41fa-aa90-913d324aa9f2` (`apply-2`) stays unpublished; configured email/WhatsApp contacts can support launch; nothing here implies the disabled preview collects applications. | A rows 2; `remaining-page-form-evidence.json`; form-3 verbatim dump 21:18:03Z | Verify/build the Frontbase form runtime before traffic; correct consent links as part of that work |
| L3 | **Blog landing destination undefined** (134): `/blog/` serves an Elementor shell with 0 articles, template 3601 uncaptured, `page_for_posts=0`. Distinct from the contract-level page-role gap U8 (cross-referenced). | A row 3; retained `/blog/` body capture | Capture template 3601; decide destination treatment |
| L4 | **13 ELS institution logo rows fail the raster-only publication contract** (SVG live; rights-cleared raster required; blocker for inclusion — current capture already excludes them) | C queue item 1; probe 200 `image/svg+xml`; execution-plan refusal evidence | Source raster logo; guarded six-stage pipeline before those pages are prepared |
| L5 | **Dead legacy upload URLs referenced by recovered content**: ≥4 of 10 probed legacy URLs 404 (2023/06 cluster; one also an attachment). Bounded evidence — full exposure unknown (U3). | C probe table; `availability-probe-results.json` | Per-asset owner decision; prioritize the 18 inline + 76 thumbnail + 181 cover refs |

### (2) Unresolved evidence requiring follow-up

| # | Item | Next action |
| --- | --- | --- |
| U1 | **Post route contract unresolved** (gates A rows 5961/7553 and the blog route table): fresh permastructs not captured; observed 301 mechanism unproven; 1,010 `blog/`-prefixed URI entries of unknown coverage; routing state drifting (+2 uris / +8 external-redirects in 6 days) | One bounded SSH SELECT (`permalink-manager-permastructs`, `mylisting_permalinks`) via the trusted Docker SQL pattern; then freeze the post route contract; recapture routing state at cutover |
| U2 | 61 unresolved internal paths / 103 occurrences, 0/61 with reviewed destination; mostly pre-existing WordPress breakage | Owner decides destinations (strip vs redirect-map), top-7 first; reusable link-health gate |
| U3 | Legacy media availability at scale (170/176 unchecked); 163 attachments' storage destination; MIME evidence absent | Connect storage; re-run audit with `--storage-manifest` so availability stops being `unknown_offline` |
| U4 | RLS live posture is historical-only (no fresh Supabase read path existed) | One bounded catalog read (`pg_policies`/grants for the two tables) when a read path exists; timestamped separately |
| U5 | Import idempotency evidenced for batch 0 (25 rows) only | Guarded replay of batches 1–38 on a disposable clone, or state the 25-row scope explicitly in acceptance |
| U6 | Stored-body fidelity rests on generator-produced artifacts (normalization unarchived) | Archive the `body_sha256` normalization code or add an offline verifier |
| U7 | **Chunked (v2) serving unproven end-to-end** — stores not wired into serving (grep-verified twice) | Primary's implementation must satisfy R1–R8 with equal-strength tests |
| U8 | **Generic pages unsupported by the contract**; 10 migrated page-role drafts cannot publish | Owner decision: page-role support or explicit exclusion from pilot scope |
| U9 | Sizing normalization dropped 8 keys on the recovered document; `language` null 964/965 | Define the explicit export/capture field schema before capturing the 965-document set |
| U10 | No host latency evidence (synthetic counts only) | Separate credentialed measurement wave |
| U11 | Repo suites and mutation gates were read, not executed (read-only mandate) | `pnpm -r check`, `pnpm -r build`, five publication suites + mutations on the implementation path |
| U12 | Mojibake (U+FFFD) in 5961 title/body — **live-response observation (unretained)**; zero U+FFFD in every retained artifact per verify-A, so source-data damage is NOT established | Content workstream quantifies mojibake scope against the live origin before cutover |
| U13 | Provenance archives: `editorial-import-validation.json` producer unarchived; batch SQL digests differ from manifest raw (LF-only) | Archive the producer; re-digest batches LF-normalized |
| U14 | External image rights (583 distinct URLs) and SVG program census (98 rows / 35 ELS) at expansion | Rights review where kept; preflight lister before any expanded preparation |

### (3) Owner-deferred improvements (recorded as risk; not authorized work)

Blank optional covers (10,273 refs / 297 with `executable:false` proposals) + 1 blank logo; 190 blank city images (attested-only); alt-text gaps; 548 empty external-redirect entries cleanup; `_sq_old_slug` remnants; foreign-domain GUIDs (hygiene only); query-string URL canonicalization; duplicate-URL acquisition dedupe (249 groups, largest 669 — **attested-only**); page-role model and bound documentation (D deferred); `canonicalIdentityBytes` newline-convention documentation; validator-role-logic consolidation.

**Normalizations applied (coordinator, per replay findings):** D's `canonicalIdentityBytes` *narrative* was imprecise — `canonical-identities.json` is compact **insertion-order** JSON + newline, not key-sorted canonical; the **value 3,694,898 is correct** (key reordering coincidentally preserves byte count). C's canonical legacy numbers are 453 refs / 176 distinct URLs (its structured counts contained duplicate keys). A's `scripted_python_runs: 7` understates ~10 `python -I` invocations (bookkeeping only). All four workstream reports otherwise survived adversarial replay with zero numerical discrepancies.

## 6. Changed paths, hashes, concurrent changes, assurance limits

**Changed repository paths (all untracked, inside the owned directory; zero tracked files modified anywhere, verified by all four reviewers and by the coordinator at start and end):**

| File | Author | SHA-256 (at finalization) |
| --- | --- | --- |
| `progress.md` | coordinator | `1ec25d60b7355f41…` |
| `routes.md` | worker A | `4b3433bcf9d7a188…` |
| `recovery.md` | worker B | `321826c26b7124ab…` |
| `dependencies.md` | worker C | `7fe7e32b6fd8033a…` |
| `capacity.md` | worker D | `eb02c21019d2f3d8…` |
| `final-report.md` | coordinator | recorded in `progress.md` after this write |

Other untracked path: `scripts/wordpress-audit/__pycache__/` — pre-existing bytecode residue (mtimes 2026-10-07/10-10 morning, all pre-dating the work window); untouched; owner may clean or `.gitignore` it. **Concurrent change:** commit `2c51295` (ruled on in §1). **Protected inputs:** all hashes identical before/after in every workstream (single snapshot; no split reporting). Worker evidence trees carry their own final hash manifests (`evidence-hashes-final.txt`, `final-hashes.txt`, per-directory `commands.txt`).

**Assurance limits (preserved at full strength):**

- **Replay coverage:** A, B, C, D each independently replay-confirmed (agreement=confirmed, `input_hash_stable=true`, zero numerical discrepancies). Replay proves the checked samples, not every claim: verify-B did not re-derive the byte-identical audit reproduction (attested via retained artifacts); verify-C did not re-issue the 30-URL probe; verify-D's corruption harness ran against pre-built dist artifacts (source-identical by inspection, not cryptographic freshness) and established manifest-level refusal by inspection only.
- **B:** stored-body equality medium-confidence; live RLS posture historical-only; replay receipt scoped to 25 rows.
- **C:** 30 of 1,250 media URLs probed (2.4%); 170/176 legacy uploads unchecked; MIME `unknown_offline`; lexicographic sample clusters not representative; two claims attested-only (249 duplicate groups / largest 669; `cities.city_image` blank 190/190).
- **A:** no fresh permastructs (incident-time only); 301 mechanism unproven; 1,010 `blog/`-prefixed entries of unknown coverage; F4 mojibake unretained (relabeled U12); today-HTTP is current serving behavior only.
- **D:** synthetic chunk counts are not host performance proof; suites read, not executed; capacity headline bytes derive from the two editorial JSON inputs (scoping corrected from the task text).
- **Global:** no fresh Supabase read anywhere (all catalog/RLS catalog evidence historical/offline); no historical/web-archive routing proof; worker passing reports are delivery claims, not acceptance.

**Claim discipline:** no unqualified migration-complete, security-clean, or launch-ready claim is made or implied. This assignment made no content approval, no activation, no deployment, no domain/DNS change, no customer messaging, no real submissions, and no framework-release or CF-22 decisions. Verification completion means this bounded report is delivered — it does not mean the site is launch-ready.

---

*End of report. The primary session should incorporate accepted findings into its own state; the owner decides the L1/L2/L3/U1/U8 owner decisions listed above.*
