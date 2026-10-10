/** Diagnostic only: copies the existing real-handler probe, never updates its ledger. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'compat-conformance.mjs');
const ledgerPath = join(here, '../contracts/behavior.ledger.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = readFileSync(sourcePath, 'utf8');
const ledgerBytes = readFileSync(ledgerPath);
const ledger = JSON.parse(ledgerBytes);
const output = mkdtempSync(join(tmpdir(), 'frontbase-r2-isolation-'));
const replaceOnce = (source, anchor, replacement) => {
    assert.equal(source.split(anchor).length, 2, `unique diagnostic anchor: ${anchor}`);
    return source.replace(anchor, replacement);
};
const targetOperations = [
    'GET /api/storage/compute-size', 'GET /api/storage/list',
    'DELETE /api/storage/providers/{provider_id}',
    'GET /api/edge-queues/', 'GET /api/edge-vectors/',
    'GET /api/agent/settings', 'GET /api/auth-forms/primary/',
    'GET /api/settings/redis/', 'POST /api/edge-databases/reset-role-password',
    'POST /api/project/assets/upload/', 'POST /api/edge-vectors/{vector_id}/test',
];
const runs = [];
async function run(name, transform, fixtureAdjustment = '', sourceAdjustment = (source) => source) {
    let source = replaceOnce(original, 'const behavior = [];', 'const behavior = [];\nconst diagnosticResponses = [];');
    source = replaceOnce(source, "const baseRunner = sqliteRunner(':memory:');",
        `const blockedGlobalFetch = [];\nconst fixtureRequests = [];\nglobalThis.fetch = async (input) => { blockedGlobalFetch.push(input instanceof Request ? input.url : String(input)); throw new Error('R2 diagnostic blocks unconfigured global transport'); };\nconst baseRunner = sqliteRunner(':memory:');`);
    source = replaceOnce(source, 'return { res, body: responseBody };',
        `fixtureRequests.push({ method, path, httpStatus: res.status, body: responseBody });\n    return { res, body: responseBody };`);
    source = replaceOnce(source, 'for (const { path, method, op } of entries) {',
        `${transform}\nfor (const { path, method, op } of entries) {`);
    source = replaceOnce(source, 'const rawBody = await res.clone().text();',
        `const rawBody = await res.clone().text();\n    diagnosticResponses.push({ operation: label, httpStatus: res.status, body: rawBody, sql: sqlTrace.slice(), provider: providerTrace.slice(), request: replay ? { path: replay.requestPath, query: replay.query } : null });`);
    source = replaceOnce(source, 'const total = entries.length;',
        `console.log('__R2_DIAGNOSTIC__' + JSON.stringify({ behavior, responses: diagnosticResponses, buckets, blockedGlobalFetch, fixtureRequests }));\nconst total = entries.length;`);
    if (fixtureAdjustment) source = replaceOnce(source, 'const fixture = await prepareFixture(path, method, op);',
        `const fixture = await prepareFixture(path, method, op);\n${fixtureAdjustment}`);
    source = sourceAdjustment(source);
    const path = join(here, `.behavior-isolation-${randomUUID()}.mjs`);
    writeFileSync(path, source);
    try {
        const result = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [path, '--behavior', '--behavior-gate'], { cwd: join(here, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '', stderr = '';
            child.stdout.on('data', (chunk) => { stdout += chunk; });
            child.stderr.on('data', (chunk) => { stderr += chunk; });
            child.on('error', reject);
            child.on('close', (code) => resolve({ code, stdout, stderr }));
        });
        writeFileSync(join(output, `${name}.log`), result.stdout + '\n' + result.stderr);
        const encoded = result.stdout.split(/\r?\n/).find((line) => line.startsWith('__R2_DIAGNOSTIC__'));
        assert.ok(encoded, `${name}: probe completed its measurements`);
        const measurement = JSON.parse(encoded.slice('__R2_DIAGNOSTIC__'.length));
        const drift = measurement.behavior.filter((entry) => JSON.stringify(ledger[entry.operation]) !== JSON.stringify({ status: entry.status, evidence: entry.evidence }));
        const counts = Object.fromEntries(['functional', 'shape-only', 'external-disabled', 'stub'].map((status) => [status, measurement.behavior.filter((entry) => entry.status === status).length]));
        const record = { name, code: result.code, counts, drift, ...measurement };
        runs.push(record);
        console.log(JSON.stringify({ name, code: result.code, counts, drift: drift.length, unreachable: measurement.buckets.UNREACHABLE.length }));
        return record;
    } finally {
        unlinkSync(path);
        assert.equal(hash(readFileSync(sourcePath)), hash(original));
        assert.equal(hash(readFileSync(ledgerPath)), hash(ledgerBytes));
    }
}

const forward = await run('forward', '');
const reverse = await run('reverse', 'entries.reverse();');
for (const operation of targetOperations) {
    await run(`isolated-${targetOperations.indexOf(operation)}`, `entries.splice(0, entries.length, ...entries.filter(({ path, method }) => method.toUpperCase() + ' ' + path === ${JSON.stringify(operation)}));`);
}
const select = (operation) => `entries.splice(0, entries.length, ...entries.filter(({ path, method }) => method.toUpperCase() + ' ' + path === ${JSON.stringify(operation)}));`;
const storageSeed = `
const account = await createFixture('/api/edge-providers/', { name: 'Isolated account', provider: 'cloudflare', provider_credentials: { token: 'invented-token' } });
const provider = await createFixture('/api/storage/providers/', { name: 'Isolated provider', provider: 'local', provider_account_id: fixtureId(account) });
const seedProviderId = fixtureId(provider);
const bucket = await createFixture('/api/storage/buckets?provider_id=' + seedProviderId, { name: 'isolated-seeded-bucket', provider: 'local' });
const seedBucketId = fixtureId(bucket);
await runner.exec('INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)', ['isolated-file', '_default', seedBucketId, '/sized.txt', 'sized.txt', 42, 'text/plain', '2026-01-01T00:00:00.000Z']);
`;
for (const operation of targetOperations.slice(0, 3)) {
    const result = await run('seeded-' + targetOperations.indexOf(operation), select(operation) + storageSeed,
        `fixture.params.provider_id = seedProviderId; fixture.query.set('provider_id', seedProviderId); fixture.query.set('bucket', seedBucketId);`);
    assert.equal(result.responses[0].httpStatus, 200);
    const body = JSON.parse(result.responses[0].body);
    if (operation.endsWith('compute-size')) assert.equal(body.size, 42);
    if (operation.endsWith('/list')) assert.ok(result.responses[0].body.includes('sized.txt'));
}
for (const kind of ['queues', 'vectors']) {
    const body = kind === 'queues' ? { name: 'Seeded queue', provider: 'qstash', queue_url: 'https://probe.example/seeded-queue' }
        : { name: 'Seeded vector', provider: 'turso', vector_url: 'https://probe.example/seeded-vector' };
    const result = await run('seeded-' + kind, select('GET /api/edge-' + kind + '/')
        + `await createFixture('/api/edge-${kind}/', ${JSON.stringify(body)});`);
    assert.equal(result.responses[0].httpStatus, 200);
    assert.ok(result.responses[0].body.includes(body.name));
}
const seededAgent = await run('seeded-agent', select('GET /api/agent/settings')
    + `await requestJson('PUT', '/api/agent/settings', { general: { temperature: 0.23 }, system: {} });`);
assert.equal(JSON.parse(seededAgent.responses[0].body).settings.general.temperature, 0.23);
const seededAuth = await run('seeded-auth-primary', select('GET /api/auth-forms/primary/')
    + `await createFixture('/api/auth-forms/', { name: 'Seeded primary', type: 'login', config: { is_primary: true }, is_active: true });`);
assert.equal(JSON.parse(seededAuth.responses[0].body).success, true);
const acceptedAsset = await run('accepted-asset', select('POST /api/project/assets/upload/'), '',
    (source) => replaceOnce(source, "'probe.txt');", "'probe.png');"));
assert.equal(acceptedAsset.responses[0].httpStatus, 200);
assert.equal(JSON.parse(acceptedAsset.responses[0].body).success, true);
const byOperation = (run) => new Map(run.behavior.map((entry) => [entry.operation, entry]));
const forwardMap = byOperation(forward), reverseMap = byOperation(reverse);
const orderDeltas = forward.behavior.filter((entry) => JSON.stringify(entry) !== JSON.stringify(reverseMap.get(entry.operation)))
    .map((entry) => ({ operation: entry.operation, forward: entry, reverse: reverseMap.get(entry.operation) }));
const isolatedDeltas = runs.slice(2).map((run) => ({ name: run.name, isolated: run.behavior[0], forward: forwardMap.get(run.behavior[0]?.operation), response: run.responses[0] }));
const identities = Object.fromEntries([
    sourcePath, ledgerPath, join(here, '../dist/compat/app.js'),
    join(here, '../dist/compat/routes/storage.js'), join(here, '../dist/compat/routes/edge-generic.js'),
    join(here, '../dist/compat/routes/auth-forms.js'),
].map((path) => [path, hash(readFileSync(path))]));
const countOnlyDrifts = forward.drift.filter((entry) => entry.status === ledger[entry.operation]?.status
    && entry.evidence.replace(/\d+ SQL observations?/g, '<count> SQL observations')
        === ledger[entry.operation].evidence.replace(/\d+ SQL observations?/g, '<count> SQL observations'));
writeFileSync(join(output, 'evidence.json'), JSON.stringify({ identities, runs, orderDeltas, isolatedDeltas, countOnlyDrifts }, null, 2));
console.log(JSON.stringify({ output, orderDeltas: orderDeltas.length, orderClassificationDeltas: orderDeltas.filter((entry) => entry.forward.status !== entry.reverse?.status).length, sourceAndLedgerUnchanged: true }));
