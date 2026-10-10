// Local distributable feasibility only. No installed package edits or adoption.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const requireHere = createRequire(import.meta.url);
const requireInfra = createRequire(new URL('../packages/edge-infra/package.json', import.meta.url));
const upstream = dirname(requireInfra.resolve('@neondatabase/serverless'));
const pnpmEntry = process.argv[2] ?? process.env.npm_execpath;
assert.ok(pnpmEntry?.endsWith('pnpm.cjs'), 'pass the installed pnpm.cjs path as the first argument');
const tsc = requireHere.resolve('typescript/bin/tsc');
const root = await mkdtemp(join(tmpdir(), 'frontbase-neon-package-'));
const candidate = join(root, 'candidate');
const consumer = join(root, 'consumer');
const sha = b => createHash('sha256').update(b).digest('hex');
const steps = [];
function run(label, entry, args, cwd, expected = 0) {
  const p = spawnSync(process.execPath, [entry, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  assert.equal(p.status, expected, `${label}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
  steps.push({ label, exit: p.status, stdout: p.stdout, stderr: p.stderr });
  return p;
}
function once(source, a, b) {
  assert.equal(source.split(a).length, 2, `unique patch anchor: ${a}`);
  return source.replace(a, b);
}
async function inventory(dir, prefix = '') {
  const result = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), `refuse dependency symlink ${rel}`);
    if (entry.isDirectory()) Object.assign(result, await inventory(join(dir, entry.name), `${rel}/`));
    else result[rel] = sha(await readFile(join(dir, entry.name)));
  }
  return result;
}
const before = await inventory(upstream);
assert.equal(before['index.mjs'], '2913bd33766e5e9ca954c86d77c3664fc4169b2188cc8de558a07bb04ca0df27');
assert.equal(before['index.js'], '05fae2de1c8db34557d2527793813fcaabd6c1cf2e3fd819237c2f7813968023');
assert.equal(before['index.d.ts'], 'a49b7fb69d355c80745c3586137f91088cf6143cc4a53ef3f2f9e1fbf2407ec5');
assert.equal(before['index.d.mts'], before['index.d.ts']);
await cp(upstream, candidate, { recursive: true, dereference: false });
for (const [file, fn, global] of [['index.mjs', 'cs', 'ce'], ['index.js', 'yr', 'se']]) {
  let code = await readFile(join(candidate, file), 'utf8');
  code = once(code, `function ${fn}(r,{arrayMode:e,fullResults:t,fetchOptions:n,`,
    `function ${fn}(r,{fetchImpl:frontbaseFetch,arrayMode:e,fullResults:t,fetchOptions:n,`);
  code = once(code, `let{fetchEndpoint:Z,fetchFunction:W}=${global},`,
    `let{fetchEndpoint:Z}=${global},W=frontbaseFetch??${global}.fetchFunction,`);
  await writeFile(join(candidate, file), code);
}
const declaration = `export declare interface NeonClientOptions<ArrayMode extends boolean, FullResults extends boolean> extends HTTPTransactionOptions<ArrayMode, FullResults> {
    /** Experimental Frontbase client-scoped transport; selected at client creation. */
    fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

`;
for (const file of ['index.d.ts', 'index.d.mts']) {
  let text = await readFile(join(candidate, file), 'utf8');
  text = once(text, 'export declare interface HTTPTransactionOptions', declaration + 'export declare interface HTTPTransactionOptions');
  text = once(text, ' }?: HTTPTransactionOptions<ArrayMode, FullResults>): NeonQueryFunction',
    ' }?: NeonClientOptions<ArrayMode, FullResults>): NeonQueryFunction');
  await writeFile(join(candidate, file), text);
}
const metadata = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
metadata.name = '@frontbase-experiment/neon-client';
metadata.version = '1.1.0-frontbase-experiment.0';
metadata.private = true;
metadata.scripts = {};
metadata.devDependencies = {};
metadata.files.push('FRONTBASE-EXPERIMENT.md');
await writeFile(join(candidate, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
await writeFile(join(candidate, 'FRONTBASE-EXPERIMENT.md'),
  'Local experiment derived from MIT-licensed @neondatabase/serverless 1.1.0.\n' +
  'Frontbase changes: client-scoped fetchImpl in ESM/CJS and declarations; experimental package metadata.\n' +
  'Not upstream Neon, adopted Frontbase dependency, or published package. Upstream LICENSE is retained.\n');
const after = await inventory(candidate);
assert.equal(after.LICENSE, before.LICENSE);
const changed = Object.keys(before).filter(f => after[f] !== before[f]).sort();
assert.deepEqual(changed, ['index.d.mts', 'index.d.ts', 'index.js', 'index.mjs', 'package.json']);
run('private candidate pack', pnpmEntry, ['pack', '--out', join(root, 'neon-client-experiment.tgz')], candidate);
const archives = (await readdir(root)).filter(f => f.endsWith('.tgz'));
assert.equal(archives.length, 1);
const archive = join(root, archives[0]);
await mkdir(consumer);
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'private-neon-consumer', version: '0.0.0', private: true }));
run('external offline archive install', pnpmEntry, ['add', '--offline', '--ignore-scripts', archive], consumer);
const consumerRequire = createRequire(join(consumer, 'package.json'));
const installedDir = dirname(consumerRequire.resolve(metadata.name));
for (const file of ['index.js', 'index.mjs', 'index.d.ts', 'index.d.mts', 'LICENSE', 'FRONTBASE-EXPERIMENT.md']) {
  assert.equal(sha(await readFile(join(installedDir, file))), after[file], `archive installation changed ${file}`);
}
// pnpm pack normalizes manifest formatting; validate every metadata field instead.
assert.deepEqual(JSON.parse(await readFile(join(installedDir, 'package.json'), 'utf8')), metadata);
const model = `import { neon, type NeonClientOptions } from '@frontbase-experiment/neon-client';
const transport: NonNullable<NeonClientOptions<false, true>['fetchImpl']> = async (input, init) => {
  const request = new Request(input, init);
  return new Response(request.method);
};
const sql = neon('postgresql://invented:invented@ep-a.neon.tech/db', { fetchImpl: transport, fullResults: true });
async function model() {
  const result = await sql.query('SELECT $1', [42]);
  const count: number = result.rowCount;
  const rows: typeof result.rows = result.rows;
  const batch = await sql.transaction([sql.query('SELECT $1', [42])]);
  const batchCount: number = batch[0].rowCount;
  return { count, rows, batchCount };
}
void model;
`;
await writeFile(join(consumer, 'positive.mts'), model);
await writeFile(join(consumer, 'positive.cts'), model);
const config = (mode, include) => ({ compilerOptions: {
  strict: true, skipLibCheck: false, noEmit: true, target: 'ES2022',
  module: mode === 'NodeNext' ? 'NodeNext' : 'ESNext', moduleResolution: mode,
  lib: ['ES2022', 'DOM'], types: [],
}, include });
for (const mode of ['NodeNext', 'Bundler']) {
  const name = `tsconfig-${mode}.json`;
  await writeFile(join(consumer, name), JSON.stringify(config(mode, mode === 'NodeNext' ? ['positive.mts', 'positive.cts'] : ['positive.mts'])));
  run(`strict ${mode} external positive`, tsc, ['-p', name], consumer);
}
await writeFile(join(consumer, 'negative.mts'), `import { neon } from '@frontbase-experiment/neon-client';
neon('postgresql://invented:invented@ep-a.neon.tech/db', { fetchImpl: 42 });
const sql = neon('postgresql://invented:invented@ep-a.neon.tech/db');
sql.query('SELECT 42', [], { fetchImpl: async () => new Response() });
`);
await writeFile(join(consumer, 'tsconfig-negative.json'), JSON.stringify(config('NodeNext', ['negative.mts'])));
const negative = run('wrong hook and unsupported query-level hook rejected', tsc, ['-p', 'tsconfig-negative.json'], consumer, 2);
assert.match(negative.stdout, /negative.mts\(2,/);
assert.match(negative.stdout, /negative.mts\(4,/);
await writeFile(join(consumer, 'runtime.mjs'), `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const original = globalThis.fetch;
let raw = 0;
globalThis.fetch = async () => { raw++; throw new Error('OFFLINE_RAW_DENIED'); };
try {
 const modules = [await import('@frontbase-experiment/neon-client'), createRequire(import.meta.url)('@frontbase-experiment/neon-client')];
 for (const sdk of modules) {
  const originalConfig = sdk.neonConfig.fetchFunction;
  const calls = [];
  const owners = ['a','b'];
  const clients = owners.map(owner => sdk.neon('postgresql://' + owner + ':invented@ep-' + owner + '.neon.tech/db', {
   fetchImpl: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.method,'POST');
    assert.ok(request.headers.get('Neon-Connection-String').startsWith('postgresql://' + owner + ':'));
    assert.deepEqual((await request.json()).params,['42']);
    calls.push(owner);
    return Response.json({command:'UPDATE',rowCount:7,fields:[],rows:[]});
   }, fullResults:true,
  }));
  const results = await Promise.all(clients.map(c => c.query('UPDATE invented SET id=$1',[42])));
  assert.deepEqual(calls,owners);
  assert.deepEqual(results.map(r => [r.rowCount,r.rows]),[[7,[]],[7,[]]]);
  assert.equal(sdk.neonConfig.fetchFunction,originalConfig);
 }
 assert.equal(raw,0);
 console.log('ESM/CJS installed archive: separate owners, POST/auth/params, full-result counts, zero raw calls');
} finally {globalThis.fetch=original;}
`);
run('ESM/CJS installed archive runtime', join(consumer, 'runtime.mjs'), [], consumer);
assert.deepEqual(await inventory(upstream), before, 'installed upstream changed');
const evidence = { experiment: 'private-neon-client-package', upstreamVersion: '1.1.0',
  candidateIdentity: `${metadata.name}@${metadata.version}`, archiveSha256: sha(await readFile(archive)),
  changedFiles: changed, before, after, steps, node: process.version,
  claim: 'Offline typed/distributable feasibility only; no production adoption or release acceptance.' };
await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ evidencePath: join(root, 'evidence.json'), archiveSha256: evidence.archiveSha256,
  changedFiles: changed, steps: steps.map(s => ({ label: s.label, exit: s.exit })), claim: evidence.claim }, null, 2));
