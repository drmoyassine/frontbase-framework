# Live-serving CPU stream — task delivery report (2026-11-16)

**Branch:** `codex/live-serving-first-render-cpu` (pushed; HEAD `b3bada51` on top of delivery tip `2fd2521e`)
**Worktree:** `C:/Users/drmoy/.codex/worktrees/live-serving-cpu/frontbase-framework` (clean checkout, outside OneDrive)
**Assignment:** owner-directed continuation of the live-data-serving CPU stream — reproduce the hosted baseline from a clean checkout, identify what dominates first-render CPU, land the evidence-ordered candidates (scoped-resource lookup, fresh-floor work, walk absorption) plus warm-request work, adopt the realistic promotion gate, and record it in the release docs. Production untouched throughout.

## 1. Adopted changes (four measured performance changes + one fix)

| Commit | Change | Mechanism | Hosted effect (pooled medians) |
| --- | --- | --- | --- |
| `8f1adbd2` | Frozen-subtree sharing in row clones | `cloneBlockTree` shares deeply frozen `styles`/`stylesData`/`visibility` by reference so row clones hit the frozen-object CSS memoizations instead of recomputing per row | warm AR home 17→11 ms; fresh AR home 69→47 ms |
| `b8be37db` + `bf263c8a` | By-resource unit-identity resolution | New `read-unit-ids-by-resource` batch RPC computes the canonical identity envelope in Postgres and echoes the hashed bytes; adapter byte-compares the echo and falls back to client-side identity on any divergence or out-of-domain resource | removes ~45 WebCrypto identity hashes per fresh Arabic isolate from the Worker |
| `ef2567a5` | Publication-time layout feature flags | Three per-render whole-tree walks (runtime features, non-empty-versions probe, legacy menu scan) computed once per frozen layout and threaded via options; absent flags keep in-render walks | contributes to warm EN home 9→7.5 ms |
| `d665696f` | `Intl.DisplayNames` memo | Bounded module map per locale (two formatter constructions per localized request → one cached instance) | rides in the final artifact |

The hosted stream also caught and fixed a real defect in the new SQL (`bf263c8a`): the v2 helpers were revoked from PUBLIC but only `translation_resource_envelope` was re-granted, so PostgREST's execution role hit `42501` and every Arabic page 503'd. The JS↔SQL parity harness could not see this class (psql runs as superuser, bypassing privilege checks); a new transport probe now covers it.

## 2. Proof infrastructure built (all committed, all disposable-fixture based)

- **JS↔SQL parity harness** — `scripts/localization/run-identity-parity.mjs`: 1,510 corpus cases proving JS digest == SQL digest AND envelope-echo equality; 16 out-of-domain refusal cases plus mixed-batch/duplicate/unsorted refusals with the exact fallback errcode; legacy operation and grant surfaces unchanged; fault-injection sensitivity (a deliberately swapped scope order is caught by the probe).
- **Transport probe** — `scripts/localization/run-identity-transport-probe.mjs`: real PostgrestClient + real adapter + real SQL on disposable Docker; proves the full adapter path end-to-end including privileges.
- **Worktree-pinned hosted harness** — `study-in-usa-ops/make-cpu-matrix-variant.mjs` derives the hosted CPU matrix from any clean checkout; artifacts staged under `live-serving-artifacts/<sha256>/`; Worker-side error logs now captured for 4xx/5xx tail events; Postgres initdb restart race now retried.
- **Features gate test** — `packages/backend/test/live-layout-features.mjs`: threaded-vs-walked byte-identical HTML, flag equality under row projection, memoization, record-context exclusion.

## 3. Measured results

Pooled Cloudflare-tail CPU medians, anonymous/direct arm, verified 200-status samples (fresh = ordinal 1 on a unique isolate; warm = ordinal 2, same isolate):

| Route | Baseline `be8492c0` fresh / warm | Final `d19b9e40` fresh / warm |
| --- | --- | --- |
| EN homepage | 36.5 / 9 ms | 31 / 7.5–9 ms |
| AR homepage | 56 / 16 ms | 46 / **10 ms** |
| EN first search | 39 / 8 ms | 30 / 7–10 ms |
| AR first search | 84 / 16 ms | 47 / **8–12 ms** |
| Long article | 12–34 / 18–72 ms | 14–34 / 19–26 ms |

Arabic first-search fresh improved 44% (84→47 ms) and its warm median roughly halved; Arabic homepage warm moved 16→10 ms; every route improved or held; no regression anywhere.

## 4. Gate status (realistic gate adopted 2026-11-16, recorded in DECISIONS/STRATEGY/MILESTONES/AUDIT)

| Criterion | Status |
| --- | --- |
| Warm median < 10 ms EN/AR on all measured routes | **At the line** — EN home/search and AR search under 10; AR homepage exactly at 10 ms; more samples wanted |
| Fresh isolates bounded, no baseline regression | **Held** — several routes materially improved; strict sub-10 remains open and is documented as first-touch-bound (module eval, zod init, HKDF, first JIT passes) |
| 7-day zero-Error-1102 monitored production soak + owner review | **Open** — only satisfiable after a production deployment |

## 5. Rejected alternatives (measured or security-documented, in the ledger)

- Manifest envelope hand-decode — cold `activeForServing` measured at **0.52 ms total**; the historical 5.68 ms was one-time module init, not per-parse cost. Below the adoption bar for a mirrored grammar.
- Batched pointer+settings state read — the app_menus key depends on route resolution; no removable round trip without over-fetching.
- Cipher re-derivation — single HKDF once per isolate; any change breaks stored `enc:` ciphertexts.
- Cross-request credential-decrypt memo — breaks the documented rotation-visibility invariant; plaintext retention weakens secret handling.

## 6. Run inventory and discarded evidence

Retained hosted matrices (evidence JSON `study-in-usa-ops/final-live-matrix-<token>.json` + `run*.log`): baseline `be8492c0` (A2/`029d3617`, A3/`392ddfe2`, plus the prior session's `aedd3f3f`), clean rebuild `7b017c1c` (B/`39dc0eb2`), clone-share `186a1848` (C1–C4), by-resource `84d3d803` (D2), feature flags `fa7fad62` (E1, E2), final `d19b9e40` (F1). Discarded: run A (transient all-500 infrastructure failure, superseded by identical-input A2) and run D1 (SQL privilege defect, fixed and superseded by D2). Every retained run verifies the full functional fixture: live edits in both locales without republishing, stale-head invalidation, pointer stability, no-store, no cache hits.

## 7. Reproduction recipe

1. `git worktree add … <branch> 2fd2521e` (or later) outside OneDrive; `pnpm install`; `FRONTBASE_SKIP_VERCEL_STAGE=1 node examples/cf-full/build.mjs`.
2. `node study-in-usa-ops/make-cpu-matrix-variant.mjs <worktree-root>` (derives the harness copies).
3. Stage `examples/cf-full/dist/{worker,pg-worker}.mjs` under `study-in-usa-ops/live-serving-artifacts/<sha256>/`.
4. `CLOUDFLARE_ACCOUNT_ID=680ebc… WRANGLER_SEND_METRICS=false FB_LIVE_ENTRY_BUNDLE=./live-serving-artifacts/<sha>/worker.mjs FB_LIVE_ENTRY_SHA256=<sha> node study-in-usa-ops/live-serving-cpu-matrix.mjs` (wrangler is OAuth-authenticated; Docker Desktop must be running).
5. Local proofs: `node scripts/localization/run-identity-parity.mjs <out>` and `node scripts/localization/run-identity-transport-probe.mjs <out>` (disposable Docker).

## 8. Remaining work / handoff

1. **Soak gate:** deploy the final artifact to production, monitor Error 1102 / resource-limit events for 7 days, then owner review — the only remaining step before realistic-gate promotion.
2. **Warm Arabic homepage:** one more sample batch to establish "below 10" rather than "at 10".
3. Framework milestone (strict <10 ms on fresh isolates): documented as first-touch-bound; a materially different serving design (full precompiled HTML with data slots) is the only identified path, noted for a future decision.
4. The delivery worktree (`cf-credential-handoff`) and OneDrive main repo were not modified.

Commits, in order: `8f1adbd2`, `530fd77e`, `8c829af2`, `b8be37db`, `bf263c8a`, `7eee411e`, `ef2567a5`, `d665696f`, `b3bada51` — all pushed.
