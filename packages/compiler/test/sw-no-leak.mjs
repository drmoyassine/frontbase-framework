/**
 * SEC-1 regression — the emitted SW bundle must NOT contain any server-side
 * `execute` source (secrets, DB calls, etc.). Builds a project exactly like the
 * scaffold (pages.ts + queries.ts with a secret inside execute + a browser
 * manifest via buildBrowserManifest) and asserts the secret is absent from the
 * bundled sw.js.
 */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSwBundle, emitBrowserManifest } from '../dist/emit/swBundle.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const edgeCoreSrc = join(process.cwd(), '..', 'edge-core', 'src', 'index.ts').split('\\').join('/');
const dir = mkdtempSync(join(tmpdir(), 'fb-noleak-'));
mkdirSync(join(dir, 'src'), { recursive: true });

const SECRET = 'sk-SUPER-SECRET-DB-PASSWORD-9931';

// The SERVER-SIDE query with a secret inside execute (never for the browser).
const pages = { '/': { title: 'T', slug: 't', queryId: 'sample.list', layout: { root: {}, content: [] } } };
const queries = {
    'sample.list': {
        scope: 'public',
        execute: async () => { const DB_PASSWORD = SECRET; return [{ pw: DB_PASSWORD }]; },
    },
};

// Emit the browser manifest as STATIC data (the scaffold's gen-manifest step).
const gen = emitBrowserManifest({ pages, queries }, join(dir, 'src', 'manifest.browser.js'));
const emittedSource = readFileSync(gen.path, 'utf8');
check('emitted browser manifest is executor-free (no execute key)', !emittedSource.includes('execute'));
check('emitted browser manifest has no secret', !emittedSource.includes(SECRET));

// sw entry imports ONLY the static browser manifest — never queries.js.
writeFileSync(join(dir, 'src', 'sw.js'),
    `import { createEngine, proxyProvider, attachServiceWorker } from '${edgeCoreSrc}';
    import { manifest } from './manifest.browser.js';
    const engine = createEngine({ manifest, data: proxyProvider('/api/data'), environment: 'service-worker' });
    attachServiceWorker(self, engine, manifest);`);

const res = await emitSwBundle({ entry: join(dir, 'src', 'sw.js'), projectRoot: dir, outDir: join(dir, 'dist') });

check('SW bundle does NOT contain the secret value', !res.code.includes(SECRET));
check('SW bundle does NOT contain the DB_PASSWORD identifier', !res.code.includes('DB_PASSWORD'));
// Executor canary, shape-aware: the engine's edge data proxy reserves the
// queryId "execute" for the compat layer's batch endpoint (engine.ts
// `if (queryId === 'execute')`), so the quoted string literal legitimately
// appears in every routed SW bundle. A LEAK looks different — esbuild keeps
// property names and call sites, so a bundled executor surfaces as `execute:`
// or `execute(`, which never matches the quoted-literal form. Requiring every
// occurrence to be quoted therefore stays lethal for real leakage while
// tolerating the one reserved literal (and prose strings, which are data).
const executeHits = (res.code.match(/execute/g) ?? []).length;
const quotedExecuteHits = (res.code.match(/['"]execute['"]/g) ?? []).length;
check(`SW bundle carries no executor (every "execute" is a string literal: ${executeHits} hit(s), ${quotedExecuteHits} quoted)`,
    executeHits === quotedExecuteHits);
check('SW bundle still boots (has SW primitives)', res.code.includes('addEventListener'));

if (res.code.includes(SECRET)) {
    const i = res.code.indexOf(SECRET);
    console.log('    LEAK CONTEXT:', JSON.stringify(res.code.slice(i - 60, i + 60)));
}

console.log(failures === 0 ? '\nsw-no-leak: PASS ✅' : `\nsw-no-leak: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
