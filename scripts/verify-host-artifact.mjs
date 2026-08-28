#!/usr/bin/env node
/**
 * Shared pre-deploy artifact gate (A-24): verifies the per-host bundle/config/
 * staging trio for the Vercel and Deno deploy scripts — the files the deploy is
 * about to ship, judged AFTER the build so stale bytes can't be blessed.
 *
 * This is the host-CLI analogue of validateStagedConsole(): a deploy script
 * refuses to run if any check fails, so a broken artifact never reaches the
 * host CLI. The deep config contract lives in examples/cf-full/test/
 * vercel-config.mjs (run by CI on every PR); this gate re-checks the
 * deploy-critical subset of the exact file about to ship.
 *
 * Module use:   const { verifyHostArtifact } = await import('./verify-host-artifact.mjs');
 *               const r = verifyHostArtifact('vercel', { exampleRoot });
 * CLI use:      node scripts/verify-host-artifact.mjs --host vercel
 *               node scripts/verify-host-artifact.mjs --host deno --dry-run
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const defaultExampleRoot = join(here, '..', 'examples', 'cf-full');

// Any quoted `node:` import form. FATAL on Vercel Edge (no node builtins);
// allowed on the Deno emit (node-compat shim — checked per-specifier there).
const NODE_SPEC = /['"]node:[A-Za-z]/;
// The pinned web libsql client's error literal — proves the edgeAlias took.
const WEB_LIBSQL_MARKER = 'URL_SCHEME_NOT_SUPPORTED';
// A bundled NATIVE libsql path (platform-binary loader). Must never appear.
const NATIVE_LIBSQL = /@libsql\/(linux|darwin|win32|android|freebsd)-[a-z0-9-]+/;
// qstash client's stable endpoint literal (bundled, not external).
const QSTASH_MARKER = 'qstash.upstash.io';

/**
 * @param {'vercel'|'deno'} host
 * @param {{ exampleRoot?: string }} [opts]
 * @returns {{ ok: boolean, checks: Array<{ label: string, ok: boolean }>, failures: string[] }}
 */
export function verifyHostArtifact(host, opts = {}) {
    const root = opts.exampleRoot ?? defaultExampleRoot;
    /** @type {Array<{ label: string, ok: boolean }>} */
    const checks = [];
    const check = (label, ok) => { checks.push({ label, ok: Boolean(ok) }); };

    if (host === 'vercel') {
        const bundlePath = join(root, 'dist', 'vercel.mjs');
        const bundle = existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8') : '';
        check('dist/vercel.mjs exists and is non-trivial', bundle.length > 100_000);

        const apiPath = join(root, 'api', 'cms.mjs');
        check('api/cms.mjs is byte-identical to dist/vercel.mjs (the deployed function)',
            existsSync(apiPath) && bundle.length > 0 && readFileSync(apiPath).equals(readFileSync(bundlePath)));

        check('bundle: zero quoted node: specifiers (Edge runtime has no node builtins)', !NODE_SPEC.test(bundle));
        check('bundle: edge runtime directive survived bundling', /runtime\s*:\s*['"]edge['"]/.test(bundle));
        check('bundle: web libsql client pinned (URL_SCHEME_NOT_SUPPORTED marker)', bundle.includes(WEB_LIBSQL_MARKER));
        check('bundle: native libsql client absent', !NATIVE_LIBSQL.test(bundle));
        check('bundle: qstash client bundled', bundle.includes(QSTASH_MARKER));

        // Config contract — deploy-critical subset of test/vercel-config.mjs.
        // `rewrites` uses Vercel's phase-object form (beforeFiles/afterFiles/fallback).
        const cfgPath = join(root, 'vercel.json');
        let cfg = null;
        try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* reported below */ }
        check('vercel.json parses', cfg !== null);
        if (cfg) {
            check('vercel.json: outputDirectory is console-dist', cfg.outputDirectory === 'console-dist');
            const phases = cfg.rewrites && typeof cfg.rewrites === 'object' && !Array.isArray(cfg.rewrites)
                ? cfg.rewrites : {};
            const beforeFiles = Array.isArray(phases.beforeFiles) ? phases.beforeFiles : [];
            const afterFiles = Array.isArray(phases.afterFiles) ? phases.afterFiles : [];
            const fallback = Array.isArray(phases.fallback) ? phases.fallback : [];
            check('rewrite: /frontbase-admin shell → /api/cms in beforeFiles (function must own the needsSetup 302, before the filesystem)',
                beforeFiles.some((r) => r.source === '/frontbase-admin' && r.destination === '/api/cms'));
            check('rewrite: /frontbase-admin/index.html → /api/cms in beforeFiles',
                beforeFiles.some((r) => r.source === '/frontbase-admin/index.html' && r.destination === '/api/cms'));
            check('rewrite: /static/react + /static/icon.png translated in afterFiles (real file wins on CDN)',
                afterFiles.some((r) => r.source === '/static/react/:file*' && r.destination === '/react/:file*')
                && afterFiles.some((r) => r.source === '/static/icon.png' && r.destination === '/icon.png'));
            const staticRules = [...beforeFiles, ...afterFiles]
                .filter((r) => typeof r.source === 'string' && /static/.test(r.source));
            check('rewrite: /static/assets is NOT translated (KV branding assets stay on the function)',
                staticRules.every((r) => !/static\/assets/.test(r.source)));
            check('rewrite: single catch-all → /api/cms in fallback (function owns everything else)',
                fallback.length === 1 && fallback[0].source === '/:path*' && fallback[0].destination === '/api/cms');
            const headers = Array.isArray(cfg.headers) ? cfg.headers : [];
            check('headers: hydrate.js no-cache rule present',
                headers.some((h) => typeof h.source === 'string' && /react\/hydrate\.js/.test(h.source)));
            const shellHeaderIdx = headers.findIndex((h) => h.source === '/frontbase-admin/(.*)');
            const assetsHeaderIdx = headers.findIndex((h) => typeof h.source === 'string' && /assets/.test(h.source));
            check('headers: broad /frontbase-admin/(.*) rule listed AFTER the assets rule (merge order)',
                assetsHeaderIdx >= 0 && shellHeaderIdx > assetsHeaderIdx);
        }

        // Staged statics the CDN serves (outputDirectory tree).
        check('staged: console-dist/frontbase-admin/index.html',
            existsSync(join(root, 'console-dist', 'frontbase-admin', 'index.html')));
        check('staged: console-dist/react/hydrate.js', existsSync(join(root, 'console-dist', 'react', 'hydrate.js')));
        check('staged: console-dist/icon.png', existsSync(join(root, 'console-dist', 'icon.png')));
    } else if (host === 'deno') {
        const stagedEntry = join(root, 'deno-dist', 'deno.mjs');
        const distEntry = join(root, 'dist', 'deno.mjs');
        check('deno-dist/deno.mjs is byte-identical to dist/deno.mjs',
            existsSync(stagedEntry) && existsSync(distEntry)
            && readFileSync(stagedEntry).equals(readFileSync(distEntry)));

        let cfg = null;
        try { cfg = JSON.parse(readFileSync(join(root, 'deno-dist', 'deno.json'), 'utf8')); } catch { /* reported below */ }
        check('deno.json parses with deno.window lib (Deno.serve + window globals, no worker lib)',
            !!cfg && Array.isArray(cfg.compilerOptions?.lib) && cfg.compilerOptions.lib.includes('deno.window'));

        const bundle = existsSync(stagedEntry) ? readFileSync(stagedEntry, 'utf8') : '';
        check('bundle: Deno.serve present (import.meta.main gated)', bundle.includes('Deno.serve'));
        check('bundle: node:fs import preserved EXTERNAL (disk shim needs Deno node-compat)',
            /['"]node:fs['"]/.test(bundle));
        check('bundle: web libsql client pinned (URL_SCHEME_NOT_SUPPORTED marker)', bundle.includes(WEB_LIBSQL_MARKER));
        check('bundle: native libsql client absent', !NATIVE_LIBSQL.test(bundle));
        check('bundle: qstash client bundled', bundle.includes(QSTASH_MARKER));

        // Staged statics inside the deploy root (deployctl ships this tree).
        check('staged: deno-dist/console-dist/frontbase-admin/index.html',
            existsSync(join(root, 'deno-dist', 'console-dist', 'frontbase-admin', 'index.html')));
        check('staged: deno-dist/console-dist/react/hydrate.js',
            existsSync(join(root, 'deno-dist', 'console-dist', 'react', 'hydrate.js')));
        check('staged: deno-dist/console-dist/icon.png', existsSync(join(root, 'deno-dist', 'console-dist', 'icon.png')));
    } else {
        check(`unknown host "${String(host)}" (expected vercel|deno)`, false);
    }

    const failures = checks.filter((c) => !c.ok).map((c) => c.label);
    return { ok: failures.length === 0, checks, failures };
}

const printReport = (host, r) => {
    console.log(`\n=== verify-host-artifact: ${host} ===`);
    for (const c of r.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
    console.log(r.ok ? 'artifact gate: PASS ✅' : `artifact gate: FAIL ❌ (${r.failures.length})`);
};

// ---- CLI ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const args = process.argv.slice(2);
    const eqForm = args.find((a) => a.startsWith('--host='))?.split('=')[1];
    const flagIdx = args.indexOf('--host');
    const host = eqForm ?? (flagIdx >= 0 ? args[flagIdx + 1] : undefined);
    if (host !== 'vercel' && host !== 'deno') {
        console.error('usage: node scripts/verify-host-artifact.mjs --host <vercel|deno> [--dry-run]');
        process.exit(2);
    }
    const r = verifyHostArtifact(host);
    printReport(host, r);
    if (!r.ok) for (const f of r.failures) console.error(`  → ${f}`);
    if (r.ok && args.includes('--dry-run')) {
        console.log('\n✓ dry-run: artifact verified. No host calls made.');
    }
    process.exit(r.ok ? 0 : 1);
}
