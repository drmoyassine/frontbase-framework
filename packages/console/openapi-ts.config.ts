import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generated API client (CF-22 P0 / W2 — framework-owned since consolidation
 * phase 2, A-23).
 *
 * Source of truth: packages/backend/contracts/openapi.full.json — the vendored
 * full surface (389 ops; the 55 cloud-only ops are client-only until phase 4
 * implements them server-side). Regenerate with `pnpm --filter
 * @frontbase/console client:generate` after any contract change, and commit
 * the output: the committed src/client/ must reproduce byte-for-byte from
 * this config (the zod-sync gate pairs src/client/zod.gen.ts with the
 * worker-embedded copy in packages/backend/src/compat/zod.gen.ts).
 *
 * Output is fully generated — NEVER edit src/client/ by hand.
 */
export default defineConfig({
    input: '../backend/contracts/openapi.full.json',
    output: 'src/client',
    plugins: [
        // NOTE: with no `servers` in the spec, hey-api synthesizes a default
        // server from the INPUT PATH. The product's input
        // (`fastapi-backend/contracts/…`) baked `baseURL: 'fastapi-backend'`
        // into client.gen.ts; our input starts with `..`, which parseUrl
        // rejects, so nothing is baked and ClientOptions.baseURL is fully
        // generic — that is why the framework's committed client.gen.ts /
        // types.gen.ts differ from the product-era bytes by exactly that
        // derivation (verified inert: the runtime baseURL — '' i.e. relative —
        // and auth interceptors are set in src/lib/api-client.ts, which
        // main.tsx imports before any SDK call). Do NOT call the SDK without
        // that side-effect import, and do not "restore" the product-era bytes:
        // the CI staleness gate requires committed output to match this config.
        '@hey-api/client-axios',
        '@tanstack/react-query',
        'zod',
    ],
});
