# Chimera Spike — M0.3 Single-Worker Cloudflare Deploy

**Date**: 2026-07-06 (updated 2026-07-07)
**Status**: ✅ **LIVE + VERIFIED** — deployed to `frontbase-chimera-spike.studygram-inc.workers.dev`; edge path + SW-handover click-test both PASSED. Now also serves the **real Frontbase homepage at `/homee`** (12 component types from `docs/case-studies/homee.frontbase.json`; byte-identical edge↔SW; 8/8 smoke; redeploy pending). Agent component-generation test **PASSED 9/9** — Phase 0 CLOSED. See [PHASE0-DECISION-MEMO.md](../PHASE0-DECISION-MEMO.md).

Proves the entire Chimera spike — eSSR engine, in-worker console route, Edge Data Proxy, and the browser SW bundle — deploys as **one Cloudflare Worker** (Decision A-13). It reuses the **exact engine** from `../spike/src/engine.ts`; only the entry shape differs (`export default app` for Workers vs `@hono/node-server`).

## Results (local, pre-deploy)

| Check | Result |
|---|---|
| Worker bundle (min+gzip) vs CF free limit (1 MiB) | **113.7 KB** (incl. real homepage manifest) → 9× under budget ✅ |
| Routing smoke (8 assertions incl. `/homee` real-homepage render, in-process) | 8/8 PASS ✅ |
| Engine reuse | identical `createEngine()` from `../spike` — zero fork ✅ |
| Worker name | `frontbase-chimera-spike` (no collision with `frontbase-frontend`) ✅ |

The 104.6 KB includes the inlined `/sw.js` (176.6 KB raw / ~52 KB gzip) — i.e. the worker carries the browser engine too. Phase 2 will move the builder SPA to Workers Static Assets and the SW to a versioned asset, but for the spike a single inlined artifact is simplest.

## Isolation guarantee

This folder is fully self-contained and **does not touch any other wrangler config**:
- ❌ repo-root `wrangler.toml` (`frontbase-frontend`) — untouched
- ❌ `deployment-modes/cloud-deployment/cloudflare-worker-frontend/wrangler.toml` — untouched
- ✅ this folder's `wrangler.toml` scopes `name = "frontbase-chimera-spike"`, `main = "dist/worker.mjs"`, `no_bundle = true`

`dist/` and `.wrangler/` are gitignored here.

## How to run

```bash
# 1. Ensure the sibling spike's SW bundle exists
cd docs/frontbase-framework/spike && node build.mjs

# 2. Build the worker artifact + run the routing smoke test
cd ../spike-cf && node build.mjs
node dist/smoke.mjs          # 7/7 must pass before deploying

# 3. Deploy to Cloudflare (one worker). Authenticate first:
#    `npx wrangler login`   OR   set CLOUDFLARE_API_TOKEN env var.
npx wrangler deploy          # from THIS directory — uses ./wrangler.toml
```

After deploy, wrangler prints a `*.workers.dev` URL. Smoke it:

```bash
URL="https://frontbase-chimera-spike.<your-subdomain>.workers.dev"
curl -s $URL/ | grep chimera-rendered-by          # → edge
curl -s $URL/api/console/health                   # → {"ok":true,...}
curl -s -X POST $URL/api/data/products.list -d '{}' | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" $URL/sw.js   # → 200
# Then in a browser: open $URL/ → reload → navigate to /products.
# <meta name="chimera-rendered-by"> flips to "service-worker" once the SW installs.
```

To tear down when done: `npx wrangler delete` (from this directory).

## Architecture

```
src/worker.ts   # ONE Hono app: /sw.js + /api/console/health + /api/data/:id + eSSR catch-all
                # imports createEngine + directProvider + manifest from ../spike (unchanged)
src/smoke.ts    # 7 routing assertions (in-process, runs before you deploy)
build.mjs       # esbuild → dist/worker.mjs (minified, SW inlined) + dist/smoke.mjs
                # reports gzip size vs CF 1 MiB limit
wrangler.toml   # isolated: name=frontbase-chimera-spike, no_bundle=true
```

The SW bundle is inlined as a string via an esbuild virtual module (`virtual:sw-bundle`) so the deploy is a single artifact with no Static-Assets binding. Phase 2 replaces this with Workers Static Assets for the real builder SPA.

## Findings for Phase 1 (deploy-path)

1. **The engine is runtime-portable with zero changes** — same `createEngine` runs on Node (`@hono/node-server`), in the browser SW, and as a CF Worker (`export default app`). This is the Chimera's "one engine" promise verified across all three hosts.
2. **`platform: 'browser'`** is the correct esbuild target for Workers (the `neutral` platform ignores `main` fields and fails to resolve `liquidjs`). Same target as the SW.
3. **`no_bundle = true`** + a pre-bundled artifact is the clean way to deploy and get an honest size reading — wrangler reports the exact gzip bytes that hit the 1 MiB limit.
4. **The community-badge `process.env` read** needed the same shim banner as the SW — reinforcing finding #1 from the M0.1 spike (move env reads behind engine config in Phase 1).
5. **No `nodejs_compat` flag needed** — the render path has no Node dependencies once storage is stubbed. Phase 1 keeps it that way; any future Node need (e.g. crypto) should use the Web Crypto API instead.
6. **Navigation must be anchor-based, not JS-routed** (found during live test). The production `Button` wires page navigation via a `data-navigate-to` attribute that only a **client-side behaviors/hydration script** can read. The Chimera ships no client JS on published pages, so such buttons are inert (click → nothing, no network request). The spike's nav uses the `Link` component (real `<a href>`) instead: a real anchor triggers a navigation the service worker intercepts. **Phase 1 rule: page navigation = `<a href>`; the ~10 KB behaviors runtime handles non-navigation interactivity only (toggles, modals, forms).** A nav-button that looks like a button should still render as `<a>` under the hood — a small renderer enhancement for M1.1.

## M0.3 remainder — all done (2026-07-07)

- ✅ **Real `wrangler deploy`** + live SW-handover click-test (2026-07-06).
- ✅ **Agent component-generation test** — 9/9 components of the real homepage, 100% first attempt, 31/31 real payloads. Artifacts in `../spike/fixtures/agent-test/`; verifier `../spike/dist/extract-verify-agent.mjs`. See memo §Agent test.
- ✅ **Decision memo: PROCEED** — Phase 0 closed; the worker stays up as the standing Chimera demo (`/homee` = real Frontbase homepage after redeploy).
