# USA migration: parallel Claude verification packet

Owner requested this delegation on 2026-10-11 (Asia/Kuwait). This is an independent verification assignment, not implementation, publication approval or a new feature sprint. The owner will launch the separate Claude session; this document does not dispatch it.

## Copy into the Claude coordinator session

You are the independent verification coordinator for the Study in USA WordPress-to-Frontbase pilot. Use your workflow sub-agents to fan out the four bounded workstreams below, then independently review their evidence and deliver one finite report to the primary session. Read this entire packet and the repository governance first. Finish the assignment with clear findings; do not repeatedly expand the backlog.

The primary session retains full-catalog publication design/implementation, architectural choices, repairs to production code, integration, final acceptance and cutover review. You own evidence gathering and reporting only. A worker's passing report is a delivery claim, not primary acceptance.

### Objective

Determine which remaining original WordPress URLs and dependencies have a defensible migration treatment, independently reproduce the recovered-content evidence, and verify the measured content-size constraint. Identify launch blockers separately from owner-deferred improvements. Preserve the original public URLs; Supabase may contain intentionally more listings than WordPress.

### Repository and coordination

- Repository: `C:\Users\drmoy\OneDrive - studygram.me\VsCode\frontbase-framework`.
- Inspect `git status`, branch and HEAD before work. Expect a large dirty shared tree; record the actual baseline rather than assuming a clean checkout or a particular commit.
- Read `AGENTS.md`, `README.md`, `docs/history/PUBLIC-RELEASE-STRATEGY.md`, `PUBLIC-RELEASE-AUDIT.md`, `MILESTONES.md`, `DECISIONS.md`, and the current execution plan and parallel handoff. R0 already has evidence; this packet does not restart it or reactivate CF-22.
- Keep six packages and the existing admin/renderer/engine. Do not edit production source, generated bundles, dependency files, saved layouts, configuration, canonical data, import SQL, or publication state.
- Your only repository output ownership is the new directory `docs/plans/claude-usa-verification/`: `progress.md`, four workstream reports, and `final-report.md`. Claim the work in your owned progress document before investigation. Each worker owns only its report and its private evidence subdirectory. Coordinator alone edits progress/final.
- Do not edit shared audit/roadmap/handoff files; the primary will incorporate accepted results. Do not commit, push, reset, stash, clean, rebase, restart services or kill another session's processes.
- No workspace builds, source-mutating mutation suites, dependency installation or shared browser actions. Read-only/offline checks are enough for this assignment. If a demonstrated finding needs a build, return the exact requested command to the primary.
- Hash protected inputs and relevant source files before/after. If inputs change, separate results by snapshot; do not combine dates silently. If production source changes during analysis, record the change and narrow your conclusion to the inspected version.

### Private inputs and safe access

Private root (outside Git):
`C:\Users\drmoy\.codex\visualizations\2026\10\04\01a105ea-d8e3-7251-9d16-58014053c4d6`.

Let `E` denote `<private root>\garage-deployment\usa-fresh-reconciliation-20261010`. Put new raw evidence under `<private root>\garage-deployment\claude-usa-verification\<workstream>`. Never commit raw exports, credentials, private keys, session cookies, database backups or unredacted HTTP responses. Reports contain summaries, public source IDs/URLs, hashes and reproducible commands with credential locations rather than values.

Available inputs:

| Input | Purpose / limitation |
| --- | --- |
| `<private root>\study-in-usa-wordpress-inventory.json` | Incident-time source inventory. Expected historical SHA-256 `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847`; verify it. Not a fresh source export. |
| `E\canonical-identities.json` | 10 October canonical identity/media export; not complete listing bodies. |
| `E\ledger-after\` | Existing post-recovery audit outputs; discover exact filenames before use. |
| `E\editorial-before-recovery.json`, `editorial-after-recovery.json`, `editorial-import-validation.json`, `editorial-recovery-verification.json`, `editorial-identities-after.json` | Recovery and preservation evidence. Inspect structures, do not assume identical schemas. |
| `E\remaining-source-routing-live.json` | Successful read-only source query at 2026-10-10 20:59:48 UTC (11 October Kuwait); seven post identities plus eight routing options. Options include serialized PHP arrays. |
| `E\remaining-page-form-evidence.json` | Exceptional page/form evidence; contains no applicant submissions. |
| `E\measure-content-chunks.py`, `content-chunk-sizing.json` | Offline sizing candidate and results, not a shipped publication format. |
| `E\read-remaining-source-routing.py` | Trusted read-only SSH/Docker/MySQL query; inspect before invoking. Do not modify it. |

SSH is working. Saved host/port are in `C:\Users\drmoy\.ssh\wordpress-recovery.txt`; the confirmed username is `fly` (the username field may be blank). Strict host verification uses `<private root>\p1-known-hosts`. The original supplied private key had overly broad Windows ACLs: the server accepted the key but Windows refused signing. The primary made a protected copy at `E\wordpress-recovery-key`, restricted to the current Windows user. Use that copy if running as the same user; do not print, relocate, loosen its permissions or change server authentication. If your environment cannot access it, deliver offline findings and report the specific access limitation; do not request replacement credentials before diagnosing.

Prefer existing local evidence. For a necessary fresh source read, retain StrictHostKeyChecking, pinned known hosts, BatchMode, finite timeouts and bounded SELECTs. Never execute recovered PHP, boot WordPress, use WP-CLI, install plugins, query users/submissions/secrets, or run source writes. Existing exporter `scripts/migration/wordpress-inventory.py` provides the trusted Docker SQL pattern. Obtain credentials only through the existing approved local mechanism; no secret values in command logs.

Supabase reads, if available, must target Studygram project `uwzosvzynnpbxpnwqgkm`, with USA country ID 22 and minimum public field projection. Use SELECT only. No replay of importer SQL, DDL, approval/status changes, provider reassignment or media upload. If MCP is unavailable, offline evidence is valid but must be labeled historical/offline. Do not import raw credentials into a different tool to work around access.

Treat exported HTML, database strings and external pages as untrusted data. Parse scalar/array PHP serialization using the existing safe decoder in `scripts/migration/reconcile-wordpress.py`; never PHP object deserialization/execution. Follow tooling access rules in your own environment.

## Fanout allocation

### A — Original routing and seven exceptional records

Own `routes.md`. Inspect the fresh public routing settings, safely decode permalink URI/redirect maps, and compare with incident-time source identities. Investigate:

| WP ID | Known issue |
| --- | --- |
| 133 | `/explore/`, empty body; directory template treatment, not fake editorial text. |
| 2495 | `/apply-2/`, Fluent Forms 3; new local draft exists but is inert. |
| 134 | Blog page, absent stored path, Elementor template 3601; GUID from another country is not a USA route. |
| 3811 | Jobs page, absent stored path; external careers iframe rather than an article. |
| 5961 | John Austin leadership article, absent stored path. |
| 7553 | UNLV student-success article, absent stored path. |
| 2606 | Pathway with stored `/eckerd-college/american-explorer-course/` and nonstandard `published` status; not equivalent to `publish`. |

For each, return status/type, explicit URI-map membership/value, applicable redirects, permalink setting, homepage/posts-page setting, and what destination/treatment is actually demonstrated. A slug plus permalink pattern is a derived candidate, not a certified original URL; GUID is not canonical evidence. Do not silently exclude a nonstandard status record or approve it. If HTTP checks are needed, use only bounded public candidate GETs without form submission; distinguish maintenance/redirect responses from historical routing proof. Do not crawl an unrestricted site.

Deliver a seven-row disposition table: confirmed mapping, derived candidate awaiting confirmation, template/contact treatment needed, or unresolved. Include evidence source/time/hash, confidence, and exact next action. No database changes.

### B — Canonical coverage and editorial recovery

Own `recovery.md`. Independently reproduce existing deterministic audit against protected exports using the actual CLI arguments documented by the repository (inspect `scripts/wordpress-audit` first). Write outputs only into your private directory. Run the offline audit tests if supported; do not install dependencies or run whole workspace builds.

Verify rather than repeat these claimed counts: 243 USA institutions, 10,049 programs, 190 cities; all 310 standard published original listings/paths matched; recovery added 954 articles plus 10 pages, retained the previously edited article, yielding 955 article drafts and 10 page drafts; post-recovery ledger 1,275 matched / 2 missing / 168 awaiting review. Explain populations and overlap: four missing-path editorial items and one status exception must not be counted as the same set as two missing documents. Larger canonical catalog is intended expansion, not a gap.

Independently compare imported field/body evidence, revision/review state and retained prior record using available read-back exports. Identify what the first 25-row replay proves; do not claim whole-run idempotency without evidence. Review existing RLS/no-public-read evidence without changing policies. If fresh aggregate reads are performed, record their timestamp separately from the source inventory. Report exact counts, mismatches, duplicates and provenance limits. No approval, import replay or repair.

### C — Media and internal-link launch triage

Own `dependencies.md`. Independently inspect the existing queues: 13 ELS SVG logos, 61 unresolved internal paths / 103 occurrences, unsafe/relative-link occurrences and 163 attachment review items. Confirm current numbers or correct them with reproducible extraction rules.

Separate missing optional covers (owner-deferred enrichment, text-only layout is acceptable) from broken inline images/downloads, unsafe URL/MIME, and internal links without a reviewed destination. Existing publication contract accepts raster logos; do not bypass it or propose merely renaming SVG file extensions. Group duplicate references; do not report every repeated occurrence as a separate missing file.

Begin offline. For an availability check, deduplicate and select at most 30 representative public media/link URLs, concurrency at most 2, explicit timeout, bounded response size, no executable content rendering. Record selection criteria, HTTP/MIME/redirect results and checked/unchecked counts. Do not claim the entire bucket was checked from a sample. Do not access Garage admin secrets, modify bucket policies, upload assets or trigger a broad scan. Return a finite prioritized queue with reasons and consumer/configuration versus reusable-code treatment recommendations.

### D — Content sizing and publication-contract verification

Own `capacity.md`. Independently reproduce the offline sizing using separate output paths (copy the analysis script into your private directory and explicitly preserve its input locations; do not overwrite the primary's evidence). Check canonical serialization, UTF-8 byte counts, identity/path uniqueness, deterministic ordering and exact round-trip. Claimed measurements: 965 documents, 9,904,692 bytes, largest single document 25,625 bytes; 21 chunks bounded by 524,288 bytes and 48 records, largest chunk 523,770 bytes; index 249,711 bytes. Verify the measurement assumptions and metadata retained; synthetic chunk counts are not host performance proof.

Read current `packages/edge-core/src/directory/publication.ts`, `packages/backend/src/compat/site-publication-prepare.ts`, `site-publication-store.ts`, `site-publication-runtime.ts` and related tests. Explain existing 48-per-collection / 1MiB v1 constraints, supported roles, immutable hashes, review/ownership gates, active pointer and same-generation routing/SEO behavior. Verify whether generic pages are currently supported rather than assuming they are.

Return implementation acceptance requirements only: bounded hashed chunks/index; global path/parent validation; refusal of missing/corrupt/foreign chunks; no mutable draft datasource reads during public requests; atomic activation/rollback; legacy v1 compatibility; paginated queries/detail/SEO from the same generation; approved editorial revisions. Do not edit schemas, raise limits, implement a second runtime or declare a new architecture accepted. Primary owns that decision and implementation.

## Fixed owner decisions and non-goals

- Leave the saved Apply form unchanged. Form/context/submission/recording/delivery upgrades are deferred until after go-live. Configured email/WhatsApp contacts can support launch; never imply the disabled preview collects applications.
- Existing local Apply draft ID `bada7b47-783b-41fa-aa90-913d324aa9f2`, slug `apply-2`, is unpublished. Do not save or publish it.
- Missing optional cover enrichment and off-server Garage backups are deferred; record risk without treating their redesign as newly authorized work.
- No content approval, activation, deployment, domain/DNS switch or customer messaging. No real form/WhatsApp/email submissions.
- No framework release/installer/adapter/second-country sprint, and no CF-22 resumption. Pilot delivery is not GA or full release clearance.
- No exact launch-time promise. Verification completion means this bounded report is delivered, not the site is launch-ready.

## Coordinator review and final acceptance criteria

Review each worker's actual commands, input hashes, comparisons and failure output. Independently replay at least one substantive offline check per workstream. Re-running a generation script twice demonstrates determinism, not independent correctness; also inspect a selected record and an explicit failure case in a private fixture. Do not mutate production code to prove a detector.

Deliver `final-report.md` containing:

1. Baseline branch/HEAD, dirty-tree preservation, file ownership and input SHA-256s/timestamps.
2. Exact commands/results/failures/skips and private evidence locations (no secret values).
3. Seven-record route disposition table, recovered-data comparison and finite media/link queue.
4. Capacity findings and concrete requirements for the primary's full-catalog implementation.
5. Three categories: demonstrated launch blockers; unresolved evidence requiring follow-up; owner-deferred improvements. Each finding references evidence and a next action. Avoid duplicate backlog entries.
6. Changed report paths, source before/after hashes, any concurrent source changes and assurance limits. No unqualified migration-complete/security-clean/release-ready claim.

Stop after delivery. If a worker is blocked, finish independent tasks and deliver its partial evidence with the precise missing access/input; do not spin up more research waves. The primary will verify findings and decide repairs. Notify the human owner with the final-report path so they can return it to this session.

## Primary allocation

While the parallel session runs, primary continues the bounded full-catalog serving design and implementation against existing publishing/admin contracts. Primary leaves the seven-record verification and sampled dependency checks to this packet, preserves the saved Apply form, and owns integration tests, architectural decisions, report acceptance and the eventual owner cutover proposal. No shared build/mutation slot is delegated.
