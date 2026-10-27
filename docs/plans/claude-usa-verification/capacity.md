# Workstream D — Content Sizing and Publication-Contract Verification

- Workstream key: **D** (of four-part read-only verification, "Study in USA" WordPress-to-Frontbase pilot)
- Report UTC date: **2026-10-10T21:24:58Z** (2026-10-11 Asia/Kuwait)
- Baseline commit: `d3cd12277423e78538527400ba24cfe1c26ce237`, branch `codex/wordpress-pilot`
- Working tree at start: 141 dirty entries observed via `git status --porcelain` (assignment cited 137 pre-existing from other sessions; delta is other sessions' concurrent activity — none touched by this workstream)
- Status: **READ-ONLY verification complete for both assigned tasks.** This report is a delivery claim, not acceptance. No "migration-complete", "security-clean" or "launch-ready" claim is made or implied.

## Input hash table (SHA-256, before use; re-verified after — see §Re-verification)

| Input | SHA-256 | Matched claimed |
|---|---|---|
| `.../usa-fresh-reconciliation-20261010/measure-content-chunks.py` | `61662d0453b6503353a4631dbe62645ed4f5b490df59ec5c7fbbe218517be99d` | yes |
| `.../usa-fresh-reconciliation-20261010/content-chunk-sizing.json` | `f7b2953b2326197f546b1d8377037faa6c0f39bf7afb66f63aad76459b321ed4` | yes |
| `.../usa-fresh-reconciliation-20261010/canonical-identities.json` | `a4698691ebc458166380aeb655f01d928c901cabfb165214c8e3e0acaa3da775` | yes |
| `.../usa-fresh-reconciliation-20261010/editorial-import-validation.json` (script input, hash not pre-claimed) | `6bafe01d17dc25242aead0ef946786b262df8dcdcad4598bfe8efe7998634f5d` | n/a |
| `.../usa-fresh-reconciliation-20261010/editorial-before-recovery.json` (script input, hash not pre-claimed) | `a988096a21ed604518620462fe68ce3332b58de9bdd35a25624ea2ea96c30cd1` | n/a |

Contract sources read (hashed before use, re-hashed after):

| File (repo-relative) | SHA-256 |
|---|---|
| `packages/edge-core/src/directory/publication.ts` | `27f68f869ff09ad7021b4ffef2e6a1a736a043b8c9f6210c05a671cccdfe0edd` |
| `packages/backend/src/compat/site-publication-prepare.ts` | `1bda0a88059837e7794d963e929cf95b647eb107f4be7ac8486498be36d85ffe` |
| `packages/backend/src/compat/site-publication-store.ts` | `22ece6ab26ce9feafea53e8d818223d0bb0fc97bb0a989da13307d4b304b6414` |
| `packages/backend/src/compat/site-publication-runtime.ts` | `5a02d13dd05fee3953d2f11406ecbcae63c68f3d4267c7f5d35c92cd2610b930` |
| `packages/backend/src/compat/site-publication-chunks.ts` | `c8a60900b274b60aac23894eb346023a62fb7448ff88e1672d37edf360ccf699` |
| `packages/backend/src/compat/site-publication-serving.ts` | `9ee5aef5b377e2d3534bfb88e3b4934e8f5703def70e9d4fcdbb45fb031e8849` |
| `packages/backend/src/compat/site-publication-manifest.ts` | `dbba37db2f0cba2f2237e2d6957095b7ed329e3b500493a501e255ec94adaa54` |
| `packages/backend/src/compat/site-publication-review-store.ts` | `6b50bf407527380e2877752fde8b8378ac71f57124f258811d5b98e34c380c42` |
| `packages/backend/src/compat/site-publication-sitemap.ts` | `db1113c1a6d6009c84ce465e884bdf0cab318196903fec80711428a021a6b1f3` |
| `packages/backend/src/compat/routes/site-publication.ts` | `98fd048e84acbdff3b18cacfe9f9e1cbc9d4c3c4a93850ba71564fc4110e5249` |
| `packages/backend/src/compat/routes/site-publication-controls.ts` | `37fc5ca97fcad18025ba06b1ce2b724e5528c9a43bdd78b45d04811f24e989fd` |
| `packages/backend/test/site-publication.mjs` | `265058993029c70566d772fee57a25012eee973e0326f8ea81d84bab49f3f094` |
| `packages/backend/test/site-publication-mutation.mjs` | `269b4a9cb15cf4d01addcfca7a1b6d02312581ea2cbeba7e3cb90bf64148a9a0` |
| `packages/backend/test/site-publication-chunks.mjs` | `8f0b89aaf25b0468907efe8b3e972b992fcf2bec8226e649d898badbcf543a41` |
| `packages/backend/test/site-publication-chunks-mutation.mjs` | `e785e8f8c035ecfb3cbfa832f6a082aa0297eaafb838852c97c52ad82981d601` |
| `packages/backend/test/site-publication-manifest.mjs` | `4a4912a13c7dfc2c158eaea2cdeba3a7597b7568df6e6ecc9825704751cc0ea0` |
| `packages/backend/test/site-publication-manifest-mutation.mjs` | `315b7e6396a748983c6ca197d2d899168d6739318465e3230bf0ecdd3ddae98c` |
| `packages/backend/test/site-publication-controls.mjs` | `84d8bc7326be95acc7a096d62a076dffe5d2e1a437940a60bb718c289249818c` |
| `packages/backend/test/site-publication-controls-mutation.mjs` | `605c9aade38056b39df257b1514268bd807a14110cd93a0ce77ffc7df0800174` |
| `packages/backend/test/site-publication-seo.mjs` | `212138aa1c339360c6aee1c902219e74a85fa92d14148da4ca3710a2118f4a0b` |
| `packages/backend/test/site-publication-seo-mutation.mjs` | `37976db75ea573dbc55ec3a6784dbf14f833b846e3a1ba2803596d181243d577` |

## Method

1. Hashed every protected input before use (script, both named evidence JSONs, plus the two further JSON inputs the script actually reads — identified by fully reading the 28-line script first).
2. Copied the measure script bit-identically into the private evidence directory (hash of copy equal to source) together with read-copies of its three JSON inputs; the original input locations were never written to.
3. Ran the copy with `python -I` inside the evidence directory; it writes only `content-chunk-sizing.json` there (its output path is `Path(__file__).parent`).
4. Authored a second, fully reviewed script (`verify-sizing.py`) that independently re-derives every claimed number, re-implements the greedy chunking, checks identity/path uniqueness, global ordering, canonical-JSON/UTF-8 properties, exact round-trip, index mapping consistency, and field-retention; ran it with `python -I`.
5. Re-ran the measure script and byte-compared the two runs; byte-diffed the rerun output against the primary snapshot.
6. Read the publication contract sources and their five test files plus five mutation scripts in full; grepped to establish which modules actually reference the chunk/manifest stores.
7. No builds, no dependency installation, no test execution, no mutation suites, no process or service changes. Command transcript with UTC timestamps and exit statuses: `commands.txt` in the evidence directory.

Evidence directory: `C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6/garage-deployment/claude-usa-verification/D/` (script copy, fixtures, run stdout/stderr, verification output, hashes, transcript).

## Task 1 — Offline sizing reproduction: all claimed measurements VERIFIED (confidence: high)

Independent re-derivation (UTC 2026-10-10T21:15Z, `verify-sizing-output.txt`) reproduces every number in `content-chunk-sizing.json` (sha `f7b2…1ed4`):

| Claim | Claimed | Independently recomputed | Verdict |
|---|---|---|---|
| Documents | 965 | 965 | match |
| Total canonical content bytes | 9,904,692 | 9,904,692 | match |
| Largest single document | 25,625 bytes | 25,625 bytes | match |
| Chunks | 21 | 21 | match |
| Chunk byte bound | 524,288 (512 KiB) | 524,288 | match |
| Chunk record cap | 48 | 48; max observed per chunk = 48 | match |
| Largest chunk | 523,770 bytes | 523,770 bytes (min 60,045) | match |
| Index bytes | 249,711 | 249,711 (965 entries, one per document) | match |
| Deterministic manifest hash | `57e88f3d434c09a19a913c4787a63e0ec242239eced8ab02b847a0613e90e36c` | same | match |
| Role split | — | 955 articles, 10 pages (histogram exactly `{"article": 955, "page": 10}`) | consistent |
| Canonical identity bytes | 3,694,898 | 3,694,898 = file size 3,694,899 minus 1 trailing newline | match |
| Canonical rows | 10,049 programs / 243 institutions | same (top-level keys: cities, countries, export_evidence, institutions, wp_program_ids) | match |

Reproduction quality (evidence, UTC 2026-10-10T21:1x–21:2xZ):

- **Byte-identical determinism:** two runs of the measure script produced byte-identical outputs (`before-rerun.hash` vs `after-rerun.hash`), and the rerun output has **zero field diffs** against the primary `content-chunk-sizing.json` snapshot.
- **Canonical serialization:** `json.dumps(ensure_ascii=False, sort_keys=True, separators=(',',':'))` encoded to UTF-8; a non-ASCII document (`/blog/12-carbon-monoxide-dangers-…rutgers-university-camden/`) encodes and decodes to an identical value; byte counts are UTF-8 lengths by construction.
- **Uniqueness:** 965 unique `(source_origin, source_post_id)` identities and 965 unique `original_path` values (all origin `https://study-in-usa.com`); reassembled chunks preserve both.
- **Deterministic ordering:** documents sorted by `(collection_role, original_path)`; reassembly is globally sorted by that key and index mapping (path/role/sourceId/title/chunk offsets) is consistent, positions 0..47.
- **Exact round-trip:** reassembled `[row for chunk in chunks for row in chunk] == records` — deep-equality true. Note the output field `roundTripExact: true` is a written constant; the property itself is enforced by the script's assert (line 22) and independently re-proven here.
- **Bounds:** no oversized single document (max 25,625 ≤ 524,288); every chunk ≤ 524,288 bytes and ≤ 48 records; greedy packing yields 16 full 48-record chunks and 5 byte-bound-truncated chunks (counts `48,48,48,47,48,48,44,48,47,48,48,48,47,48,48,48,48,48,48,48,12`).
- **Composition:** 964 rows from `editorial-import-validation.json['accepted']` (all sharing exactly one 14-field schema) + 1 document from `editorial-before-recovery.json['documents']`.

**Measurement assumptions and retained metadata (verified):**

- Retained fields (14, from the first accepted document's key order): `source_origin, source_post_id, collection_role, country_id, original_path, title, excerpt, body_blocks, language, public_byline, published_gmt, modified_gmt, categories, tags`.
- Normalization caveat: the single recovered before-recovery document (draft article `source_post_id` 3986, `review_state: draft`, `revision: 3`, `language: en`) carries 8 additional keys that sizing silently drops: `cover_alt, cover_url, created_at, id, review_note, review_state, revision, status`. Its counted size is therefore marginally understated, and any future export contract must be explicit about which of these fields are part of the public capture schema. `language` is null on 964 of 965 records.
- Approval eligibility is deliberately not inferred; bodies are draft source content.
- **Synthetic chunk counts are NOT host performance proof.** 21 chunks × ≤512 KiB is an offline arithmetic property of one dataset. It demonstrates fit under a proposed bound, not D1/worker latency, not query-plan behavior, and not throughput. The output's own limitations say the same ("not … measured host latency").

## Task 2 — Publication contract as read from source (confidence: high; read-only, no tests executed)

**Two coexisting storage contracts, one serving contract.**

- **v1 whole-artifact** (`packages/edge-core/src/directory/publication.ts`): `sitePublicationArtifactSchema`, `schemaVersion: 1`, `runtimeVersion: 'directory-snapshot-v1'`. Records: `institutions ≤ 48`, `programs ≤ 48`, `cities ≤ 48`, `articles ≤ 48` per collection; templates 1–7; whole artifact JSON ≤ 1 MiB (`publication_too_large`); strict objects; per-record `body` ≤ 60,000 chars for institution/program; article `body` must satisfy `editorialBodySchema`; layout JSON ≤ 200,000 chars with mutable bindings (`binding`, `dataRequest`, `queryConfig`) rejected at schema level.
- **v2 chunked manifest** (`site-publication-chunks.ts`, `site-publication-manifest.ts`): `schemaVersion: 2`, `runtimeVersion: 'directory-chunks-v1'`. Chunk envelope ≤ 512 KiB (`PUBLICATION_CHUNK_BYTES`), 1–48 records per chunk, per-collection input ≤ 20,000 rows, ≤ 2,048 chunks, index ≤ 80,000 entries, catalog sum ≤ 256 MiB, manifest ≤ 8 MiB. Chunks are content-addressed (SHA-256 over `stableStringify`), references carry `{hash, collection, count ≤ 48, bytes}`. **Grep evidence (UTC 2026-10-10T21:22Z): these stores are referenced only by their own two modules and their tests — the public serving path (`site-publication-serving.ts`) uses only the v1 store.** The chunked runtime is storage/admission-ready but not wired into request serving today.
- **Roles:** `sitePageRoles = ['directory', 'institution', 'program', 'city', 'article-index', 'article', 'editorial']` (`configuration.ts` line 66). Artifact and manifest validation both explicitly reject `city` and `editorial` templates (`template_role_not_supported`). Expected queries per role: `article-index → directory.article.list`; `institution/program/article → directory.<role>.detail`; `directory → institution/program lists` when populated; record populations require their template roles (`missing_template_role`).
- **Generic pages are NOT currently supported — verified, not assumed.** There is no `page` role in `sitePageRoles`, no page record collection in either contract, and the routing in `resolveSitePublicationPage` matches only: directory route, blog route (when articles exist), and captured institution/program/article `originalPath`s; anything else is `missing` (404). The sizing dataset's 10 `page`-role documents and the output's own limitation ("Original pages need role support; this sizing does not implement page routes") align with this.
- **Immutable hashes:** `publicationHash` = SHA-256 of `stableStringify(value)`. Reads re-validate: v1 `get()` re-parses and re-hashes, mismatch → `publication_unavailable`; v2 chunk `get()` re-checks collection/count/bytes/hash against the reference; manifest `get()` re-hashes; `loadVerifiedChunk()` requires the reference to be listed in the manifest, re-derives index entries and compares — corrupt/foreign/missing content is refused, never repaired or overwritten (`prepare` inserts with `ON CONFLICT DO NOTHING`; an identical retry is a no-op, a corrupted key cannot be overwritten by `put`).
- **Global validation:** path schema (1–400 chars, leading `/`, no `//`, no `\?#{}\` or control/space chars, no `.`/`..` segments, reserved prefixes `api|frontbase-admin|frontbase-setup|builder|static|console|admin|setup` and `sw.js`/`sitemap.xml` blocked); route-collision check across directory route + blog route + all record paths using decoded, trailing-slash-stripped identity; parent integrity (institution.cityId ∈ cities, program.institutionId ∈ institutions; articles must not have parentId; cities carry neither path nor parentId); prepare additionally refuses any path whose browser-spelled `URL(...).pathname` differs (`publication_route_serialization`) — no silent renaming, nothing persisted on refusal (test asserts settings byte-stable across failed prepares).
- **Review/ownership gates:** `SitePublicationReviewStore` — approve requires all five checks literal-true plus note; review is keyed by content hash, immutable, single (409 on re-approve); `activate` requires the **target's own** review (`publication_review_required`; "neither inherits the current site's approval"); serving refuses any active hash without a valid review (`unavailable`, 503). All routes require authenticated roles `owner|admin|tenant_admin|master_admin|master_admin_root`; tenant isolation enforced per settings row (`tenant_slug = ?`), with cross-tenant read refusal tested.
- **Active pointer and atomic activation/rollback:** `site_publication:active:v1` holds `{schemaVersion: 1, generation ≤ MAX_SAFE_INTEGER, hash}`. `activate(hash, expected)` is CAS: compares the read current pointer to `expected`, generation always advances (current+1), write is `INSERT … DO NOTHING` (first activation) or `UPDATE … WHERE value = <exact prior>`; loser gets `null`/409. Rollback is activation of a prior hash through the same gate (stale rollback cannot clobber a later release — tested). Same-target submission is a generation-stable no-op. A forced same-prior race (barrier in test) yields exactly one winner.
- **Same-generation routing/SEO behavior:** everything public is resolved from the one active artifact: page routing, snapshot queries (`createSnapshotDirectoryQueries(artifact, owner)` — no control/content DB, no mutable draft access; authoring sample paths/filters never used), pagination (param allowlist per role; `page` 1–9999; offset ≤ 10,000; `q` ≤ 100; unknown/duplicate params → 400), sitemap (`capturedSiteSitemap` — captured paths only, XML-escaped, never queries canonical data), and metadata: canonical URL from captured `configuration.site.origin`, `robots: noindex, follow` when any query param is present (paginated/filtered views), OpenGraph from captured row fields, `<html lang>` from row language or site locale, `X-Site-Version: <hash>` and `X-Site-Generation: <n>` on every public response; `Cache-Control: no-store`; `null` return means strictly INACTIVE (missing → 404, invalid → 400, corrupt → 503; missing/corrupt **never** falls back to mutable pages). `cacheKey` = `[owner, hash, path, normalizedParams]` — versions and parameter sets never share cache entries. Host-owned mutable favicon lookups are not used (test forces a throwing favicon resolver and still renders).
- **Approved editorial revisions:** preparation captures articles only via `EditorialApprovalStore.snapshot(id, exact revision, draft, fingerprint)`; a forged/mismatched fingerprint or a tampered stored approval makes preparation fail (`publication_approval_unavailable`); templates must be existing, public, not-yet-published pages whose layout role reference matches and which carry no copied directory configuration; preparation re-checks the live configuration revision before and after capture.
- **Test/mutation coverage observed (read, not executed):** five behavior tests (site-publication 300 lines, chunks, manifest, controls, seo) each paired with a mutation script whose every listed mutant is expected red, covering hash checks, owner isolation, immutable insert, CAS races, review gates, no-fallback-on-corruption, offset guards, SEO escaping/origin, HEAD bodies, and capture-bound metadata.

## Task 3 — Implementation acceptance requirements (requirements only; no schemas edited, no limits raised, no runtime implemented, no architecture declared accepted)

Each requirement cites its source above. The primary session owns the design decision; these are the gates any chunked-publication implementation must demonstrably meet.

1. **Bounded hashed chunks/index (R1).** Every stored unit carries a verified SHA-256 content hash plus `{collection, count, bytes}` descriptor; per-chunk byte bound and ≤48-record cap are enforced at write, at read, and against the descriptor (`site-publication-chunks.ts`; sizing shows 965 docs / 9.9 MB pack into 21 such chunks, largest 523,770 B). Manifest bound checks (8 MiB / 2,048 chunks / 80,000 index entries / 256 MiB catalog / 20,000 per collection) must hold at admission and at load.
2. **Global path/parent validation (R2).** Path admission, reserved-prefix refusal, decoded-identity route uniqueness across the directory route, blog route and every record path, exact browser-spelling serialization refusal, and parent-integrity rules must run as **global admission before any persistence** (manifest `superRefine`; prepare's settings-stable failure behavior is the precedent).
3. **Refusal of missing/corrupt/foreign chunks (R3).** A chunk absent, hash-mismatched, wrong-collection, wrong count/bytes, from another tenant, or inconsistent with the index must be refused with a terminal error — never skipped, repaired, re-fetched from untrusted input, or persisted over (`ON CONFLICT DO NOTHING` semantics; `verify()` must load and re-derive every chunk; index re-derivation equality is the tamper detector for fields the schema alone cannot catch).
4. **No mutable draft datasource reads during public requests (R4).** Public resolution must execute only snapshot-bound queries over the captured generation for the requesting owner; no control/content DB, no draft configuration, no authoring sample params, no host favicon/session lookups; visitor parameters strictly allow-listed and bounded (runtime + mutation labels "snapshot query owner", "public parent query binding", "captured document metadata").
5. **Atomic activation/rollback (R5).** Pointer replacement must remain a single compare-and-swap on the exact prior pointer with monotonically advancing generation; concurrent activations produce exactly one winner; rollback is a normal activation of a prior reviewed hash; a stale `expected` must lose (store `activate` + forced-race test).
6. **Legacy v1 compatibility (R6).** The v1 whole-artifact contract (`schemaVersion: 1`, `directory-snapshot-v1`, 48-per-collection, 1 MiB) must keep parsing, hash-verifying, previewing, reviewing and serving unchanged; pointer `schemaVersion` stays literal 1; existing private API modes (`prepare/preview/read/review`) and their no-leak/error contracts must not regress. **Honest gap to close, not a defect found:** the v2 chunk/manifest stores are not referenced by any serving path today, so "chunked capture serves publicly" is currently unproven end-to-end.
7. **Paginated queries/detail/SEO from the same generation (R7).** List, detail, sitemap and all metadata (canonical, robots, OG, `lang`, `X-Site-Version/Generation`, cache keys) must derive from one immutable pointer read; param-bearing views noindex; no mixed-generation response even if the pointer moves mid-read (coherent-read test in seo suite).
8. **Approved editorial revisions only (R8).** Public articles must trace to an editorial approval at an exact `(id, revision, fingerprint)`; the activation target's own review (all five checks, note, reviewer, timestamp) must exist and be hash-bound; a capture whose review is missing/tampered must serve 503, never stale content.

**Categorization**

- **(1) Demonstrated launch blockers:** none demonstrated by this workstream's evidence. (The v1 serving path is coherent and heavily gated; the sizing dataset fits the proposed chunk bounds. This is not a launch-ready statement — see Skips.)
- **(2) Unresolved evidence requiring follow-up:**
  - F-1: No end-to-end proof that a chunked (v2) capture serves a public request; wiring does not exist yet (grep evidence). Any such implementation must satisfy R1–R8 with tests of equal strength to the existing suites.
  - F-2: Generic pages unsupported: no `page` role, no page records, 404 for non-captured paths. The migrated dataset contains 10 page-role documents; the pilot cannot publish them under the current contract.
  - F-3: Field-retention gap in the sizing normalization (8 dropped keys incl. `cover_url`/`cover_alt`/`review_state` on the recovered document; `language` null on 964/965) must be resolved into an explicit export/capture schema before the 965-document set is captured.
  - F-4: Claims of host performance remain unproven: no load/latency evidence exists for 21-chunk serving under the 512 KiB/48 bound (synthetic counts only).
  - F-5: Test suites and mutation gates were read, not executed (read-only mandate); green status is asserted by repo state, not re-demonstrated here.
- **(3) Owner-deferred improvements:** explicit role/model for pages; documenting the 512 KiB/48 bound as proposal vs production limit; surfacing `canonicalIdentityBytes` newline convention in tooling docs; optional consolidation of the duplicated template-role logic between artifact and manifest validators.

## Skips and access limits

- No builds, installs, test runs, mutation suites, service starts/stops, or any writes outside my two owned locations (per HARD RULES). Test-pass status therefore rests on repo evidence, not fresh execution.
- Production/credential-gated checks (live D1, worker deployment, real host latency) were never in scope for an offline read-only workstream and were not attempted.
- `docs/plans/claude-usa-verification/progress.md` belongs to another workstream; read-only listing only, not modified.
- Did not query any database, unserialize PHP objects, execute recovered PHP, or read users/submissions/secrets; no secret values appear in this report (only credential *locations* such as `PRIVATE_DATASOURCE` fixture names in tests).

## Exact next actions

1. Primary session decides the chunked-runtime design and ownership (this workstream makes no architecture acceptance).
2. Close F-3 (define the exact capture field schema incl. recovered-document extras and language policy) before capturing the 965-document set.
3. Any chunked-serving implementation must land with behavior + mutation tests mirroring R1–R8, then re-run `pnpm -r check`, `pnpm -r build`, and the five publication suites plus their mutation scripts (outside this workstream).
4. Schedule a host-latency measurement wave (separate, credentialed workstream) to convert F-4 into evidence.
5. Owner to decide page-role support (F-2) or explicit exclusion of the 10 pages from pilot scope.

## Re-verification (end of session)

Post-work hashes of all protected inputs and contract sources were re-taken; see `final-hashes.txt` in the evidence directory. Result: all identical to the before-use values; no input changed mid-work; single-snapshot results, no split reporting needed. Repo dirty-file count and my footprint re-checked: only my two owned locations were created/written.

## Evidence index (all UTC-timestamped in `commands.txt`)

`measure-content-chunks.py` (copy), `verify-sizing.py`, `verify-sizing-output.txt`, `run-stdout.txt`, `run-stderr.txt`, `primary-content-chunk-sizing.snapshot.json`, fixture inputs, `before-recovery-doc-identity.txt`, `before-rerun.hash`/`after-rerun.hash`, `commands.txt`, `final-hashes.txt`.
