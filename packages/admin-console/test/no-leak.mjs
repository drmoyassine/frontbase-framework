/**
 * admin-console no-leak gate (RULE 1). The console is a browser SPA; its bundle
 * must contain NO @frontbase/edge-infra or @frontbase/backend server module (no
 * drivers, no secrets). We (1) scan the source for any forbidden import, and
 * (2) bundle the real entry (src/main.tsx) for the browser with a fake server
 * module carrying a canary, and assert the canary + driver names are absent —
 * proving the SPA never pulls server code into the browser bundle.
 */
import * as esbuild from 'esbuild';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// 1. No source file imports a server package.
const importRe = /(?:import|from)\s+['"]@frontbase\/(?:edge-infra|backend)(?:\/[^'"]*)?['"]/;
function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
    return out;
}
const offenders = walk(srcDir).filter((f) => importRe.test(readFileSync(f, 'utf8')));
check('no source imports @frontbase/edge-infra or @frontbase/backend', offenders.length === 0);
if (offenders.length) offenders.forEach((f) => console.log(`     · ${f}`));

// 2. Bundle the real entry with a fake server module; assert the canary/drivers
//    never make it into the browser bundle.
const CANARY = 'EDGE_SERVER_SECRET_hunter2';
const result = await esbuild.build({
    entryPoints: [join(srcDir, 'main.tsx')],
    bundle: true, write: false, platform: 'browser', format: 'esm', minify: true, logLevel: 'silent',
    tsconfig: join(root, 'tsconfig.json'),
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'text' },
    plugins: [{
        name: 'fake-server',
        setup(build) {
            build.onResolve({ filter: /@frontbase\/(?:edge-infra|backend)/ }, () => ({ path: 'server-mod', namespace: 'srv' }));
            build.onLoad({ filter: /.*/, namespace: 'srv' }, () => ({
                contents: `export const DB_PASSWORD='${CANARY}'; export const d1DataProvider=()=>null; export const resolvePrincipal=()=>null;`,
                loader: 'js',
            }));
        },
    }],
});
const out = result.outputFiles[0].text;
check('RULE 1: SPA bundle contains NO server secret canary', !out.includes(CANARY));
check('RULE 1: SPA bundle contains NO d1 driver', !out.includes('d1DataProvider'));
check('RULE 1: SPA bundle contains NO resolvePrincipal', !out.includes('resolvePrincipal'));

console.log(failures === 0 ? '\nno-leak: PASS ✅' : `\nno-leak: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
