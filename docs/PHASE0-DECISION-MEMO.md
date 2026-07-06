# Phase 0 Decision Memo — Chimera Architecture Validation

**Date**: 2026-07-06 (agent test completed 2026-07-07)
**Status**: ✅ **PROCEED** — ALL Phase 0 validations complete; decision gate CLOSED
**Author**: Architecture (spike-driven)
**Supersedes**: the "Phase 0 spike" recommendation in `frontbase_framework_proposal_v1` §7.5 — this memo records what the spike actually found.

---

## Recommendation

**✅ PROCEED to Phase 1.** Every load-bearing assumption of the Chimera (Universal eSSR) architecture held on the first attempt using the **existing production renderer**, with all budgets beaten by wide margins. Nothing observed suggests Abort or Adjust. **The decision gate is closed — begin Phase 1 (M1.1 engine extraction).**

The final box — the **agent component-generation test** — was run 2026-07-07 at a far harder difficulty than planned: instead of 3 toy components, a fresh-context agent authored **all 9 prop-bearing component types of the real Frontbase homepage** (`docs/case-studies/homee.frontbase.json`), and the schemas were validated against **31 real production prop payloads** as ground truth. **First-attempt pass rate: 9/9 components (100%), 31/31 payloads.** Details below.

---

## Evidence — Phase 0 results

| # | Assumption under test | Budget / target | Measured | Verdict |
|---|---|---|---|---|
| M0.1 | Engine runs in a browser service worker | works | intercepts navigations, renders locally | ✅ |
| M0.1 | SW bundle (engine + Hono + LiquidJS + all renderers), min+gzip | < 150 KB | **52.7 KB** | ✅ 3× under |
| M0.1 | Local SW render time | < 5 ms p50 | **~1.1–1.5 ms** | ✅ |
| M0.2 | Edge ↔ SW render parity (same engine, direct vs proxy provider) | byte-identical | **byte-identical** (`/` and `/products`) | ✅ |
| M0.2 | Zod schema extraction → manifest + types | works | **14/14 assertions**; types match `z.infer` | ✅ |
| M0.2 | Extractor can't drift from Zod | round-trip agrees | manifest-derived schema accepts/rejects identically to original (5/5 cases) | ✅ |
| M0.3 | Whole CMS as ONE Cloudflare Worker | deploys | `frontbase-chimera-spike.studygram-inc.workers.dev` live | ✅ |
| M0.3 | Worker script within platform limit | < 1 MiB gzip (CF free) | **104.6 KB** gzip | ✅ 10× under |
| M0.3 | All route classes served by one worker | 7/7 | 7/7 routing smoke | ✅ |
| M0.3 | Edge Data Proxy rejects unregistered queries | 404 | `evil.dropTables` → 404 `unknown_query` | ✅ |
| M0.3 | **SW handover on the real edge** (the defining behavior) | click → SW renders locally | **confirmed by browser click-test**: nav to `/products` → `rendered-by=service-worker`, served by SW, no edge round-trip | ✅ |
| M0.3 | Engine reuse across all three hosts | zero fork | same `createEngine()` on Node / SW / CF Worker | ✅ |
| M0.3 | **Agent component generation** (DX of the Zod-`Schema` convention) | ≥3 components validate | **9/9 components** (whole real homepage), 31/31 real payloads, first attempt | ✅ 3× scope |
| Bonus | Real homepage (12 component types, builder export) renders through the engine | renders | byte-identical edge↔SW (58,341 B), SW-handover verified in browser | ✅ |

### What "PROCEED" rests on

1. The **existing string renderers** (`services/edge/src/ssr/components/`) are the seed of the engine — not waste. They ran in a SW with one stubbed import and one env shim, unchanged.
2. **One engine, three hosts** is real, not aspirational: identical `createEngine()` output is byte-identical whether the data provider is direct (edge), proxy (SW), or local-draft (builder).
3. The **security model holds**: the SW never sees SQL or secrets; the proxy serves registered queries only.
4. **Size is a non-issue** at every layer (SW 52.7 KB, worker 104.6 KB) — headroom for the console API and behaviors runtime.

---

## Agent component-generation test (run 2026-07-07)

**Design** — harder than the planned toy test, with real ground truth:
- A **fresh-context agent** (no access to the extractor or verifier source) was given only two files: `spike/fixtures/Hero.tsx` (the convention) and `spike/fixtures/agent-test/real-props.json` (real prop payloads per component type, extracted from the production homepage export `docs/case-studies/homee.frontbase.json`).
- It authored one `.tsx` per prop-bearing type used by the homepage: Navbar, Badge, Heading, Text, Button, LogoCloud, FeatureSection, Embed, Footer → `spike/fixtures/agent-test/*.tsx`.
- `spike/src/extract-verify-agent.ts` then scored each component on three gates: (1) extraction succeeds with zero `unknown` kinds and full `.describe()` coverage; (2) the manifest-derived Zod schema **round-trips** (agrees with the agent's original schema); (3) **every real production payload parses** — 31 payload instances total (5 FeatureSections, 15 Texts, …).

**Result: 9/9 components pass all three gates on the first attempt (100%); 31/31 payloads.** Run it: `cd spike && node build.mjs && node dist/extract-verify-agent.mjs`.

**DX friction reported by the agent** (the true payload of this test — each is a Phase 1 compiler/convention requirement, see inputs 11–15 below): no `.nullable()` for real `workflowId: null` payloads; no discriminated union for `actionBindings.config` (shape depends on `actionType`); no `z.record` for open maps like `parameterMappings`; enum value sets had to be guessed from single-sample payloads; shared shapes (`actionBindings` on Button *and* FeatureSection) must be duplicated with no stated composition rule.

---

## Phase 1 inputs — findings banked from the spike

These must shape Phase 1; each was a real obstacle found and resolved during the spike:

1. **`renderPage` reads `process.env` at render time** (`FRONTBASE_EDITION` / `FRONTBASE_LICENSE_KEY`, `PageRenderer.ts:584-586`) — breaks in a SW/Worker (`process is not defined`). Spike shims via esbuild banner. **Phase 1: move all env reads behind engine-creation config.**
2. **The storage import is the only render-path impurity** — `stateProvider` is used solely for Navbar favicon lookup (`PageRenderer.ts:258`). A one-file stub removed drizzle/libsql/etc. from the bundle. **Phase 1: this becomes part of the DataProvider/engine-config seam.**
3. **Navigation must be anchor-based.** Production `Button` wires page nav via `data-navigate-to`, which needs a **client behaviors/hydration script** the Chimera doesn't ship on published pages → inert clicks (observed in live test). Spike uses `Link` (`<a href>`) instead; the SW intercepts the navigation. **Phase 1 rule: page navigation = `<a href>`; the ~10 KB behaviors runtime handles non-navigation interactivity only (toggles, modals, forms). A nav-button should render as `<a>` under the hood.**
4. **Component prop contracts are informal** (Button wants `label`/`text`, not `content`; Text escapes HTML so Liquid markup inside `content` doesn't render). **Phase 1: the Zod manifest layer (M1.2) eliminates this drift.**
5. **Data components (DataTable etc.) hydrate client-side and call builder APIs** — excluded from the spike layout. **Phase 1: route their data through registered queries instead.**
6. **Zod v3 vs v4 AST shape differs** (`.describe()` is a chainable method in 3.25, metadata in v4). **Phase 1: pin the zod version the extractor targets.**
7. **`platform: 'browser'`** is the correct esbuild target for the SW **and** the Worker (`neutral` ignores `main` fields and fails to resolve `liquidjs`).
8. **No `nodejs_compat` flag needed** — the render path has no Node deps once storage is stubbed. Keep it that way; use Web Crypto for any crypto need.
9. **Round-trip testing is the extractor safety net** — assert the manifest-derived schema agrees with the original Zod schema. It caught a root-vs-modifier bug during the PoC. Bake into M1.2.
10. **`no_bundle = true` + pre-bundled artifact** is the clean way to deploy and get an honest size reading from wrangler.

From the agent test + real-homepage render (2026-07-07):

11. **The extractor needs `.nullable()`** — real builder exports carry `workflowId: null`; without it a meaningful prop is unrepresentable in the manifest (agent had to omit it and lean on non-strict parsing).
12. **Polymorphic props need a story** — `actionBindings[].config`'s shape depends on `actionType`. M1.2 should support `z.discriminatedUnion` (or document the all-optional-object workaround and make property panels actionType-aware).
13. **Open maps need `z.record`** — `parameterMappings` is a string→value map; `z.object({})` parses it but documents nothing.
14. **Enum value sets can't be inferred from payloads** — a single sample shows one value (`variant: "secondary"`). The component authoring guide (M2.5) must publish canonical enum sets; agents should never guess.
15. **Schema composition rule needed** — identical sub-schemas (`actionBindings` on Button and FeatureSection) get duplicated per file. M1.2 must state whether the extractor follows local `const` sub-schemas / imports (recommended: support local consts at minimum).
16. **The engine ships no site stylesheet or icon assets** — the real homepage renders correctly (structure, content, data) but visually raw in the spike: Navbar unstyled with desktop+mobile menus both visible, Lucide icon names render as text, LogoCloud stacks vertically. Production published pages get compiled CSS + icon handling from the styling pipeline; that pipeline is a first-class M1.1 engine seam (alongside DataProvider), not an afterthought.
17. *(housekeeping)* `services/edge/src/ssr/components/landing/Navbar.ts:130` has a stray debug `console.log` that fires on every SSR render — flagged for separate cleanup.

---

## Open items

~~Agent component-generation test~~ — ✅ **DONE 2026-07-07** (9/9 first-attempt, see §Agent test above). M0.3 → 🟢. **Phase 0 is closed; Phase 1 (M1.1 engine extraction) is greenlit.**

Remaining housekeeping (not gate-blocking):
- **Redeploy the live worker** with the real-homepage demo: `cd docs/frontbase-framework/spike-cf && npx wrangler deploy` (artifact rebuilt, 8/8 smoke, 113.7 KB gzip — awaiting manual run). After deploy, `/homee` on the live worker serves the real Frontbase homepage with SW handover. The worker **stays up** as the standing Chimera demo (decision 2026-07-07).
- Navbar debug `console.log` cleanup (input 17).

### Resume checklist (for a fresh session)

1. Read this memo. Phase 0 is **closed** — do not re-run validations.
2. Next work: **Phase 1, M1.1** (`@frontbase/edge-core` extraction) per `MILESTONES.md`, shaped by the 17 Phase 1 inputs above.
3. Live demo worker: `frontbase-chimera-spike.studygram-inc.workers.dev` (`/` spike pages, `/homee` real homepage after redeploy). Keep alive.

---

## Artifacts

- `docs/frontbase-framework/spike/` — M0.1 (engine-in-SW) + M0.2 (parity + extraction). `README.md` has full results.
- `docs/frontbase-framework/spike/fixtures/agent-test/` — the 9 agent-authored components + `real-props.json` ground truth; verifier at `spike/src/extract-verify-agent.ts` (run: `node dist/extract-verify-agent.mjs`).
- `docs/frontbase-framework/spike-cf/` — M0.3 (single-worker CF deploy), now with the real homepage at `/homee` (8/8 smoke).
- Live: `https://frontbase-chimera-spike.studygram-inc.workers.dev/` (edge path + SW handover both confirmed; `/homee` after redeploy).
