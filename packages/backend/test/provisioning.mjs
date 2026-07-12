/**
 * Edge-resource provisioning gate (Phase 3a / F5). Proves the create route invokes
 * a real provisioner when it handles the kind, stores the remoteId in config, and
 * falls back to config-only for unhandled kinds. Uses a mock provisioner (the real
 * CF provisioner is the same interface, verified credential-gated).
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner, noopProvisioner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A mock provisioner that "creates" databases + caches + vectors, records removes.
const created = new Map();
const removed = [];
const mockProvisioner = {
    handles: (kind) => kind === 'database' || kind === 'cache' || kind === 'vector',
    async create(kind, name) {
        if (!mockProvisioner.handles(kind)) return { provisioned: false };
        const id = `mock-${kind}-${name}`;
        created.set(id, { kind, name });
        return { provisioned: true, remoteId: id, info: { provider: 'mock', kind } };
    },
    async remove(kind, id) { removed.push({ kind, id }); created.delete(id); },
};

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let clock = 0;

// Inject the mock provisioner via the provisioner injection seam (P2-c).
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    now: () => `2026-07-13T00:00:${String(clock++).padStart(2, '0')}Z`,
    provisioner: mockProvisioner,
});

const req = (method, path, body) => app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
}));

// ---- 1. Mock provisioner interface (the seam the route calls) ----
const r = await mockProvisioner.create('database', 'mydb');
check('mock provisions a database', r.provisioned === true && r.remoteId === 'mock-database-mydb');
check('mock handles database+cache+vector', mockProvisioner.handles('database') && mockProvisioner.handles('cache') && mockProvisioner.handles('vector'));
check('mock does NOT handle engine', !mockProvisioner.handles('engine'));
const bad = await mockProvisioner.create('engine', 'x');
check('unhandled kind → provisioned=false', bad.provisioned === false);

// ---- 2. noopProvisioner (default) handles nothing ----
check('noop handles nothing', !noopProvisioner.handles('database') && !noopProvisioner.handles('cache'));
check('noop create → provisioned=false', (await noopProvisioner.create('database', 'x')).provisioned === false);

// ---- 3. Provisioned resource create (mock provisioner) — remoteId stored ----
const put = await req('PUT', '/edge-resources/res1', { kind: 'database', name: 'My DB' });
const putBody = await put.json();
check('PUT edge-resource (provisioned) → 200', put.status === 200);
check('mock provisioned the resource', putBody.provisioned === true);
check('remoteId returned', typeof putBody.remoteId === 'string');
const list = await req('GET', '/edge-resources');
const listBody = await list.json();
check('resource recorded', listBody.resources.length === 1);
check('resource status = provisioned', listBody.resources[0].status === 'provisioned');
const cfg = JSON.parse(listBody.resources[0].config || '{}');
check('config carries the remoteId', typeof cfg.remoteId === 'string');

// ---- 4. vector kind provisions (F5b) ----
const vput = await req('PUT', '/edge-resources/vec1', { kind: 'vector', name: 'embeddings' });
const vputBody = await vput.json();
check('vector kind provisioned (F5b)', vputBody.provisioned === true);

// ---- 5. De-provision on delete (P2-c orphan fix) — remove(kind, remoteId) called ----
await req('DELETE', '/edge-resources/res1');
check('delete called provisioner.remove with kind + remoteId', removed.length === 1 && removed[0].kind === 'database' && removed[0].id === putBody.remoteId);
const afterList = await (await req('GET', '/edge-resources')).json();
check('resource row gone after delete', afterList.resources.length === 1 && afterList.resources[0].id === 'vec1');

// ---- 6. Deleting a config-only resource (no remoteId) doesn't call remove ----
const beforeCfgOnly = removed.length;
await req('PUT', '/edge-resources/cfgonly', { kind: 'engine', name: 'cfg-only' }); // engine → config-only
await req('DELETE', '/edge-resources/cfgonly');
check('config-only delete does NOT call remove', removed.length === beforeCfgOnly);

console.log(failures === 0 ? '\nprovisioning: PASS ✅' : `\nprovisioning: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
