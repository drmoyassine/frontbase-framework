# Study in USA migration rehearsal & cutover runbook (task 13)

- Task: 13 ("Migration rehearsal and cutover prep — staging rehearsal, runbook; production gated") of
  `docs/plans/frontbase-study-in-usa-translations-execution-20261020.md`. Consumes the task-12 URL
  mapping manifest (`docs/reports/study-in-usa-url-mapping-manifest.md`) and its classifier.
- Produced: 2026-10-22, worktree `.claude/worktrees/study-in-usa-translations` (branch `codex/study-in-usa-translations`).
- Status: **the offline rehearsal steps are EXECUTED and green (§7)**. The staging-live steps are written,
  validated for syntax, and **GATED** on the standing `translation-homepage-mutation` gate debt plus the
  no-deploy constraint of the authoring session (§8). **Every production step is PENDING OWNER AUTHORIZATION
  (§4)** — nothing in this document authorizes a production action.
- Exit criterion being served: rehearsal passes; production cutover packaged as a ready-to-run runbook,
  labeled pending unless authorized.

## 0. How to read this runbook

Every step carries exactly one status label:

- `[EXECUTED 2026-10-22 — PASS]` — run by this task; evidence in §7 (exact commands + exit codes).
- `[READY]` — commands validated as written (syntax/arguments verified offline); execution blocked; the
  exact blocker is stated on the step and summarized in §8.
- `[GATED]` — blocked by a named standing gate/debt that must clear first.
- `[PENDING OWNER AUTHORIZATION]` — production phase; not executable without the owner's explicit go.

Evidence conventions (binding on every runner of this runbook): **pipes mask exit codes**, so every
command is redirected to a log file in `C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/<run-dir>/` and
the exit code is echoed into the same file (`echo "<STEP>_EXIT=$?"`). Raw XML, curl output and scratch
stay in temp — never in the repository. HTTP checks use `curl -sS -o /dev/null -w "…"` so the status line
lands in the log with the exit code.

## 1. Standing boundaries (apply to every step, rehearsal and cutover alike)

1. **Only `study-in-usa.com` is ever touched, and only its public `robots.txt` and sitemap URLs.** Never a
   WordPress admin/auth endpoint, never `wp-*.php`, never a page-content crawl of the source. The Frontbase
   staging host is touched only through its own deployment surface (EasyPanel MCP), its public URLs, and
   its authenticated admin console under an owner-approved administrator session.
2. **Content translation ≠ URL identity.** The task-12 manifest proves URL-tree equivalence only
   (1,266/1,266 proven `/ar/` prefix pairs; ar slugs ARE en slugs; no translated slugs exist on the source).
   Whether page CONTENT is translated is the framework's own translation work (tasks 1–10) measured by the
   coverage endpoint and the exclusion ledger (`docs/translation-exclusions.md`). No step here may claim
   the source site's Arabic content was migrated.
3. **No paid-model fallback, anywhere.** All AI generation goes through the saved OpenRouter free-model
   selection in Settings; the transport hard-fails any non-`:free` model and disables fallbacks. Cutover
   must not add routing.
4. **Keys and secrets never transit chat, documents, or Git.** EasyPanel operations run through the
   `easypanel-main` MCP connector. `SESSION_SECRET` values are never printed; its *provenance*
   (env-set vs boot-generated) is recorded presence-only by the backup tooling.
5. **URL pairing is explicit slug comparison only**: strip the `/ar` path segment, require byte equality
   (near-match rules R1–R4 exist in the classifier and are reported, never silently applied). No positional,
   fuzzy, GUID-based, or LLM-guessed pairing is permitted at any step (binding DECISIONS.md rule).
6. **Raw source XML lives only in temp** (`C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/`), and the
   full classified TSV (356,967 B) stays outside Git with its SHA-256 pinned below.

## 2. Current gate state (2026-10-22) — read before running anything

| # | Gate / debt | State | Consequence for this runbook |
|---|---|---|---|
| 1 | `translation-homepage-mutation` rerun | **DEBT** — the 2026-10-22 background run was killed by the OS memory reaper, not a test failure; not restarted autonomously | A green `pnpm --filter @frontbase/backend test:translation-homepage-mutation` is REQUIRED before **any staging deployment claim** (steps A3+). This task did NOT run it. |
| 2 | Staging `/ar/` re-prepare residual | **ACTIVE** on image `sha256:6645aa0b…` (source `ebc3ffc`) | `/ar/` returns 503 on staging by the strict fence — expected until A5 re-prepares the release under the current identity semantics. Do not treat the 503 as a deploy failure. |
| 3 | Publication scale — was "16-pointer cap unfenced" | **REPLACED 2026-10-22 (owner directive)** — the aggregate 16-pointer ceiling counted page–language publications rather than languages, raced on count-then-insert, and let one corrupt release 503 every unrelated page. Removed on branch: resolution is per `(locale,path)` exact-key lookup, admin listings paginate with per-row corrupt isolation, per-pointer CAS retained. `translation-publication-scale` + 5-fault mutation gate pin 18 concurrent Arabic pages, multi-language per-path switchers, same-pointer races and corrupt-release isolation | The ≤16 operational rule is OBSOLETE once the replacement image deploys to staging (redeploy pending). Until that deploy, the live staging image still runs the interim fence — keep active pointers ≤ 16 on it. |
| 4 | Held translation batch `05b7a503` | Owner hold stands | Do NOT resume, retry, reconcile, or zero it during rehearsal or cutover. |
| 5 | Localized live-list boundaries | Visible refusals shipped (tasks 7/8 reopen; ledger `docs/translation-exclusions.md`) | A serve check that meets `localized_live_table_not_supported`, `localized_interactive_list_not_supported`, or `localized_live_query_beyond_cap` is a DESIGNED boundary, not a failure — record it as evidence. |
| 6 | Task-2 staging coverage pull | Pending since slice C | Folded into step A6. |
| 7 | Production authorization | Not granted | All of §4. |

## 3. Phase A — staging rehearsal

Target environment (from verified baseline): EasyPanel `newpanel.studygram.me`, project `studygram`,
app `usa-frontbase-staging`; public origin `https://studygram-usa-frontbase-staging.fir7vq.easypanel.host/`;
admin console `/frontbase-admin/settings?tab=translations`; datasources
`/frontbase-admin/data-studio/datasources`. Last healthy deploy: action `cmvif07tb00p407qqaihahumx`,
image `sha256:6645aa0b53d1a6b8a9fc693d9bff44f5e28b28e996f6296fb42265691e6e278b` (source `ebc3ffc`).

### A0 — Workstation and gate preflight `[GATED — gate #1 for the deployment claim; the first four commands are runnable now]`

```
cd "C:/Users/drmoy/OneDrive - studygram.me/VsCode/frontbase-framework/.claude/worktrees/study-in-usa-translations"
pnpm -r check                                              # expect exit 0
pnpm -r build                                              # expect exit 0; CF worker < 1024 KB min+gzip; prohibited-client-symbol gate PASS
pnpm --filter @frontbase/backend conformance               # expect 257 CONFORMS / 0 VIOLATES / 77 PRODUCT_VERIFIED_REFUSAL
pnpm --filter @frontbase/backend test:backup-restore       # expect PASS (crown: byte-identical public HTML)
pnpm --filter @frontbase/backend test:translation-homepage-mutation   # expect PASS — this CLEARS gate #1
```

Expected: all green. Record exact numbers (conformance counts, artifact size) in the run log. A staging
deployment claim may be made only after the last command passes green in the same session.

### A1 — Source sitemap capture (fetch/capture) `[EXECUTED in task 12; capture re-verified this rehearsal — see §7 R1]`

Reuse-before-refetch: the 2026-10-22 capture at
`C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022/` is verified byte-exact against the
manifest §2 digests (§7 R1). Re-fetch **only** when drift is suspected (source `lastmod` change, owner
report), into a FRESH temp subdirectory:

```
D=C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-<YYYYMMDD>
mkdir -p "$D" && cd "$D"
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o robots.txt "https://study-in-usa.com/robots.txt"
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o index-source.xml "https://study-in-usa.com/sitemap.xml"
curl -sS --max-time 30 -A "frontbase-sitemap-inventory/1" -o index-ar.xml "https://study-in-usa.com/ar/sitemap.xml"
# children, for LOCALE in "" and "/ar": sitemap-home.xml, sitemap-posts.xml, sitemap-posts.xml?page=2,
# sitemap-custom-posts.xml?type=job_listing — filenames percent-encode ? as %3F and = as %3D:
#   child-source-sitemap-posts.xml%3Fpage%3D2.xml
#   child-source-sitemap-custom-posts.xml%3Ftype%3Djob_listing.xml   (and child-ar-…)
```

Verification gate: all 11 GETs HTTP 200; `sha256sum` every file and compare against the digest table in
manifest §2. Any digest mismatch on robots/index = source drift → re-classify (A2) before anything else.
Scope guard: nothing beyond `robots.txt` and sitemap URLs of this one host is ever fetched.

### A2 — Classify and reconcile the URL mapping `[EXECUTED 2026-10-22 — PASS — see §7 R2/R2b/R3]`

From the repository root (classifier is offline and deterministic; it never fetches):

```
node scripts/migration/study-in-usa-url-classifier.mjs \
  C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/sitemap-20261022 \
  C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/<run-dir> \
  --self-check
```

Expected outcome (rehearsal gate):
- `totals` = sourceUrls 1,266 / arUrls 1,266 / classifiedRows 1,266;
- `countsArToEn` = proven 1,266, candidate 0, ambiguous 0, missing 0, conflicting 0; `countsEnToAr.enOnly` = 0;
- all seven `integrity` pre-checks = 0;
- `tsvSha256` = `757f8581de7d60ebfc000ffcc373b8faae3b1b3ed8ce637bfeee4d17d9dc6be9` (356,967-byte listing;
  1,267 lines) — identical inputs are byte-identical outputs; `--self-check` must pass on every run;
- `cmp` of the emitted aggregates against the committed
  `docs/reports/study-in-usa-url-mapping-aggregates.json` = identical.

Drift handling (binding): if ANY non-proven class or integrity counter is non-zero → **STOP**. Record the
classes, do not repair by fuzzy/positional means (boundary 5), and escalate the diff to the owner. A
non-zero candidate count may proceed only after each rule hit is reviewed against manifest §4;
ambiguous / missing / conflicting / en-only non-zero halts the rehearsal.

### A3 — Staging deployment `[GATED — blockers: gate #1 (A0 last command) must be green; this authoring session was barred from deploying]`

Via the `easypanel-main` MCP connector only (keys stay in the connector; none in chat/docs/Git):
1. `git archive` the committed branch tip into a clean tar (Windows `git archive`/msys extraction mangles
   text blobs — provenance checks MUST be container-side, per the receipts' blob-hash-aggregate method).
2. Stage the archive inside the app's own `usa-staging-state` volume, `uploadAppCodeArchive`, then
   `deployAppService` (no forceRebuild; service config, env vars, domains, mounts untouched), poll `getAction`.
3. Record: action id, resulting image sha256, build-gate lines.

Expected: "### Success"; build-time gates green (docker-gate PASS, artifact inventory complete, no
prohibited symbols). Prior reference outcome: action `cmvif07tb00p407qqaihahumx` → image `6645aa0b…`.

### A4 — Post-deploy serve verification `[READY — blocked by A3]`

```
B=https://studygram-usa-frontbase-staging.fir7vq.easypanel.host
curl -sS -o /dev/null -w "root %{http_code}\n" "$B"                          # expect 200
curl -sSI "$B" | grep -i x-site-generation                                   # expect 21 (unchanged by code deploys)
curl -sSI "$B" | grep -i x-robots-tag                                        # expect: noindex, nofollow
curl -sS -o /dev/null -w "health %{http_code}\n" "$B/api/console/health"     # expect 200
curl -sS -o /dev/null -w "ar %{http_code}\n" "$B/ar/"                        # expect 503 UNTIL A5 completes (strict fence by design — gate #2)
```

Expected: first four green; `/ar/` 503 pre-A5 is the correct, designed behavior (no untranslated false
fallback). Evidence: status lines + headers into the run log.

### A5 — `/ar/` re-prepare through the native console (release re-identity) `[READY — blocked by A3/A4]`

Owner-approved administrator session (credentials never recorded). Console:
`/frontbase-admin/settings?tab=translations`.
1. Review: the workspace re-captures and lists units under the CURRENT identity semantics (record-keyed
   fields, composed-ariaLabel identity). Text reuse is expected — prior approved text re-binds by unit
   identity with zero AI calls wherever source text is unchanged.
2. Live-bound pages force the per-unit policy (`live_release_per_unit_required` otherwise) — accept the
   per-unit policy; strict prepare is refused by design for live-bound surfaces.
3. Prepare → publish via the CAS publish control (expected pointer from the Published-languages panel).
4. Confirm ≤16 active `(locale,path)` pointers in the Published-languages panel (gate #3 operational rule).
5. Re-run the A4 checks; `/ar/` must now return **200** with: `Content-Language: ar`, `dir="rtl"` on the
   document element, localized canonical + reciprocal `hreflang` alternates, `og:locale` matching the
   content language.

Rollback within A5: the Prepared-versions panel publishes an older immutable release via the same CAS —
never by editing pointers by hand.

Optional bounded generation (only if the rehearsal needs NEW units): a small multi-unit batch through
TranslationBatchForm under the saved **free** model (boundary 3); approve-content-transmission explicitly;
uncertain/failed items stay excluded — never auto-retried.

### A6 — Coverage pull (task-2 residual) `[READY — blocked by A3]`

Administrator session; paginate the read-only inventory:

```
GET /api/project/translation-batches/coverage/                    (then ?surfacesAfter=…&recordsAfter=… cursors)
```

Expected: complete enumeration from the chunk index with stable refs, engine fingerprints, translatability
decisions, and window-vs-total list evidence (the "only 16 institutions" render window vs the real total).
Record: per-collection totals, exclusion rollups, `terminology.approvedStore` state. This produces the
honest CONTENT coverage number for the rehearsal report (boundary 2 — this is the number that says what
is translated, as opposed to what is mapped).

### A7 — URL-route reconciliation against the manifest `[READY — blocked by A3]`

Method (explicit-comparison only): enumerate the staging publication's route inventory (coverage surfaces +
per-path locale registries + the per-page sitemap output of the STAGING host itself — never the source
site's pages). For every staging route R corresponding to a source URL:
- English R must be byte-equal to an English URL in the proven set, and its `/ar`-prefixed form must be the
  Arabic counterpart (`exact-after-ar-strip`). The source's pure prefix mirror (ar slugs ARE en slugs)
  means any invented/translated slug on the Frontbase side is a defect.
- Any staging route NOT in the proven 1,266-URL set must be an explicit, reviewed addition — recorded as
  such with its reviewer; there is no silent third category.
- Spot-check serving (bounded sample, e.g. 20 routes stratified across home / posts / posts-p2 /
  job_listing) with the A4 curl pattern; record the served-coverage fraction vs the 1,266-URL inventory.
  Sitemap presence on the source ≠ serve evidence anywhere; only staging serve checks count as serve evidence.

### A8 — Staging-state backup/restore drill (rollback rehearsal, task-11 engine) `[EXECUTED — PASS (2026-10-22); the walk caught a pre-existing live-data verifier defect, fixed in fc7d484]`

Tool: `pnpm --filter @frontbase/backend ops:selfhost -- <command>` (contract: `docs/backup-restore.md`).
1. Confirm the staging state-DB URL and runner family by inspecting the app (EasyPanel MCP; the state
   volume is `usa-staging-state`). SQLite-family (`file:`/libsql) uses export/verify/restore below; a D1
   runner uses the platform export/import + `integrity` path instead.
2. Export: `ops:selfhost export --url <stagingStateDbUrl> --out <temp>/staging-backup.json` — record the
   printed SESSION_SECRET provenance line (presence only, never a value) and the sidecar SHA-256.
3. Transfer check: `ops:selfhost verify-backup --backup <temp>/staging-backup.json` on the consuming side —
   offline SHA-256 + structure; a tampered payload is refused before any DB is opened.
4. Restore into a FRESH target: `ops:selfhost restore --url <freshStateDbUrl> --backup <temp>/staging-backup.json --confirm-empty-target`
   — review every integrity-walk check; evidence file `<payload>.restore.json`. Refusals
   (`restore_target_not_empty`, `restore_backup_foreign_schema`, `restore_target_not_transactional`) are
   safety fences, not errors to work around.
5. Crown comparison: serve `/` and `/ar/` from a deployment bound to the restored target and byte-compare
   public HTML against the pre-restore serve (the suite's crown assertion, now against real staging state).
6. Repoint only after every check is green; **never restore over a live state DB**.

SESSION_SECRET restore-blocking rules (verbatim from the contract — blocking):
- Export with `SESSION_SECRET` set → restore with the SAME env value.
- Export without `SESSION_SECRET` (boot-generated; secret persisted in the state DB) → restore with NO
  overriding env var. Setting a NEW env secret at restore permanently loses every encrypted credential
  (secret variables, datasource/edge-resource/storage configs, edge API key secrets, `app_user_session:*`).
- The export records provenance presence-only (`secretProvenance.envSecretPresent` / `.bootSecretRowPresent`);
  the post-restore integrity walk reconciles both.

Boundary: a state-DB restore does NOT cover the tenant-owned external Supabase (translations schema,
editorial bodies, `fb_live_*` views) — that project's own tooling owns them.

Executed evidence (2026-10-22, staging container, live `file:/data/usa-staging.db`; full chain in the
execution ledger and `docs/backup-restore.md`): state-DB URL/runner confirmed (step 1); export
49,368,866 B, sidecar SHA-256 verified (steps 2–3); fresh-target restore transactional, evidence file
written (step 4); the post-restore integrity walk FAILED on 6 publication chunks — reproduced on the
LIVE DB, proving a pre-existing verifier defect, not restore damage. Root cause: `store.get()` measured
integrity on the schema-transformed parse output; the nullable defaults later added to the
cities/institutions/programs record schemas changed every pre-default chunk's serialization on re-parse.
Fixed in `fc7d484` (integrity measured on the stored serialization; mutation gate 4/4 RED-proven) and
deployed to staging (image `sha256:5cbdfe2a…`, action `cmvj05ufl00rw07qq9fjsc1u6`): the integrity walk
now passes on BOTH the live DB and the restored drill copy (29/29 chunks). Steps 5–6 (crown
serve-comparison and repoint) were not needed — the restore copy was a drill artifact, never repointed;
the live DB was never modified.

### A9 — Evidence recording `[EXECUTED as convention — see §7]`

Every step appends to `C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/<run-dir>/`:
`<STEP>-<name>.log` with UTC timestamp, exact command, output, and `<STEP>_EXIT=<code>`. §7 is the durable
summary; raw outputs stay in temp.

## 4. Phase B — production cutover — EVERY STEP BELOW IS PENDING OWNER AUTHORIZATION

Nothing here is executable until the owner authorizes the cutover explicitly. Authorization must be
recorded as an accepted decision (execution ledger + `docs/history/DECISIONS.md` per the AGENTS.md
contract) — an agent chat is not authorization.

### B0 — Pre-cutover acceptance checklist `[PENDING OWNER AUTHORIZATION]`

All must be true and evidenced before B1:
1. Phase A complete with green evidence (A0–A8), including the A2 drift gate on a fresh capture.
2. Gate #1 cleared (translation-homepage-mutation green in the deploying session) and gate #2 resolved
   (`/ar/` 200 post-re-prepare on staging).
3. Gate #3: the scalable publication registry (no aggregate pointer cap; per-pointer CAS; per-row
   corrupt isolation) is deployed to staging, evidenced by `translation-publication-scale` + its
   mutation gate and the staging redeploy claim. The former "fence landed or ≤16 accepted in
   writing" alternative is retired — the owner rejected 16 as a product limit (2026-10-22).
4. Content coverage report (A6) reviewed by the owner; exclusion ledger (`docs/translation-exclusions.md`)
   accepted as the launch content boundary; served-coverage fraction from A7 reported.
5. Task 7/8 reopen state understood by the owner (live-list localization scope as shipped).
6. Held batch `05b7a503` resolved or its hold reaffirmed by the owner.
7. Real D1 export drill / Supabase re-drill (owner-credential residuals of task 11) completed, or the
   production runner is SQLite-family so the A8 drill applies directly.
8. Rollback rehearsed: A8 evidence complete; production backup cadence and retention agreed.

### B1 — Freeze and full backup `[PENDING OWNER AUTHORIZATION]`

1. Announce the content freeze (owner decision on window).
2. State DB: `ops:selfhost export` against the PRODUCTION state DB (never restore over it afterwards);
   ship payload + `.manifest.json` sidecar off-host; `verify-backup` on the destination; record the
   SESSION_SECRET provenance line.
3. Tenant external Supabase (translations schema, editorial bodies, `fb_live_*`): backup via that
   project's own tooling — NOT covered by the state backup (contract boundary).
4. Record the platform wiring the state DB does not carry (D1 `database_id`, Hyperdrive bindings,
   custom-domain DNS/routes, secrets set via the platform) as the repoint/rollback inventory.

### B2 — Production deployment `[PENDING OWNER AUTHORIZATION]`

Same recipe as A3 (clean `git archive` of the authorized commit → container-side provenance aggregate →
`uploadAppCodeArchive` → `deployAppService` → `getAction`), escalated: the deployed commit must be the one
the owner authorized, verified by the container-side tree hash before deploy.

### B3 — Production serve verification `[PENDING OWNER AUTHORIZATION]`

The A4 checks against the production origin, plus A5's post-re-prepare `/ar/` gate (the production release
will need re-preparation under current identity semantics on first deploy of this branch family — plan for
it), plus the A7 route reconciliation at an agreed sample size, plus the gate-#3 pointer count check
(≤16 or fenced).

### B4 — Repoint and post-cutover window `[PENDING OWNER AUTHORIZATION]`

DNS/route repoint per the B1 inventory; monitoring window with the A4 checks on a schedule agreed by the
owner. The source WordPress site is NOT modified or decommissioned by this runbook (separate owner decision).

### Production rollback runbook (anchored to `docs/backup-restore.md`) `[PENDING OWNER AUTHORIZATION]`

Trigger criteria (owner-agreed): serve verification red after B3, integrity-walk failure, or owner abort.
Sequence — **never restore over the live state DB; always fresh target → restore → verify → repoint**:
1. Provision a FRESH state DB target.
2. `ops:selfhost verify-backup --backup <lastVerifiedBackup.json>` (offline refusal of tampered payloads).
3. `ops:selfhost restore --url <freshStateDbUrl> --backup <lastVerifiedBackup.json> --confirm-empty-target`
   — review EVERY integrity-walk check; a failed walk exits non-zero: **do not repoint traffic**.
4. Repoint the deployment to the restored target (platform wiring per the B1 inventory: D1 database_id /
   Hyperdrive bindings / DNS / platform-set secrets) and restart.
5. SESSION_SECRET rules (§A8, blocking) apply to every restore. Schema rollback is restore-from-backup —
   there are no down-migrations, so an engine rollback deploys the older engine against a backup taken
   under that version.
6. Tenant external Supabase rollback uses that project's own restore tooling, separately.

## 5. Approval gate summary

| Gate | Blocks | Clearing condition |
|---|---|---|
| translation-homepage-mutation green rerun | Any staging deployment claim (A3+) | `pnpm --filter @frontbase/backend test:translation-homepage-mutation` PASS in the deploying session |
| Staging access/deploy action | A3–A8 execution | Gate above + an authorized deployment session (this authoring session was barred) |
| Production cutover | All of §4 | Explicit owner authorization, recorded as an accepted decision |
| Owner-supplied credentials | Real D1 export drill, Supabase re-drill, live-provider batch validation | Owner action via the platform; never requested or stored in chat/docs/Git |

## 6. Boundaries restated (what this runbook does NOT claim)

- URL identity is proven (task 12); content translation coverage is measured, not assumed (A6/A7 numbers).
- Only `study-in-usa.com` robots/sitemaps are ever fetched; the source's WordPress admin/auth endpoints are
  never touched; the legacy `scripts/migration/*.py` source-DB tools are out of scope for this rehearsal.
- No paid-model routing exists or may be introduced.
- Secrets never transit chat, documents, or Git; raw XML and scratch stay in temp; the full classified TSV
  stays outside Git (SHA-256 pinned in the manifest §8).
- No CF-22 reactivation, no release-scope change, and no "generally available" claim follows from any step here.

## 7. Executed rehearsal evidence (2026-10-22)

All runs by this task, offline only: no deployment, no staging/production contact, no network fetch (the
task-12 temp capture was REUSED, not re-fetched), no secrets involved. Logs retained at
`C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/rehearsal-20261022/`.

| Step | Command (abridged) | Result | Exit |
|---|---|---|---|
| R1 capture digests | `sha256sum` over the 11 captured files in `…/sitemap-20261022/` | 11/11 SHA-256 values byte-match manifest §2 (the capture is exactly the classified input) | 0 |
| R2 classify (full + `--self-check`) | `node scripts/migration/study-in-usa-url-classifier.mjs …/sitemap-20261022 …/rehearsal-20261022/run1 --self-check` | totals 1,266/1,266/1,266; proven 1,266; candidate/ambiguous/missing/conflicting 0; enOnly 0; all 7 integrity checks 0; `tsvSha256=757f8581de7d60ebfc000ffcc373b8faae3b1b3ed8ce637bfeee4d17d9dc6be9` (356,967 B); self-check green | 0 |
| R2b artifact identity | `cmp` run1 aggregates vs committed `docs/reports/study-in-usa-url-mapping-aggregates.json`; run1 vs run2 aggregates; run1 TSV vs retained `…/sitemap-20261022/final/…tsv`; `wc -l` TSV | All byte-identical (exit 0 × 3); TSV 1,267 lines (header + 1,266) | 0 |
| R3 classify (aggregates-only) | `node scripts/migration/study-in-usa-url-classifier.mjs …/sitemap-20261022 …/rehearsal-20261022/run2 --aggregates-only` | Same counts and digest; output dir receives the aggregates artifact only | 0 |
| R4 pilot-ops offline rehearsal gate | `node scripts/wordpress-pilot-ops/rehearsal.test.mjs` | "rehearsal gate passed: 15 checks" — full synthetic roundtrip (seed objects → probe secrets → backup → verify → fresh restore → check-restored → correct/wrong-key cipher probes) plus fail-closed behaviors (tampered snapshot, unconfirmed restore, non-empty target, manifest overwrite, corrupted object) plus manifest sanitation | 0 |
| R5 selfhost-ops refusal dry-runs | `node packages/backend/scripts/selfhost-ops.mjs` (no args); `… verify-backup --backup <synthetic payload with mismatching sidecar SHA-256>` (payload crafted in temp) | Usage line printed (exit 2); tamper refusal names the digest mismatch: "the backup is corrupt or was modified" (exit 2) | 2 (expected refusal) |

R5 note: exit 2 IS the passing outcome for both refusal probes — the CLI fails closed as documented.
No state DB was opened by R5 (`verify-backup` is offline by contract).

## 8. Steps not executed — exact blockers

| Step | Blocker (exact) |
|---|---|
| A1 fresh re-fetch | Not needed — task-12 capture re-verified byte-exact (§7 R1); re-fetch deliberately deferred per reuse-before-refetch; recipe ready |
| A0 gate rerun (`test:translation-homepage-mutation`) | ~~Standing gate debt~~ **CLEARED 2026-10-22**: foreground rerun in a quiet window → 19/19 faults caught, exit 0 (ledger-recorded before the first staging deployment claim). |
| A3 staging deployment | ~~Gate #1 + barred session~~ **EXECUTED 2026-10-22** under the directive-(d) bounded-claim protocol: action `cmviqkfp900pq07qqcvgoc8l6` → image `sha256:27afca15…` from `026f355`; then the A8-fix deploy, action `cmvj05ufl00rw07qq9fjsc1u6` → image `sha256:5cbdfe2a…` from `fc7d484`. |
| A4 post-deploy serve checks | **EXECUTED after each deploy**: `/` 200, `/frontbase-admin/` 200, `/ar/` 503 = the designed strict-fence residual (A5 pending), NOT a failure. |
| A5 `/ar/` re-prepare | **STILL GATED**: requires an owner-approved administrator console session (A5). |
| A6 coverage pull | Depends on A5; administrator session |
| A7 URL-route reconciliation (live portion) | Offline method/tolerance finalized in the step text; live portion needs the administrator session |
| A8 staging backup/restore drill | ~~Depends on A3~~ **EXECUTED 2026-10-22 — PASS with finding** (see the executed evidence under the A8 step; verifier defect fixed in `fc7d484`, walk green on live + restored DBs). |
| B0–B4 + production rollback | PENDING OWNER AUTHORIZATION (no authorization exists) |

## 9. Decisions the owner must make

1. Authorize (or withhold) production cutover once Phase A evidence exists; record as an accepted decision.
2. ~~Accept the ≤16-pointer operational cap explicitly, or direct the write-time fence + console
   Published-languages resilience backlog item to land before cutover (recommended: land it — the failure
   mode is silent until it is site-wide).~~ **RESOLVED 2026-10-22:** the write-time fence + console
   resilience LANDED (commit `1f1da1b`) and are staging-verified (image `sha256:8d6b4599…`, action
   `cmvj0ljcw00st07qq4xbib3o8`; deployed-dist suite exit 0). Over-cap pointers are now refused at
   prepare/activation with 409 `locale_pointer_cap_exceeded{cap,count}`, and legacy over-cap states are
   console-recoverable. The remaining owner choice is only whether 16 stays the accepted operational
   limit.
3. Provide/withhold owner-gated credentials for the D1 export drill, Supabase re-drill, and live-provider
   batch validation (via the platform, never via chat).
4. Decide the fate of held batch `05b7a503` (the hold stands until then).
5. Confirm the production runner family so B1/B-rollback uses the matching certified path.
