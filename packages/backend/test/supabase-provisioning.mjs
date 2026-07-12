/**
 * F5c Option A gate (Supabase schema-per-resource provisioning).
 * - Non-gated contract checks (always run): handles(), degenerate-name guard.
 * - Credential-gated live DDL round-trip on SUPABASE_URL + SUPABASE_SERVICE_KEY:
 *   create schema → verify exists → drop → verify gone (database + vector).
 * - Route wiring via the P2-c `provisioner` injection seam (mock, no live creds).
 */
import { supabaseProvisioner, supabaseRunner } from '@frontbase/edge-infra';
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---------- 1. Non-gated contract checks ----------
const stub = supabaseProvisioner({ url: 'https://example.supabase.co', serviceKey: 'dummy' });
check("handles('database') = true", stub.handles('database') === true);
check("handles('vector') = true", stub.handles('vector') === true);
check("handles('cache') = false (CF-only)", stub.handles('cache') === false);
check("handles('engine') = false", stub.handles('engine') === false);

// Degenerate name → create throws before any DDL (no network call).
try { await stub.create('database', '!!!'); check('degenerate name → create throws', false); }
catch { check('degenerate name → create throws (no DDL footgun)', true); }

// ---------- 2. Route wiring via the provisioner injection seam (mock) ----------
// A spy that records create/remove without doing real DDL — proves the route calls
// the Supabase-shaped provisioner end-to-end (the live DDL is covered in block 3).
const spyCalls = [];
const spyProvisioner = {
    handles: (k) => k === 'database' || k === 'vector',
    async create(kind, name) {
        const remoteId = `frontbase_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        spyCalls.push({ op: 'create', kind, name, remoteId });
        return { provisioned: true, remoteId, info: { provider: 'supabase', kind } };
    },
    async remove(kind, remoteId) { spyCalls.push({ op: 'remove', kind, remoteId }); },
};
const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    now: () => `2026-07-13T00:00:${String(clock++).padStart(2, '0')}Z`,
    provisioner: spyProvisioner,
});
const req = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b),
}));
const put = await req('PUT', '/edge-resources/vec1', { kind: 'vector', name: 'embeddings' });
const putBody = await put.json();
check('route: vector provisioned via injected provisioner', putBody.provisioned === true);
check('route: status flips to provisioned', (await (await req('GET', '/edge-resources')).json()).resources[0].status === 'provisioned');
await req('DELETE', '/edge-resources/vec1');
const removeCall = spyCalls.find((s) => s.op === 'remove');
check('route: delete invoked provisioner.remove (de-provision)', !!removeCall && removeCall.remoteId === putBody.remoteId);

// ---------- 3. Credential-gated live DDL round-trip ----------
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const live = supabaseProvisioner({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY });
    const probeRunner = supabaseRunner({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_KEY });
    const rnd = Math.random().toString(36).slice(2, 8);
    const schemaExists = async (schema) => {
        const rows = await probeRunner.query(
            'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
            [schema],
        );
        return rows.length > 0;
    };

    // database → schema
    const dbName = `sprint probe ${rnd}`;
    const db = await live.create('database', dbName);
    check('live database: provisioned + remoteId', db.provisioned === true && typeof db.remoteId === 'string');
    check('live database: schema exists', await schemaExists(db.remoteId));
    await live.remove('database', db.remoteId);
    check('live database: schema gone after remove', !(await schemaExists(db.remoteId)));

    // vector → schema + pgvector + vectors table
    const vecName = `sprint vec ${rnd}`;
    const vec = await live.create('vector', vecName);
    check('live vector: provisioned + remoteId', vec.provisioned === true);
    check('live vector: schema exists', await schemaExists(vec.remoteId));
    const tableRows = await probeRunner.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2',
        [vec.remoteId, 'vectors'],
    );
    check('live vector: vectors table created', tableRows.length === 1);
    await live.remove('vector', vec.remoteId);
    check('live vector: schema gone after remove', !(await schemaExists(vec.remoteId)));
} else {
    console.log('  (live Supabase DDL: credential-gated — set SUPABASE_URL/SUPABASE_SERVICE_KEY to run)');
}

console.log(failures === 0 ? '\nsupabase-provisioning: PASS ✅' : `\nsupabase-provisioning: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
