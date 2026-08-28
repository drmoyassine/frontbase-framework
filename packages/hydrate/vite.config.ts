import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Builds the client-hydration bundle (`dist/hydrate.js` + `dist/entry-*.css`)
 * that published pages and the builder canvas load from /static/react/.
 *
 * Consolidation phase 2 (A-23): this package replaces the product-repo
 * `services/edge` vite build + the byte-level patch step that used to run on
 * its output — the canvas fallbacks live at source level now (see the
 * `isBuilderCanvas` gate in @frontbase/types and the boot-order deferral in
 * src/entry.tsx).
 *
 * The 8 aliases are MANDATORY: the sub-packages import `@frontbase/types` and
 * `@frontbase/liquid-core` themselves, and none of the 8 are published or
 * workspace-linked. Bare imports (recharts, liquidjs, lucide-react, …)
 * resolve by walking up from `packages/console/packages/*` into
 * `packages/console/node_modules` — so those packages must stay physically
 * nested under the console. Versions (vite 7, plugin-react 5, react 19) match
 * the product build that produced the last vendored bundle — do not "bump"
 * casually; the canvas render path is the regression surface.
 *
 * Size note: this is a PRODUCTION build (~770 KB minified). The last vendored
 * product bundle was ~1,027 KB because the product's edge build ran with the
 * development JSX transform + dev React (jsxDEV annotations, embedded .tsx
 * source paths, react_stack_bottom_frame, full warning strings) — verified by
 * content census at consolidation time; component/library content matched
 * 1:1. Don't "fix" the size delta by re-adding dev machinery.
 */
const P = (p: string) => path.resolve(__dirname, '../console/packages', p);

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@frontbase/types': P('types/src/index.ts'),
            '@frontbase/datatable': P('datatable/src/index.ts'),
            '@frontbase/infolist': P('infolist/src/index.ts'),
            '@frontbase/form': P('form/src/index.ts'),
            '@frontbase/chart': P('chart/src/index.ts'),
            '@frontbase/kpicard': P('kpicard/src/index.ts'),
            '@frontbase/grid': P('grid/src/index.ts'),
            '@frontbase/liquid-core': P('liquid-core/src/index.ts'),
        },
        // No resolve.dedupe (unlike the product's edge build): dedupe resolves
        // from THIS package's root, where the sub-packages' bare deps are not
        // installed — they resolve by walking up into
        // packages/console/node_modules. Single-entry rollup inlines each dep
        // once anyway.
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: 'src/entry.tsx',
            output: {
                // Fixed name: the worker routes /static/react/hydrate.js to
                // exactly this file (the CSS hash is free to change — the
                // serving route globs entry-*.css).
                entryFileNames: 'hydrate.js',
                chunkFileNames: '[name]-[hash].js',
                assetFileNames: '[name]-[hash][extname]',
            },
        },
    },
});
