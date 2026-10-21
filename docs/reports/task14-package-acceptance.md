# Task 14 — Package/product acceptance and distribution readiness

**Date:** 2026-10-22 · **Branch:** `codex/study-in-usa-translations` · **HEAD:** `4106749` (task 12 complete)
**Exit criterion:** independently reproducible candidates; distribution steps remain approval-gated.
**Scope of this run:** library-graph inventory, offline tarball install proofs for all seven library candidates, triage of the five recorded debts, claim-vs-evidence matrix. No packages published, no versions bumped, no README/history edits, no external hosts contacted.

---

## 1. Library graph inventory

`packages/` contains **ten** workspace members (`pnpm-workspace.yaml`: `packages/*` + `examples/*`). The "7-library graph" framing is confirmed accurate against reality:

- **7 library candidates** (packable, `files: ["dist"]`, not `private`): `@frontbase/edge-core`, `@frontbase/translation`, `@frontbase/ui-components`, `@frontbase/compiler`, `@frontbase/builder`, `@frontbase/edge-infra`, `@frontbase/backend`.
- **3 private applications** (never published): `@frontbase/console` (`private: true`), `@frontbase/admin-console` (`private: true`), `@frontbase/hydrate` (`private: true`).

`docs/history/DECISIONS.md` line 79 already defines this framing: `@frontbase/translation` is "the seventh framework library candidate, with its own release gates, not a claim of seven published libraries." The README Packages table lists the six core libraries plus the three apps and describes translation separately in prose (README line 13) — nothing omits or overstates the graph.

### Versions and metadata (from `packages/*/package.json`)

| Package | Version | `private` | `files` | `publishConfig` | LICENSE in packed tarball | README in packed tarball |
|---|---|---|---|---|---|---|
| @frontbase/edge-core | 0.0.0 | no | dist | — | yes (auto) | no |
| @frontbase/translation | 0.0.0 | no | dist, README.md, LICENSE, sql | `access: public` | yes (explicit) | yes |
| @frontbase/ui-components | 0.0.0 | no | dist | — | yes (auto) | no |
| @frontbase/compiler | 0.0.0 | no | dist, bin | — | yes (auto) | no |
| @frontbase/builder | 0.1.0 | no | dist | — | yes (auto) | no |
| @frontbase/edge-infra | 0.0.0 | no | dist | — | yes (auto) | no |
| @frontbase/backend | 0.0.0 | no | dist | — | yes (auto) | no |

Note: every library candidate is at `0.0.0` except builder (`0.1.0`); six of seven ship no README. Both are release-gate inputs, not defects I changed (version assignment is approval-gated).

### Inter-package dependency diagram (workspace edges only; `workspace:*` protocol)

```
                    @frontbase/translation 0.0.0        @frontbase/ui-components 0.0.0
                      ^            ^                     (no internal deps; zod-free leaf)
                      |            |
             (dep)    |            | (peer)             @frontbase/compiler 0.0.0 ──peer──> edge-core
                      |            |
@frontbase/edge-core 0.0.0 <──(dep)── @frontbase/builder 0.1.0
  ^        ^
  |        └──────────── (peer) ──────────────┐
  | (dep, from console + hydrate apps)        |
  |                                 @frontbase/edge-infra 0.0.0 ──(dep)──> translation
  |                                           ^
  └────────────── (peer) ─────────────────────┤
                                              | (peer)
      @frontbase/backend 0.0.0 ──peer──> @frontbase/compiler, @frontbase/edge-core, @frontbase/edge-infra

  private apps: @frontbase/console ──(dep)──> edge-core
                @frontbase/hydrate ──(dep)──> edge-core
                @frontbase/admin-console ──> (no internal deps)
```

Dependency layers (bottom-up): `translation` + `ui-components` (leaves) → `edge-core` → `compiler` (peer) / `builder` (dep) / `edge-infra` (peer) → `backend` (peers on compiler+edge-core+edge-infra) → private apps.

### `pnpm pack` verification of the workspace protocol

`pnpm pack` rewrote every `workspace:*` range to the concrete workspace version in all seven packed tarballs (verified by extracting `package/package.json` from each tarball):

- backend peers → `@frontbase/compiler@0.0.0`, `@frontbase/edge-core@0.0.0`, `@frontbase/edge-infra@0.0.0`
- builder dep → `@frontbase/edge-core@0.0.0`; compiler peer → `@frontbase/edge-core@0.0.0`
- edge-core dep → `@frontbase/translation@0.0.0`; edge-infra peer → `@frontbase/edge-core@0.0.0`, dep → `@frontbase/translation@0.0.0`

This is correct pack behavior — and it is exactly why standalone installation cannot succeed today: the rewritten ranges point at registry versions that do not exist (nothing is published). See §2.

---

## 2. Install proofs (offline; no external host contacted)

**Environment:** Node v26.7.0; pnpm v10.14.0 (global, used in temp probes; the repo pins `packageManager: pnpm@10.15.1`). Store: `C:\Users\drmoy\AppData\Local\pnpm\store\v10`. Constraint honored: all installs ran with `pnpm add --offline` (local store only); **no live-registry install was attempted.**

### 2.1 Packing (all EXIT=0)

```
cd <worktree>
pnpm -r build                                        # EXIT=0 — logs/logs build-all.log
T=/c/Users/drmoy/AppData/Local/Temp/fb-task14; mkdir -p $T/tarballs
for p in translation edge-core ui-components compiler builder edge-infra backend; do
  pnpm --filter @frontbase/$p pack --pack-destination "$T/tarballs"
done                                                  # EXIT=0
```

| Tarball | Size | Entries |
|---|---|---|
| frontbase-backend-0.0.0.tgz | 915,276 B | 578 |
| frontbase-builder-0.1.0.tgz | 100,857 B | 80 |
| frontbase-compiler-0.0.0.tgz | 86,456 B | 96 |
| frontbase-edge-core-0.0.0.tgz | 332,031 B | 287 |
| frontbase-edge-infra-0.0.0.tgz | 79,014 B | 107 |
| frontbase-translation-0.0.0.tgz | 61,844 B | 44 |
| frontbase-ui-components-0.0.0.tgz | 4,588 B | 5 |

### 2.2 Finding F1 — plain standalone install cannot resolve sibling libraries (expected pre-publication, approval-gated to fix)

```
cd $T/probe-edge-core && pnpm add --offline <tarballs>/frontbase-edge-core-0.0.0.tgz <tarballs>/frontbase-translation-0.0.0.tgz
→ EXIT=1  ERR_PNPM_NO_OFFLINE_META  Failed to resolve @frontbase/translation@0.0.0 in package mirror
  ...\pnpm-cache\metadata-v1.3\registry.npmjs.org\@frontbase\translation.json
  (This error happened while installing the dependencies of @frontbase/edge-core@0.0.0)
```

Passing the sibling tarball on the same command line does **not** satisfy the inner dependency: after `pack`, `@frontbase/translation@0.0.0` is an ordinary registry range, and `@frontbase/translation` has no registry metadata (unpublished — consistent with README line 13 "It is not published to npm"). The same failure occurs for `@frontbase/edge-core@0.0.0` as compiler's auto-installed peer. **This is the correct pre-publication state, not a packaging bug**: it closes again only when versions are assigned and packages are actually published — an approval-gated distribution step.

### 2.3 Isolated-consumability proof technique

To prove the packed dist code is genuinely consumable without a registry, each probe project declared `pnpm.overrides` mapping the unpublished sibling names to the sibling tarballs (`"file:../tarballs/*.tgz"`), and peer-dependent packages added their peers as direct deps (peers resolve against the consumer's direct deps; regular deps need the override). Floating third-party ranges that drifted past the offline mirror were pinned to store versions (`@aws-sdk/client-s3`/`s3-request-presigner` 3.1085.0, `@supabase/postgrest-js` 2.110.2, `@upstash/qstash` 2.11.3, `@neondatabase/serverless` 1.1.0, `pg` 8.23.0, `@libsql/client` 0.17.4, `drizzle-orm` 0.36.4, `@types/ws` 8.18.1, `@types/node` 26.1.1).

**Finding F2 (documentation-grade):** offline resolution of floating `^` ranges fails when cached metadata names versions newer than the local store holds (`ERR_PNPM_NO_OFFLINE_TARBALL` / `ERR_PNPM_NO_MATCHING_VERSION`, e.g. `@smithy/core@^3.36.0` vs store max 3.35.2). Live-registry behavior was not tested (offline constraint). This affects consumer installs generally and is normal for caret ranges; recorded here for the release-gate checklist.

### 2.4 Per-package results (install EXIT=0 and smoke EXIT=0 for all seven)

Smoke scripts live in the temp probes (`$T/probe-<pkg>/probe.mjs`), not the repo. Imports use bare specifiers against installed `node_modules` (real consumer shape); dynamic `import()` used throughout.

| Package (tarball) | Install | Smoke result | Behavior exercised |
|---|---|---|---|
| @frontbase/translation | EXIT=0 (no overrides needed) | EXIT=0 — `probe-translation OK: top-level exports = 45` | `translationUnitId` stable under key reorder; `messageSourceFingerprint` changes on text change; `./contracts` subpath import |
| @frontbase/ui-components | EXIT=0 | EXIT=0 — `probe-ui-components OK` | `PACKAGE === '@frontbase/ui-components'` |
| @frontbase/edge-core | EXIT=0 (override: translation→file) | EXIT=0 — **byte-parity 15/15 on the full golden corpus rendered from the packed tarball**; 29 top exports; `./localization` subpath = 58 exports | Full `renderPage` over all 15 corpus layouts, SHA-256 + byte comparison vs committed snapshots; localization bridge loads the packed translation dep |
| @frontbase/compiler | EXIT=0 (overrides + direct peer adds) | EXIT=0 — `probe-compiler OK: exports = 30` | `stableStringify` round-trip; `./manifest` subpath import (esbuild build script ignored by pnpm 10 default — noted, not exercised) |
| @frontbase/builder | EXIT=0 (override: edge-core→file) | EXIT=0 — `probe-builder OK: exports = 40` | `globalRegistry`, `ComponentRegistry`, `registerComponents` present |
| @frontbase/edge-infra | EXIT=0 (overrides + direct peer add) | EXIT=0 — `probe-edge-infra OK: exports = 62` | `createSqlDataProvider`, `sqliteRunner`, `buildDataProvider` present |
| @frontbase/backend | EXIT=0 (overrides + direct peer adds) | EXIT=0 — `probe-backend OK: exports = 123` | `createConsole`, `defaultDenyAuth`, `ConsoleStore`, `noopCipher` present (no server boot attempted — import-level proof only) |

The edge-core proof is the strongest result of this task: the packed, isolated artifact reproduces the engine's byte-parity gate (15/15) outside the workspace, with `@frontbase/translation` consumed through its own packed tarball.

**Not proved (and why):** plain `pnpm add` from a registry path (F1 — requires publication), live-registry metadata resolution (offline constraint), cross-host runtime behavior (Cloudflare/Workers, Docker — deploy evidence is a separate gate), `createConsole` server boot (needs stores/secret config).

---

## 3. Debt triage

**Outcome summary: zero source changes required this run.** Debts 1–3 were already repaired on this branch before task 14 started; debts 4–5 were re-verified and documented. All fix work belongs to commit `e6fee13` ("repair HEAD debts: golden corpus regen via restored regen script + stale browsing pins", 2026-10-21).

| # | Debt (as recorded) | Re-run command | Result | Triage |
|---|---|---|---|---|
| 1 | `packages/edge-core test/parity.mjs` 2/15 — golden snapshots lack Navbar aria attrs (last green 997fe5f) | `cd packages/edge-core && node test/parity.mjs` | **EXIT=0** — `byte-parity: 15/15 — M1.1 gate GREEN` | **Fixed by e6fee13** (not by me): `scripts/regen-golden.mjs` restored (920289f precedent) and all 15 snapshots regenerated; reviewed delta exactly mobile-menu ids, toggle aria attrs, Repeater `fb-repeater-host`/template props/SSR children. Verified green today after full `pnpm -r build`. |
| 2 | `test/localization.mjs` compat-export parity — `src/localization/index.ts` re-exports `./surfaces.js` names the standalone package lacks (021b100/4991383) | `cd packages/edge-core && node test/localization.mjs` | **EXIT=0** — 3 PASS lines incl. `localization compatibility: identical standalone export identities PASS` | **Resolved as a pinned contract** (477930c, refined f152641/ebff76b): the test now asserts (a) edge-core/localization carries every standalone export with identical implementations, and (b) the extra keys equal exactly the 13 framework-owned names. The divergence is conscious, explicit, and test-enforced rather than accidental. No change needed. |
| 3 | `test/directory-bindings.mjs:154` — search `<form>` rendering assertion | `cd packages/edge-core && node test/directory-bindings.mjs` | **EXIT=0** — all five PASS lines | **Fixed by e6fee13** (not by me): the assertion had been unpassable since 8230f94 (saved `directoryBrowsing` placement overrides runtime `searchEnabled`); rewritten placement-driven with an explicit placement-wins pin; the :159 aria assertion now pins the conditional tabs `<nav>` absence. Verified green today. |
| 4 | Stale-receipt note: translation consumer's public surface grows when ports grow (`consumer.ts`) | inspection | n/a | **Concern valid; file reference stale; mechanism now test-enforced.** No `consumer.ts` exists anywhere in the repo (only unrelated `scripts/parallel-wave1-types/consumer-*.ts`). The consumer surface is the compatibility bridge `packages/edge-core/src/localization/index.ts:2` (`export * from '@frontbase/translation'`) — standalone growth propagates automatically by design, and edge-core's own additions are gated by the pinned extra-keys assertion at `packages/edge-core/test/localization.mjs:9` (debt 2's fix is precisely the "receipt" mechanism). No action needed; future new edge-core localization exports must update that pin. |
| 5 | Performance observations (documentation only) | inspection | n/a | **Confirmed with file:line evidence; no code change made**, per instruction: (a) per-request chunk validation — `SitePublicationManifestStore.verify()` parses the full manifest then re-verifies every chunk reference (`packages/backend/src/compat/site-publication-manifest.ts:180-183`; up to 2048 chunks/schema at :27), invoked per request at `site-publication-serving.ts:34,41` and `translation-homepage-serving.ts:111`, and every chunk read re-parses + re-hashes (`site-publication-chunks.ts:55-66`, hash at :65); (b) duplicated activeVersion/review reads per page GET — `resolveReviewedSitePublication` reads both (`site-publication-serving.ts:26-28`) and a plain non-locale GET then runs `resolveHomepageLanguageRequest` → `captureHomepage` which reads both again (`translation-homepage.ts:109-111`) via `renderReviewedSitePublication` (`site-publication-serving.ts:59-62`); (c) three independent per-call chunk caches — `site-publication-chunk-queries.ts:38`, `publication-list-source.ts:63`, `site-publication-runtime.ts:49` (plus capture-level Maps at `translation-homepage-serving.ts:33,63`); (d) sitemap branch re-resolving the locale request — `site-publication-serving.ts:72` calls `sitemapLocaleEntries` (`translation-homepage-serving.ts:32-44`) which re-reads `publishedHomepageLocales` (:33/`translation-homepage.ts:294`) and re-runs the per-path capture availability walk although the request was already resolved at :59-62. |

No fixes were made by this task, so no rebuild/re-run cycle was triggered beyond the verification runs above (full `pnpm -r build` EXIT=0 preceded all suite runs; `tsc` emits despite errors, so rebuild-before-rerun was observed).

---

## 4. Verification evidence (exact commands and exit codes)

```
pnpm -r build                                   → EXIT=0   (build-all.log)
cd packages/edge-core && node test/parity.mjs   → EXIT=0   15/15 GREEN
cd packages/edge-core && node test/localization.mjs → EXIT=0
cd packages/edge-core && node test/directory-bindings.mjs → EXIT=0
pnpm --filter @frontbase/edge-core test         → EXIT=0   (all 15 suite files)
pnpm --filter @frontbase/translation test       → EXIT=0   (6 suite files)
pnpm -r check                                   → EXIT=0   (all workspace members typecheck; run even though no source changed, as claim-matrix evidence)
```

`pnpm -r test` (full workspace) and `test:mutation` / no-leak / CF-22 / conformance gates were **not** run by this task (out of its surface); no claim below relies on them.

---

## 5. Claim matrix (README.md and docs vs evidence of 2026-10-22)

| # | Claim (location) | Status vs today's evidence |
|---|---|---|
| 1 | "accepted first public-edition scope is **Frontbase Framework Developer Preview**. Release preparation is in progress; package publication, clean self-host installation, security and operations gates remain open." (README line 11) | **Consistent — verified.** F1 demonstrates precisely why "package publication gate open" is true: tarballs carry unpublished `0.0.0` sibling ranges. No overstatement found. |
| 2 | "`@frontbase/translation` … It is not published to npm." (README line 13) | **True — verified.** Offline resolution finds no registry metadata for `@frontbase/translation` (F1). Its tarball does pack cleanly with `publishConfig.access: public`, sql/ + LICENSE/README included (44 entries) and passes the strongest behavior smoke. |
| 3 | Packages table lists 6 libraries + 3 apps; translation described in prose as seventh candidate (README lines 168-176, 13) | **Accurate.** Matches the 10-directory reality and DECISIONS.md:79 framing. Optional wording note for the parent (not an overstatement): the table itself does not list `@frontbase/translation`; a reader skimming only the table sees six libraries. Adding a row marked "seventh candidate — not published" would make the table self-contained. |
| 4 | "Universal SSR — one engine, three hosts, byte-identical output." (README line 161) | **Partially verified.** Byte-identity of the engine is confirmed (corpus 15/15, including from the packed tarball) **on Node**. Cross-host (Workers/Vercel/Deno) byte identity was NOT tested today and rests on deploy evidence not run here — the claim remains gated by evidence this task did not produce. |
| 5 | "`pnpm check` — typechecks all packages" / "`pnpm build` — builds all packages" (README lines 197-199) | **Verified today:** both EXIT=0. |
| 6 | "Apache-2.0 for all packages in this repository" (README line 217) | **Verified at tarball level:** all seven packed tarballs contain a LICENSE file. Six of seven ship no README (cosmetic gap for future npm pages; note only). |
| 7 | Bundle/measurement table and "one deployable worker" claims (README lines 150-154, 3) | **Not verified today** (requires worker bundle + deploy evidence; out of scope). No discrepancy observed in wording — measurements are explicitly tied to dated delivery evidence. |
| 8 | "RULE 1 (no-leak) … enforced by a no-leak gate + mutation proof" (README line 159) | **Not run today** (no-leak suites belong to `pnpm test`/package test scripts not in this task's surface). No overstatement; flagged as not re-verified. |
| 9 | Docker/Vercel/Deno deploy buttons and self-host quick start (README lines 42-129) | **Not verified today** (requires hosts/secrets; approval-gated deploy evidence per framework rules). |

**Net:** no claim found that overstates shipped state. README's release posture (line 11) matches today's findings exactly.

---

## 6. Distribution-readiness verdict

**Candidates: independently reproducible — YES, at tarball level.** From a clean `pnpm -r build` (EXIT=0), all seven library candidates pack deterministically; each packed tarball installs into an isolated project and passes an import/behavior smoke offline, with edge-core reproducing its 15/15 byte-parity gate from the packed artifact alone. `pnpm pack` correctly resolves the `workspace:*` protocol, and the graph (7 libraries + 3 private apps) is accurately described in README/DECISIONS.

**Distribution steps: remain approval-gated — correctly so.** None of the following was performed or is unblocked by this report:

1. **Version assignment** — seven packages at `0.0.0` (builder `0.1.0`) need an owner-approved versioning decision before any publish.
2. **npm publication** — F1 shows sibling ranges resolve only from a registry; publishing (and the `publishConfig.access: public` decision for edge-core et al., which currently lack it) is an owner-gated step. Publishing would also make the plain-install path (no overrides) the real consumer experience and should be followed by a registry-path install proof.
3. **Release announcements / README release-claim changes** — untouched per instructions; wording suggestions in §5 item 3 only.
4. **Registry-path and cross-host verification** — live-registry install, worker bundle, and cross-host byte-parity evidence remain open gates named by README line 11 and were not exercised here (offline + no-deploy constraints).

**Recommended ordering for the approval-gated path:** (1) owner decision on versions + access; (2) publish sequence translation → edge-core → {ui-components, compiler, builder} → edge-infra → backend (dependency order); (3) repeat §2 proofs with plain installs against the registry; (4) only then consider release-label wording.

## 7. Residual state

- Repo changes by this task: `docs/reports/task14-package-acceptance.md` (this file) only. No package source touched; the pre-existing `examples/cf-full/api/cms.mjs` modification was preserved untouched.
- All probes, tarballs, and logs live outside the repo under `C:\Users\drmoy\AppData\Local\Temp\fb-task14\` (`tarballs/`, `probe-*/`, `logs/`).
- Not run (belongs to other gates): `pnpm -r test`, `test:mutation`, no-leak suites, CF-22 gates, conformance, deploy evidence.
