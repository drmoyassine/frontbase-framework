/**
 * Regenerate public/react/hydrate.js from the vendored product build
 * (public/react/hydrate.vendor.js, staged from the product checkout by
 * `pnpm fetch:hydrate` — services/edge/public/react/hydrate.js).
 *
 * WHY THIS EXISTS — the fresh-drop canvas bug:
 * The product console registers a service worker (console-dist/frontbase-admin/
 * builder-sw.js) that renders the builder canvas iframe CLIENT-SIDE and
 * force-stamps hydration props `mode:"edge"` (product data.ts: "Force edge mode
 * to prevent components from calling builder APIs"). The console's client-state
 * layout for a component dropped on an UNSAVED page has never been through
 * storage, so its binding carries no baked `dataRequest`/`columns` — and the
 * edge-mode hooks bail to empty ("No data available" / "No schema available")
 * until the first save + reload re-reads the enriched layout.
 *
 * The server-side fix (BuilderEngine `enrichLayout` at every render site)
 * covers the /builder/api/reRender path, but the SW renders locally and never
 * round-trips — and it is already installed in real browsers, so not serving
 * the script would not uninstall it. The one artifact we serve into EVERY
 * canvas render — SW path, reRender path, published pages — is this hydration
 * bundle. These patches add a builder-canvas fallback at each edge-mode bail:
 * when the document itself was rendered by the builder (meta
 * `chimera-rendered-by: builder`, stamped by both builder-sw.js and the
 * framework's own shell.ts), fall back to the sibling builder-mode fetch,
 * which builds its request from the AUTHORED binding and hits the session-
 * authed sync endpoints (same-origin iframe → cookies flow).
 *
 * Published pages render with `chimera-rendered-by: production|edge`, so the
 * fallback is dead code there — their bindings are enriched at SSR time.
 *
 * Every replacement must match EXACTLY ONCE — if the product build drifts and
 * an anchor stops matching, this script fails the build instead of silently
 * shipping an unpatched (or half-patched) bundle.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(here, '..', 'public', 'react', 'hydrate.vendor.js');
// Two outputs: public/react/ is the source-of-record copy; console-dist/react/
// is the one Workers Static Assets actually serves (wrangler [assets] points at
// console-dist). Neither is git-tracked; both are regenerated from VENDOR.
const OUTS = [
    join(here, '..', 'public', 'react', 'hydrate.js'),
    join(here, '..', 'console-dist', 'react', 'hydrate.js'),
];

/** True when this document is a builder canvas (both canvas paths stamp it). */
const CANVAS = `document.querySelector('meta[name="chimera-rendered-by"]')?.content=="builder"`;

// anchor → replacement. `from`/`to` are exact byte strings of the minified build.
const PATCHES = [
    // Chart edge fetch (fse) → builder fetch (cse). Fixes fresh-dropped charts.
    [
        'async function fse(e){const t=e.dataRequest;if(!t)return[];',
        'async function fse(e){const t=e.dataRequest;if(!t)return ' + CANVAS + '?cse(e):[];',
    ],
    // KPICard edge fetch (mse) → builder fetch (pse).
    [
        'async function mse(e){const t=e.dataRequest;if(!t)return[];',
        'async function mse(e){const t=e.dataRequest;if(!t)return ' + CANVAS + '?pse(e):[];',
    ],
    // Grid/Repeater edge fetch (bse) → builder fetch (gse). The Repeater
    // component hardcodes mode:"edge", so it rides this same hook.
    [
        'async function bse(e){const t=e.dataRequest;if(!t)return[];',
        'async function bse(e){const t=e.dataRequest;if(!t)return ' + CANVAS + '?gse(e):[];',
    ],
    // Form hook (a7): enter the builder branch when no baked columns exist in a
    // canvas document — otherwise a fresh Form renders "No schema available".
    [
        'if(e==="builder"){const m=t.dataSourceId,v=m&&m!=="backend"?',
        'if(e==="builder"||(t.columns||[]).length===0&&' + CANVAS + '){const m=t.dataSourceId,v=m&&m!=="backend"?',
    ],
    // InfoList hook: same treatment (builder branch fetches schema + record).
    [
        'if(e==="builder"){const h=t.dataSourceId,m=h&&h!=="backend"?',
        'if(e==="builder"||(t.columns||[]).length===0&&' + CANVAS + '){const h=t.dataSourceId,m=h&&h!=="backend"?',
    ],
    // Boot order (not canvas-related): defer the initial UI-event trigger
    // refresh (Lse — localStorage cache + server fetch) to a macrotask so it
    // runs after the synchronous boot pass. Codifies a hotfix that previously
    // existed only as an untracked delta in the vendored copy; without this
    // patch a freshly staged vendor silently regresses it.
    [
        'kse(t),Lse(t)};document.readyState==="loading"',
        'kse(t),setTimeout(()=>Lse(t))};document.readyState==="loading"',
    ],
];

export function patchHydrate() {
    if (!existsSync(VENDOR)) {
        // Untracked vendor artifact absent (fresh checkout) — nothing to do;
        // public/react/ is served as-is or 404s exactly as before.
        return { patched: false, reason: 'vendor absent' };
    }
    let src = readFileSync(VENDOR, 'utf8');
    for (const [from, to] of PATCHES) {
        const first = src.indexOf(from);
        if (first === -1) {
            throw new Error(
                'patch-hydrate: anchor no longer matches (product build drifted?):\n  ' + from.slice(0, 90)
            );
        }
        if (src.indexOf(from, first + 1) !== -1) {
            throw new Error('patch-hydrate: anchor matches more than once:\n  ' + from.slice(0, 90));
        }
        src = src.slice(0, first) + to + src.slice(first + from.length);
    }
    for (const out of OUTS) {
        // A fresh `console:build` may have re-created console-dist without the
        // react/ subdir; writeFileSync cannot create parents.
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, src);
    }
    return { patched: true, bytes: src.length, patches: PATCHES.length };
}

// Run directly → patch + report; imported (build.mjs) → just the function.
const invokedDirectly = process.argv[1]
    && new URL('file:///' + process.argv[1].replace(/\\/g, '/')).href === import.meta.url;
if (invokedDirectly) {
    const r = patchHydrate();
    console.log(r.patched
        ? `→ hydrate.js regenerated from vendor (${r.patches} canvas-fallback patches, ${r.bytes} bytes)`
        : `→ hydrate.vendor.js absent — skipped (untracked artifact)`);
}
