# @frontbase/console

The Frontbase admin console SPA (framework edition). Moved in from the product
repo (`Frontbase-`) on 2026-08-28 (consolidation phase 1) — this package is now
the single source of truth; the console artifact is built and staged by
`pnpm console:build` from the framework root.

## Layout notes

- **`packages/*` (nested) are NOT workspace packages.** They are source dirs
  resolved by aliases (`vite.config.ts`, `tsconfig(.app).json` paths,
  `vitest.config.ts` — four places that must stay in sync), exactly as they
  were in the product repo. The pnpm workspace glob `packages/*` is
  single-segment and deliberately does not match `packages/console/packages/*`;
  don't "fix" that. Their bare imports (`recharts`, `liquidjs`, …) resolve by
  walking up to this package's `node_modules`.
- **Deliberately no `@frontbase/builder` alias.** The framework workspace ships
  a real `@frontbase/builder`; this console never imports one (comments only),
  and an alias would shadow the framework's package.
- **`src/client/`** is a committed generated API client (hey-api) from the
  product's FastAPI spec. It still works (runtime base URL is overridden in
  `src/lib/api-client.ts`); regeneration moves to the framework in phase 2 of
  the consolidation, when the contract inverts.
- **`src/sw/builder-sw.ts`** imports `@frontbase/edge-core` — a real workspace
  dependency of this package (`"workspace:*"`), resolved at build time to the
  compiled dist. Build edge-core first (`pnpm -r build` does this for you).

## Commands

| Command (from framework root) | What it does |
|---|---|
| `pnpm console:build` | Build this package (`vite build --mode community` → base `/frontbase-admin/`) and stage dist → `examples/cf-full/console-dist/frontbase-admin` |
| `pnpm console:check` | Validate the staged artifact + vendored contract hash |
| `pnpm fetch:hydrate` | Stage `hydrate.vendor.js` + `entry-*.css` from the product checkout (transition-only; retires in phase 2) |
| `pnpm --filter @frontbase/console dev` | Vite dev server (proxies `/api`, `/static`, `/builder` → wrangler dev :8787) |

The staged `console-dist/` output is untracked — nothing under it gets
committed. `build` is pinned to `--mode community` so the self-host base path
holds even if a local `.env` says otherwise.

## Fidelity pins — do not loosen casually

This build replaces a product-built artifact, so several knobs are pinned to
**exact** versions on purpose. Loosening any of them changes bundle bytes and
silently ends the byte-comparability that phase 1 was verified under.

- **devDependencies are exact-pinned** (no `^`/`~`) to the product-resolved
  versions — a fresh `^` resolution pulled 64 version drifts and +88 kB of
  bundle delta.
- **Root `pnpm.overrides`** hold the 7 remaining bundled runtime libs
  (floating-ui stack, `react-remove-scroll`, `aria-hidden`,
  `@monaco-editor/loader`) and **`rollup`** — vite's chunk codegen, whose patch
  releases change emitted bytes — at product versions.
- **`esbuild` is pinned 0.21.5** (vite 5.4.x's own resolution) — it compiles
  `src/sw/builder-sw.ts`; a different esbuild produces different SW bytes.
- **`builder-sw.js` byte discipline.** The SW bundle is timestamp-free, so it
  can be byte-compared against the product build — and it must stay identical.
  esbuild orders its minified-name alphabet by character frequency over SOURCE
  identifiers, so *any* code-level spelling change (even an erased TS type
  annotation like `Record<string, unknown>` → a named type) shifts every
  minified name downstream. Keep the original spellings in byte-gated code and
  suppress type errors with `@ts-ignore` comments (esbuild strips comments —
  byte-neutral).
- **`tsconfig.check.json` scopes `check` to `src/sw` + `src/client`** on
  purpose: the full `src` carries pre-existing product type debt that was never
  gated in the product, and fixing it is out of scope for a zero-behavior
  phase. `src/sw` IS gated — it is the byte-parity-critical SW.
- **Root `pnpm test` excludes this package** (`--filter=!@frontbase/console`):
  this package's vitest 4 needs vite ^6 at runtime, while the build pins
  vite 5.4.21 for parity. Revisit both in consolidation phase 2.
- **Datatable resolves the shared React 18.3.1.** The product's working tree
  had a stray `packages/datatable/node_modules/react` at **19.2.3** (its
  committed lockfile does not reproduce it), so the last product build shipped
  two Reacts. Datatable declares `react: ^18 || ^19` as a peer and uses only
  18-era hooks, so the single-React resolution here is the correct, lockfile-
  reproducible configuration — the only deliberate module-graph difference.
