# P1-C external dependency delivery candidate

**2026-10-10; Wave 1 packet report for `docs/plans/wordpress-pilot-two-session-waves.md`. Evidence only — no dependency adoption, fork creation, package publication, or maintenance decision. Provenance wording corrected 2026-10-10 per primary review (see (a)).** Extends the [backend compatibility matrix](../history/PUBLIC-RELEASE-R1-BACKEND-COMPAT-EXPERIMENT.md) and the [declaration repair proposal](../history/PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md). Baseline: `codex/wordpress-pilot` at `d3cd122`, dirty tree with primary's uncommitted work preserved (untouched).

## Claimed scope

Owned files created: `scripts/parallel-wave1-types-repair.mjs` (driver), five synthetic fixtures under `scripts/parallel-wave1-types/` (no private data), and this report. Everything else read-only; no manifest, lockfile, package, or `scripts/release-backend-compat-experiment.mjs` edit; no workspace build; all installs in OS temp.

## One-command repro

```
pnpm exec node scripts/parallel-wave1-types-repair.mjs C:/Users/drmoy/AppData/Local/Temp/frontbase-p1c --online
pnpm exec node scripts/parallel-wave1-types-repair.mjs C:/Users/drmoy/AppData/Local/Temp/frontbase-p1c            # offline repeat, same command minus --online
```

The driver auto-discovers the retained successful proof `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-consumer-bssJsT` (all six archive SHA-256s re-verified before and after every run; backend `4f254f03…a41`, edge-infra `714e01bf…99a`), then in one invocation: installs the unpatched baseline scenarios, pins registry provenance/license, builds the 16-file declaration-repair candidate from the freshly installed 0.36.4 (independent temp copy, full hash inventories), and runs the strict matrix, runtime probes, driver-burden analysis, and mixed-caller scenario. `--source <dir>` overrides discovery. skipLibCheck, `any`-suppression, and workspace-only resolution are never used; installs use `--ignore-scripts`; dependency links are asserted to stay inside each consumer.

Canonical evidence (complete run): `C:/Users/drmoy/AppData/Local/Temp/frontbase-p1c/frontbase-wave1-types-prh67L/evidence.json` (online), plus `declaration-patches.json`, `candidate-no-driver-explainFiles.txt`, and the extracted registry reference tree in `registry/`. First full run: `…/frontbase-wave1-types-AiKXzh/` (identical matrix; provenance byte-comparisons absent there — see "Failed early attempts"). Both runs exit 0 with all nine acceptance checks true.

## Acceptance matrix (strict, skipLibCheck:false, @types/node 26.1.1, mysql2 3.24.5 where present)

Error counts per consumer (23-entry graph + model), upstream-only control, and mixed identity fixture:

| Graph | TS 6.0.3 NodeNext | TS 6.0.3 Bundler | TS 5.9.3 NodeNext | TS 5.9.3 Bundler | Upstream-only (N, ts6 / ts5.9) | Runtime |
|---|---:|---:|---:|---:|---:|---|
| Drizzle 0.36.4 unpatched (original reproduction) | 19 (exit 2) | 19 (exit 2) | 19 (exit 2) | 19 (exit 2) | 19 / 19 (exit 2) | 23 entries, 26 tables, exit 0 |
| Drizzle 0.36.4 + mysql2 | 18 (exit 2) | 18 (exit 2) | 18 (exit 2) | 18 (exit 2) | 18 / 18 (exit 2) | same digest |
| Candidate (16 declarations repaired), no driver | 1 (exit 2) | 1 (exit 2) | 1 (exit 2) | 1 (exit 2) | 1 / 1 (exit 2) | 23 entries, 26 tables, exit 0 (no mysql2 installed) |
| Candidate + mysql2 (acceptance) | **0 (exit 0)** | **0 (exit 0)** | **0 (exit 0)** | **0 (exit 0)** | **0 / 0 (exit 0)** | 23 entries, 26 tables, exit 0 |
| Mixed caller (candidate + own drizzle-orm@0.45.4 alias) | 0 (exit 0) | 0 (exit 0) | 0 (exit 0) | 0 (exit 0) | 0 / 0 (exit 0) | 23 entries, 26 tables, exit 0 |

Mixed identity fixture (separate observation profile, expected non-zero, not a gate): 67 diagnostics in every mode/compiler cell — 2 from the candidate copy (the two cross-copy `SQL` assignments at `mixed-caller.ts(27,7)` and `(29,7)`, both TS2322) and 65 from the consumer's own drizzle-orm@0.45.4, exactly matching the 65 previously measured for that graph. All diagnostics in every passing scenario classify inside installed drizzle declarations; zero in Frontbase declarations or the model fixtures. All five scenarios share the 26-table metadata digest `c681a859e59286b2562608ffd1012bb5302c45f8ffe10c0da3fd855eefc90217`, matching both prior experiments.

New (d) finding: the strict matrix is **invariant across TypeScript 6.0.3 and 5.9.3** in every graph — counts, codes, and positions identical; resolution mode (NodeNext vs Bundler) also never changes a count. Compiler/module mode is not a lever.

## (a) Provenance/license

- Registry manifest `drizzle-orm@0.36.4`: `license: "Apache-2.0"`, `gitHead` **absent** (npm metadata alone pins no upstream commit), `repository: git+https://github.com/drizzle-team/drizzle-orm.git`, `dist.shasum f296848e94534f318cba4cfa56634694c14742ca`, `dist.integrity sha512-1OZY3PXD7BR00Gl61UUOFihslDldfH4NFRH2MbP54Yxi0G/PKn4HfO65JYZ7c16DeP3SpM3Aw+VXVG9j6CRSXA==` (downloaded tarball verified against it; tarball 829,792 bytes, sha256 `770f09fb1b64d9eef7eedfa83e6ed73607ca758e28e506d6f89e76813ad75827`).
- Upstream revision pin: tag **`0.36.4`** (no `v`-prefixed tag exists) resolves to commit `03f6239c53c7132cf8ef08ff4f0cf70a1009de3f` (`git ls-remote`, exit 0). **Provenance scope (corrected 2026-10-10 per primary review):** the tag resolution plus the byte-identical installed-vs-published proof below identify the binary input precisely, but do **not** prove the artifact was built from that commit; the tag is retained as a candidate source reference and the registry artifact as the independently identified binary input, unless reproducible build/source correspondence is demonstrated.
- LICENSE: the published tarball root contains **README.md and code only — no LICENSE, no NOTICE** (1850 files inventoried). The upstream repository LICENSE at `main` and at tag commit `03f6239c…` are byte-identical (both sha256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`, 11,357 bytes, standard Apache-2.0 text). This upgrades the proposal's "historical license URLs were unavailable" caveat to a pinned positive result: the v0.36.4-era license is the plain Apache-2.0 text.
- What an Apache-2.0 redistribution of a patched copy requires (evidence summary, not legal advice): include the full Apache-2.0 LICENSE text; retain upstream copyright and attribution; mark every modified file with a prominent changed-file notice (Apache-2.0 §4(b)); reproduce NOTICE content if distribution uses upstream NOTICE material (none ships in the package); do not use upstream marks to promote derived distributions; state that the derivation is not endorsed by the upstream project. All decisions here belong to primary/owner; none exercised.
- mysql2 3.24.5 (matrix dev-dependency only): registry license MIT.

## (b) Runtime bytes

- Candidate copy: 1850-file inventory hashed before and after patching; exactly 16 files changed, all `.d.ts`/`.d.cts` (the eight taxonomy files × two declaration extensions), zero additions/removals; per-file before/after hashes in `declaration-patches.json`.
- Candidate vs the extracted registry artifact: 16 changed files, all declarations, **`matchesPublishedExceptDeclarations: true`** — every JavaScript, CJS, source-map, and metadata byte in the candidate equals the published 0.36.4 artifact.
- Installed vs published: the pnpm-installed 0.36.4 inside the retained-proof consumer graph is **byte-identical** to the registry artifact (0 changed/added/removed), so the patched baseline is exactly the published package, not a workspace-drifted copy.

## (c) Driver burden

- The no-driver candidate retains exactly one diagnostic per profile: `mysql-core/db.d.ts(1,38): error TS2307: Cannot find module 'mysql2/promise'`.
- Its runtime probe passes **without mysql2 installed** (23 entries, 26 tables, query construction, `getSQL()` instanceof SQL, union, `toSQL().sql` string) — same digest as all other scenarios: the coupling never executes.
- Static scan of installed declarations: every mysql2 reference is a type-only declaration import (`import type { ResultSetHeader } from 'mysql2/promise'` in `mysql-core/db.d.ts`/`.d.cts`; `import type { FieldPacket, ResultSetHeader … }` in `mysql-proxy/session.*`; `import type { Connection, … }` in `mysql2/session.*`; the only non-`import type` form is `mysql2/driver.*`'s inline `import { type Connection … } from 'mysql2'`, which is still types-only and lives in the driver entry a consumer must opt into). Runtime scan: **zero** mysql2 references in any `.js`/`.cjs`/`.mjs` outside `drizzle-orm/mysql2/`.
- Inclusion chain (from `--explainFiles`, recorded in evidence): `upstream.ts` → `drizzle-orm` root `index.d.ts` → `column-builder.d.ts` (via `./column-builder.js`) → `mysql-core/index.d.ts` (via `./mysql-core/index.js`) → `mysql-core/db.d.ts` (via `./db.js`). Root `column-builder.d.ts` line 3 `import type { MySqlColumn } from "./mysql-core/index.js"` is the cross-dialect entanglement that charges every dialect — including SQLite-only consumers — the mysql2 type requirement. An upstream fix (making that type import lazy/dialect-local) or a declaration-level repair would remove the unrelated-driver burden; installing all optional drivers is not a substitute.

## (e) Mixed external caller

Scenario: consumer depends on the candidate via `drizzle-orm` override **and** brings its own drizzle via alias `drizzle-orm-045: npm:drizzle-orm@0.45.4`.

- Duplicate installs confirmed: `.pnpm` holds both `drizzle-orm@0.45.4_@libsql+…` and `drizzle-orm@file+…` (candidate); each graph resolves its own copy; no link escapes the consumer.
- The candidate-consuming graph stays fully green (0/0/0/0) with the sibling 0.45.4 present — coexistence is safe at the Frontbase-graph level.
- Type identity: the two `SQL` types are **not interchangeable** — both cross-copy assignments fail (TS2322, candidate side 2 diagnostics), while same-copy assignments and the strict model refusals behave identically. The consumer's own 0.45.4 imports bring that version's own 65 declaration errors into the consumer's type-check, i.e. "bring your own drizzle" imports the upstream defects of whichever copy is imported.
- Runtime `is()` brand checks are **permissive across copies**: all four brand probes true (`candidateSQL_is_drizzle45SQL: true`, `drizzle45SQL_is_candidateSQL: true`), because `is()` compares `entityKind` strings rather than constructor identity. Asymmetry recorded honestly: the type layer rejects cross-copy assignment while the runtime brand check accepts it. Identity policy for any distributable repair must therefore rest on declared package identity/resolution, not on runtime `is()` discrimination.

## Recommendation (decisions explicitly left to primary/owner)

1. **Upstream accepted repair first.** File/track the 16-declaration emission repair upstream (getSQL declarations, set-operator excluded-method alias fixes, pg-core/roles optional booleans, and separately the `column-builder.d.ts` mysql2 type entanglement), then consume a verified upstream release containing it. This removes license/fork burden entirely and also fixes the 0.45.4-class defects for future versions.
2. **If no acceptable upstream release exists: a maintained, licensed fork or patch is technically viable** — this packet proves the repair is exact, reviewable (`declaration-patches.json`), runtime-byte-preserving, and green across TS 6.0.3/5.9.3 × NodeNext/Bundler with real mysql2. Requirements spelled out: (i) **immutable identity** — a renamed/aliased distributable identity (e.g. `@frontbase/drizzle-orm-patched` or a pinned fork URL), never an original-name/version override masquerading as upstream 0.36.4; (ii) full Apache-2.0 compliance per (a) — license text, attribution, changed-file notices, no mark misuse; (iii) an update policy receiving upstream security releases (pin tag `0.36.4` / commit `03f6239c…` as the fork base — a candidate source reference per the provenance-scope note in (a)); (iv) the driver burden either fixed in-fork (decouple `column-builder.d.ts` from mysql-core) or declared honestly as a required type dependency; (v) clean-install plus mixed-Drizzle caller acceptance (this packet's mixed scenario) in any release evidence. Repository-level `patchedDependencies` alone does not satisfy arbitrary external consumers and is not validated here.
3. Until primary/owner choose, nothing changes: no dependency edit, no fork repo, no publication.

## Explicit non-adoption / non-publication

The candidate is a temporary OS-temp copy retaining upstream name/version for local comparison only. This packet adopts no dependency, creates no fork, publishes nothing, and makes no release claim. Maintenance/license/distribution decisions and CF-22 scope remain with primary/owner. No workspace build was run by this worker (primary owns integrated verification); backend strict-declaration acceptance, lifecycle/full-CMS clean-room and intended-host evidence remain open.

## Honesty record

- **Failed early attempts (fixed, kept as evidence):** (1) first full run's registry-tarball extraction failed (`tar: Cannot connect to C: resolve failed` — MSYS tar rsh-interpretation); fixed by using Windows System32 bsdtar (`C:/WINDOWS/System32/tar.exe`, exit 0). Run 1 therefore lacks the published-artifact byte comparisons but is otherwise complete and identical in matrix results. (2) The `--explainFiles` inclusion-chain parser initially missed bare-specifier edges (single-quoted `Imported via 'drizzle-orm' …` lines); fixed to accept both quote styles; chain now captured (4 hops). Recorded exact diagnostics, exits, and counts throughout; no failing profile is hidden or counted as green.
- **Offline repeat:** completed in third workspace `C:/Users/drmoy/AppData/Local/Temp/frontbase-p1c/frontbase-wave1-types-l4iDAS/` (`frontbase-p1c/offline-run.log`), same command minus `--online`, exit 0, all nine acceptance checks true, matrix byte-identical to both online runs (19/19/19, 18/18/18, 1/1/1, 0/0/0, mixed 2+65), installs resolve from the pnpm store with no escaped links; registry/provenance steps self-skip with the recorded reason `offline repeat; registry metadata and upstream license fetch need network; see the online run for pinned values` (`online: false`, `installedMatchesPublishedArtifact: null` offline).
- **Blocked/limited:** none beyond the above; network, installs, and tsc all ran normally. `node --check scripts/parallel-wave1-types-repair.mjs` exit 0 after each fix. Repo working tree beyond my owned paths untouched (verified via `git status`).

## Next executable task

Primary review of this evidence; if the repair path is chosen, allocate the packaging-identity/licensing decision and the external clean-install + backend/store/migration/security re-gates to a followed packet. The unpatched strict failures remain the open R1 gate; this report changes nothing about M1 acceptance or CF-22.
