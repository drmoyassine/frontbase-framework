import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyHostArtifact } from './verify-host-artifact.mjs';
import { deploymentEnvironment } from './deploy-environment.mjs';

// Native template rewriting only populated existing resource fields in the live button flow.
// Assert a complete handoff shape and prohibit borrowing an account's real resource IDs.
const nativeTemplate=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
const d1=nativeTemplate.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
const kv=nativeTemplate.match(/\[\[kv_namespaces\]\]([\s\S]*?)(?=\n\[|$)/)?.[1]??'';
assert.match(d1,/binding\s*=\s*"DB"/);assert.match(d1,/database_name\s*=\s*"[^"\r\n]+"/);
assert.match(d1,/database_id\s*=\s*"00000000-0000-0000-0000-000000000000"/);
assert.match(kv,/binding\s*=\s*"FRONTBASE_KV"/);assert.match(kv,/\bid\s*=\s*"00000000000000000000000000000000"/);
assert.ok(!/^\s*account_id\s*=|HYPERDRIVE/m.test(nativeTemplate),'portable root cannot borrow a deployment account or cloud database');
const nativeDeploy=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts.deploy;
assert.match(nativeDeploy,/--config wrangler\.toml/);assert.match(nativeDeploy,/--experimental-auto-create=false/,'native deployment must refuse unassigned resources instead of creating duplicates');
console.log('PASS portable native template: complete replaceable D1/KV fields and inert resource IDs');

const root = mkdtempSync(join(tmpdir(), 'frontbase-deploy-gates-'));
const config = JSON.parse(readFileSync(new URL('../examples/cf-full/vercel.json', import.meta.url), 'utf8'));
const bundle = '// URL_SCHEME_NOT_SUPPORTED qstash.upstash.io\n' + '// node-compatible fixture\n'.repeat(5000) + 'export default { fetch() {} }';
const paths = ['dist/vercel.mjs', 'api/cms.mjs', 'console-dist/frontbase-admin/index.html', 'console-dist/react/hydrate.js', 'console-dist/icon.png'];
function reset() {
    for (const p of paths) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), p.endsWith('.mjs') ? bundle : 'fixture'); }
    writeFileSync(join(root, 'vercel.json'), JSON.stringify(config));
}
function gate() { return verifyHostArtifact('vercel', { exampleRoot: root }); }
function refused(label, fault) { reset(); fault(); const result = gate(); assert.equal(result.ok, false, label); console.log('PASS refuse: ' + label); }
try {
    reset(); assert.equal(gate().ok, true, JSON.stringify(gate().failures));
    console.log('PASS accept: Node handler and committed Vercel array routing');
    refused('legacy Node req/res export', () => { for(const p of paths.slice(0,2))writeFileSync(join(root,p),bundle.replace('export default { fetch() {} }','export default function handler() {}')); });
    refused('Edge runtime export', () => { for (const p of paths.slice(0,2)) writeFileSync(join(root,p), bundle + ';export const config = {runtime:"edge"};'); });
    refused('platform slash removal loops with backend canonical API routes',()=>writeFileSync(join(root,'vercel.json'),JSON.stringify({...config,trailingSlash:false})));
    refused('obsolete phased rewrites', () => writeFileSync(join(root,'vercel.json'), JSON.stringify({...config,rewrites:{fallback:config.rewrites}})));
    refused('branding route shadow', () => { const r=structuredClone(config);r.rewrites[1].source='/static/assets/:file*';writeFileSync(join(root,'vercel.json'),JSON.stringify(r)); });
    refused('catch-all before assets', () => { const r=structuredClone(config);r.rewrites.reverse();writeFileSync(join(root,'vercel.json'),JSON.stringify(r)); });
    refused('missing hydration asset', () => rmSync(join(root,paths[3])));
    refused('stale uploaded API bytes', () => writeFileSync(join(root,paths[1]),'stale'));
    refused('native libSQL dependency', () => { for(const p of paths.slice(0,2))writeFileSync(join(root,p),bundle+';/* @libsql/win32-x64-msvc */'); });
    refused('extra stale API function',()=>writeFileSync(join(root,'api','stale.mjs'),bundle));rmSync(join(root,'api','stale.mjs'));
    const env=deploymentEnvironment({SETUP_TOKEN:'fixture-capability',SETUP_EXPIRES_AT:'2026-10-20T00:30:00Z',SESSION_SECRET:'fixture-secret',UNRELATED_SECRET:'must-not-upload',APP_DB_URL:'',ADMIN_EMAIL:undefined});
    assert.deepEqual(Object.keys(env).sort(), ['SESSION_SECRET','SETUP_EXPIRES_AT','SETUP_TOKEN']);
    assert.equal(env.SETUP_EXPIRES_AT,'2026-10-20T00:30:00Z');
    console.log('PASS environment: setup expiry retained, unrelated/empty values omitted');
} finally { rmSync(root,{recursive:true,force:true}); }
