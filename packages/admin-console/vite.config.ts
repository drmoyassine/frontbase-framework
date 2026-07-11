/**
 * Vite config for the admin console SPA.
 *
 * Build target: a SINGLE self-contained IIFE at dist/spa.js with CSS injected at
 * runtime by vite-plugin-css-injected-by-js. This is what cf-full's build.mjs
 * inlines into the worker via `virtual:spa-bundle` (mirroring the SW pattern) —
 * so the deploy stays a single artifact (CF-18 Phase 1 decision: inline, not
 * Workers Static Assets).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react(), cssInjectedByJsPlugin()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
        lib: {
            entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
            name: 'FrontbaseConsole',
            formats: ['iife'],
            fileName: () => 'spa.js',
        },
        // One file, no code-splitting (IIFE can't be split). CSS is injected by
        // the plugin above, so no separate .css asset is emitted.
        cssCodeSplit: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
        target: 'es2022',
        minify: 'esbuild',
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        // Dev: proxy the console API to a running worker (local or deployed) so
        // the SPA can be developed with HMR against a real backend.
        port: 5180,
        proxy: {
            '/api': { target: process.env.FB_API ?? 'http://localhost:8787', changeOrigin: true },
        },
    },
});
