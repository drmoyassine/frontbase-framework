/**
 * Vite config for the setup-only SPA.
 *
 * The build is a single self-contained IIFE at dist/spa.js with CSS injected at
 * runtime. cf-full stages it as /frontbase-setup/spa.js in Workers Static Assets.
 * The sole dashboard is the separately pinned product artifact at
 * /frontbase-admin.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
    plugins: [react(), cssInjectedByJsPlugin()],
    define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
    },
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
        lib: {
            entry: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
            name: 'FrontbaseSetup',
            formats: ['iife'],
            fileName: () => 'spa.js',
        },
        cssCodeSplit: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
        target: 'es2022',
        minify: 'esbuild',
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5180,
        proxy: {
            '/api': { target: process.env.FB_API ?? 'http://localhost:8787', changeOrigin: true },
        },
    },
}));
