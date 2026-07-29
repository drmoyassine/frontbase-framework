/**
 * CF-22 Work E regression proof.
 *
 * E1: a local audit-row write must not masquerade as a real node execution.
 * E3: Tier-1 database/RLS/storage routes must demonstrate datasource/provider
 * effects, not merely return successful shapes.
 */
import { strict as assert } from 'node:assert';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompatApp } from '../dist/compat/app.js';
import { datasourceRunner } from '../dist/db/datasource-runner.js';
import { migrateUp } from '../dist/db/migrations.js';
import { memoryStorageProvider, sqliteRunner } from '@frontbase/edge-infra';

const temporaryFiles = new Set();
process.on('exit', () => {
    for (const file of temporaryFiles) {
        try { unlinkSync(file); } catch { /* SQLite may already have removed it. */ }
    }
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function request(app, method, path, body) {
    const init = { method };
    if (body instanceof FormData) {
        init.body = body;
    } else if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
    }
    return app.fetch(new Request(`http://work-e.local${path}`, init));
}

async function harness(options = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    let tenant = 'tenant-a';
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({
            user: { id: `${tenant}-owner`, role: 'master_admin' },
            tenant,
        }),
        sessionSecret: 'cf22-work-e-test-secret',
        now: () => '2026-07-29T00:00:00.000Z',
        externalFetch: options.externalFetch,
        storageProvider: options.storageProvider,
    });
    return {
        app,
        runner,
        setTenant(value) { tenant = value; },
    };
}

test('E1: test-node refuses exactly as the product does, and records no execution', async () => {
    const { app, runner } = await harness();
    const draft = await (await request(app, 'POST', '/api/actions/drafts', {
        name: 'Node test audit',
        nodes: [],
        edges: [],
    })).json();
    const draftId = draft.id ?? draft.data?.id;
    assert.ok(draftId);

    // Probed against a live self-host product (2026-07-29). With a REAL draft and no
    // edge engine reachable it answers 503 with this exact detail; with an absent
    // draft it answers 404 first. E1's original 200-plus-error-row was truthful but
    // was not the product's answer, and the console branches on the status.
    const absent = await request(
        app,
        'POST',
        '/api/actions/drafts/00000000-0000-4000-8000-000000000000/test-node/node-1',
    );
    assert.equal(absent.status, 404);
    assert.deepEqual(await absent.json(), { detail: 'Draft not found' });

    const response = await request(
        app,
        'POST',
        `/api/actions/drafts/${draftId}/test-node/node-1`,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
        detail: 'Edge Engine connection lost during node execution',
    });

    // E1's actual guarantee, and the reason this test exists: refusing must not leave
    // a fabricated execution behind. Nothing ran, so nothing may be recorded — least
    // of all a completed one.
    const rows = await runner.query(
        'SELECT status FROM workflow_executions WHERE tenant_slug = ?',
        ['tenant-a'],
    );
    assert.deepEqual(rows, [], 'a refused node test must record no execution at all');
});

test('E3 database: configured datasource data shapes the response and stays tenant-scoped', async () => {
    const { app, setTenant } = await harness();
    const file = join(tmpdir(), `frontbase-work-e-${crypto.randomUUID()}.db`);
    temporaryFiles.add(file);
    const url = `file:${file.replaceAll('\\', '/')}`;
    const datasource = datasourceRunner('sqlite', { url });
    await datasource.exec('CREATE TABLE published_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT)');
    await datasource.exec(
        'INSERT INTO published_pages (id, slug, title) VALUES (?,?,?)',
        ['page-1', 'home', 'Home'],
    );
    const created = await request(app, 'POST', '/api/sync/datasources/', {
        name: 'Tenant A SQLite',
        type: 'sqlite',
        config: { url },
    });
    assert.equal(created.status, 201);

    const tables = await (await request(app, 'GET', '/api/database/tables/')).json();
    assert.equal(tables.success, true);
    assert.ok(tables.data.tables.some((table) => table.name === 'published_pages'));

    const schema = await (await request(
        app,
        'GET',
        '/api/database/table-schema/published_pages/',
    )).json();
    assert.ok(schema.data.columns.some((column) => column.name === 'title'));

    const data = await (await request(
        app,
        'GET',
        '/api/database/table-data/published_pages/',
    )).json();
    assert.deepEqual(data.data, [{ id: 'page-1', slug: 'home', title: 'Home' }]);

    const distinct = await (await request(app, 'POST', '/api/database/distinct-values/', {
        tableName: 'published_pages',
        column: 'slug',
    })).json();
    assert.deepEqual(distinct.values, ['home']);

    // The isolation claim is that tenant-b sees NONE of tenant-a's tables — not that
    // it gets an error envelope. The product answers an unconfigured tenant with
    // `{"success":true,"data":{"tables":[]},"message":null,"error":null}` (probed
    // 2026-07-29), so asserting success:false would fail the moment we matched it.
    setTenant('tenant-b');
    const isolated = await (await request(app, 'GET', '/api/database/tables/')).json();
    assert.equal(isolated.success, true);
    assert.deepEqual(isolated.data.tables, [], 'tenant-b must not see tenant-a tables');
});

test('E3 database/RLS: named RPCs perform guarded provider calls with service credentials', async () => {
    const calls = [];
    const externalFetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({
            url,
            method: init.method ?? 'GET',
            authorization: new Headers(init.headers).get('authorization'),
            body: init.body ? JSON.parse(String(init.body)) : null,
        });
        const payload = url.includes('frontbase_list_rls_policies')
            ? [{ table_name: 'published_pages', policy_name: 'owners_only' }]
            : url.includes('frontbase_get_rls_status')
                ? [{ table_name: 'published_pages', rls_enabled: true }]
                : url.includes('frontbase_get_schema_info')
                    ? [{ table_name: 'published_pages' }]
                    : { success: true, message: 'provider mutation completed', policies: [] };
        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };
    const { app } = await harness({ externalFetch });
    const created = await request(app, 'POST', '/api/sync/datasources/', {
        name: 'Tenant A Supabase',
        type: 'supabase',
        config: {
            url: 'https://tenant-a.supabase.co',
            anonKey: 'public-anon-key',
            serviceKey: 'private-service-key',
        },
    });
    assert.equal(created.status, 201);

    const advanced = await (await request(app, 'POST', '/api/database/advanced-query/', {
        rpcName: 'frontbase_get_schema_info',
        params: { schema: 'public' },
    })).json();
    assert.equal(advanced.success, true);
    assert.equal(advanced.rows[0].table_name, 'published_pages');

    assert.equal((await request(app, 'GET', '/api/database/rls/policies/')).status, 200);
    assert.equal((await request(app, 'GET', '/api/database/rls/tables/')).status, 200);
    const oneTable = await (await request(
        app,
        'GET',
        '/api/database/rls/policies/published_pages',
    )).json();
    assert.equal(oneTable.data[0].policy_name, 'owners_only');
    assert.equal((await request(app, 'POST', '/api/database/rls/policies/', {
        tableName: 'published_pages',
        policyName: 'owners_only',
        operation: 'select',
        usingExpression: 'owner_id = auth.uid()',
    })).status, 201);
    assert.equal((await request(
        app,
        'PUT',
        '/api/database/rls/policies/published_pages/owners_only',
        { operation: 'select', usingExpression: 'owner_id = auth.uid()' },
    )).status, 200);
    assert.equal((await request(
        app,
        'DELETE',
        '/api/database/rls/policies/published_pages/owners_only',
    )).status, 200);
    assert.equal((await request(
        app,
        'POST',
        '/api/database/rls/tables/published_pages/toggle/',
        { enable: true },
    )).status, 200);
    assert.equal((await request(app, 'POST', '/api/database/rls/batch/', {
        policyBaseName: 'owners',
        tableRules: [{
            tableName: 'published_pages',
            operation: 'select',
            usingExpression: 'owner_id = auth.uid()',
        }],
    })).status, 200);
    assert.equal((await request(app, 'POST', '/api/database/rls/bulk-delete/', {
        policies: [{ tableName: 'published_pages', policyName: 'owners_only' }],
    })).status, 200);

    const rpcNames = calls.map((call) => call.url.split('/').pop());
    for (const expected of [
        'frontbase_get_schema_info',
        'frontbase_list_rls_policies',
        'frontbase_get_rls_status',
        'frontbase_create_rls_policy',
        'frontbase_update_rls_policy',
        'frontbase_drop_rls_policy',
        'frontbase_toggle_table_rls',
        'frontbase_create_rls_policies_batch',
    ]) {
        assert.ok(rpcNames.includes(expected), `missing provider call ${expected}`);
    }
    for (const call of calls) {
        assert.equal(call.authorization, 'Bearer private-service-key');
        assert.ok(call.url.startsWith('https://tenant-a.supabase.co/rest/v1/rpc/'));
    }
});

test('E3 storage: upload/move/cross-move/delete change provider bytes and metadata', async () => {
    const storage = memoryStorageProvider();
    const { app, setTenant } = await harness({ storageProvider: storage });

    const accountResponse = await request(app, 'POST', '/api/edge-providers/', {
        name: 'Tenant A S3 Account',
        provider: 's3',
        config: {
            accessKeyId: 'access-key',
            secretAccessKey: 'must-never-leak',
        },
    });
    assert.equal(accountResponse.status, 201);
    const account = await accountResponse.json();

    const providerResponse = await request(app, 'POST', '/api/storage/providers/', {
        name: 'Tenant A Object Storage',
        provider_account_id: account.id,
        config: {
            accessKeyId: 'access-key',
            secretAccessKey: 'must-never-leak',
        },
    });
    assert.equal(providerResponse.status, 201);
    const provider = await providerResponse.json();
    assert.ok(provider.id);
    assert.equal(provider.has_config, true);
    assert.equal(JSON.stringify(provider).includes('must-never-leak'), false);

    const bucketResponse = await request(
        app,
        'POST',
        `/api/storage/buckets?provider_id=${provider.id}`,
        {
        name: 'Source',
        provider: 's3',
        },
    );
    const bucket = await bucketResponse.json();
    assert.equal(bucketResponse.status, 201, JSON.stringify(bucket));
    const sourceBucket = bucket.bucket.id;

    const form = new FormData();
    form.set('bucket', sourceBucket);
    form.set('provider_id', provider.id);
    form.set('path', 'docs/original.txt');
    form.set('file', new File(['provider-backed-content'], 'original.txt', {
        type: 'text/plain',
    }));
    const uploaded = await (await request(app, 'POST', '/api/storage/upload', form)).json();
    assert.equal(uploaded.success, true);
    assert.equal(
        new TextDecoder().decode(
            (await storage.get(sourceBucket, 'docs/original.txt')).bytes,
        ),
        'provider-backed-content',
    );

    const moved = await request(app, 'POST', '/api/storage/move', {
        provider_id: provider.id,
        file_id: uploaded.data.id,
        bucket_id: sourceBucket,
        from_path: 'docs/original.txt',
        to_path: 'docs/moved.txt',
    });
    assert.equal(moved.status, 200);
    await assert.rejects(storage.get(sourceBucket, 'docs/original.txt'), /not_found/);
    assert.equal(
        new TextDecoder().decode((await storage.get(sourceBucket, 'docs/moved.txt')).bytes),
        'provider-backed-content',
    );

    const cross = await (await request(app, 'POST', '/api/storage/move-cross', {
        source_provider_id: provider.id,
        dest_provider_id: provider.id,
        file_id: uploaded.data.id,
        source_bucket_id: sourceBucket,
        target_bucket_id: 'target-bucket',
    })).json();
    assert.equal(cross.success, true);
    assert.equal(
        new TextDecoder().decode((await storage.get('target-bucket', 'docs/moved.txt')).bytes),
        'provider-backed-content',
    );
    const status = await (await request(
        app,
        'GET',
        `/api/storage/move-status/${cross.data.job_id}`,
    )).json();
    assert.equal(status.data.status, 'completed');

    const signed = await (await request(
        app,
        'GET',
        `/api/storage/signed-url?provider_id=${provider.id}&bucket=target-bucket&path=docs%2Fmoved.txt`,
    )).json();
    assert.match(signed.url, /^memory:\/\//);

    const deleted = await request(app, 'DELETE', '/api/storage/delete', {
        provider_id: provider.id,
        file_id: uploaded.data.id,
    });
    assert.equal(deleted.status, 200);
    await assert.rejects(storage.get('target-bucket', 'docs/moved.txt'), /not_found/);

    setTenant('tenant-b');
    const providers = await (await request(app, 'GET', '/api/storage/providers/')).json();
    assert.equal(providers.some((entry) => entry.id === provider.id), false);
    const crossTenantUrl = await request(
        app,
        'GET',
        `/api/storage/signed-url?provider_id=${provider.id}&bucket=target-bucket&path=docs%2Fmoved.txt`,
    );
    assert.equal(crossTenantUrl.status, 404);
});

test('system edge: self-aware Cloudflare engine is the default publish target for pages & workflows', async () => {
    const { app } = await harness();

    // The main list surfaces the system edge FIRST, self-aware of its provider and
    // the real D1 binding (not the old product-docker defaults Local SQLite/Redis/BullMQ).
    const list = await (await request(app, 'GET', '/api/edge-engines/')).json();
    const system = list[0];
    assert.equal(system.id, 'local-edge');
    assert.equal(system.is_system, true);
    assert.equal(system.provider, 'cloudflare');
    assert.equal(system.edge_db_name, 'Cloudflare D1');
    assert.equal(system.edge_db_id, 'system-d1'); // truthy → counts as full-bundle w/ a database
    assert.equal(system.is_active, true);

    // The publish-target listing MUST include it (it was excluded → "No active
    // publish targets"). Listed first, so the console preselects it as the default.
    const targets = await (await request(app, 'GET', '/api/edge-engines/active/by-scope/full')).json();
    assert.equal(targets[0].id, 'local-edge');
    assert.ok(targets.some((e) => e.edge_db_id));

    // Single-get resolves the system engine.
    const one = await (await request(app, 'GET', '/api/edge-engines/local-edge')).json();
    assert.equal(one.id, 'local-edge');
    assert.equal(one.provider, 'cloudflare');

    // Page publish to the system edge succeeds (the worker IS the engine).
    const page = await (await request(app, 'POST', '/api/pages/', {
        name: 'System-edge page', slug: 'system-edge', title: 'System',
    })).json();
    const pageId = page.data.id;
    const pagePub = await request(app, 'POST', `/api/pages/${pageId}/publish/local-edge/`);
    assert.equal(pagePub.status, 200, await pagePub.clone().text());

    // Workflow publish to the system edge succeeds (single-target).
    const draft = await (await request(app, 'POST', '/api/actions/drafts', {
        name: 'System-edge workflow', nodes: [], edges: [],
    })).json();
    const draftId = draft.id ?? draft.data?.id;
    const wfPub = await request(app, 'POST', `/api/actions/drafts/${draftId}/publish/local-edge/`);
    assert.equal(wfPub.status, 200, await wfPub.clone().text());
    assert.equal((await wfPub.json()).success, true);

    // An unknown engine id is still rejected — the system edge is the only
    // always-valid local target; everything else must resolve to a stored engine.
    assert.equal((await request(app, 'POST', `/api/pages/${pageId}/publish/does-not-exist/`)).status, 404);
    assert.equal((await request(app, 'POST', `/api/actions/drafts/${draftId}/publish/does-not-exist/`)).status, 404);
});

test('page layout persists across save + reload (PUT /api/pages/{id}/ carries layoutData)', async () => {
    const { app } = await harness();
    const created = await (await request(app, 'POST', '/api/pages/', {
        name: 'Layout persist', slug: 'layout-persist', title: 'L',
    })).json();
    const pageId = created.data.id;
    // The product Save PUTs the FULL page (incl. layoutData) to /api/pages/{id}/.
    // update() used to merge only metadata and silently drop layout_data, so a
    // refresh re-fetched an empty canvas.
    const layoutData = { content: [{ type: 'heading', props: { text: 'Hello' } }], root: {} };
    const saved = await request(app, 'PUT', `/api/pages/${pageId}/`, {
        name: 'Layout persist', slug: 'layout-persist', layoutData,
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const reloaded = await (await request(app, 'GET', `/api/pages/${pageId}/`)).json();
    assert.deepEqual(reloaded.data.layoutData, layoutData, 'layout must survive a save + reload');
});

test('workflow flips to published after publish (is_published tracks publish, not just active)', async () => {
    const { app } = await harness();
    const draft = await (await request(app, 'POST', '/api/actions/drafts', {
        name: 'Publish-state workflow', nodes: [], edges: [],
    })).json();
    const draftId = draft.id ?? draft.data?.id;
    // A fresh draft is NOT published.
    const before = await (await request(app, 'GET', `/api/actions/drafts/${draftId}`)).json();
    assert.equal(before.is_published, false);
    // Publish to the system edge.
    const pub = await request(app, 'POST', `/api/actions/drafts/${draftId}/publish/local-edge/`);
    assert.equal(pub.status, 200, await pub.clone().text());
    // After publish the draft is published — the badge shows Active, not Draft.
    const after = await (await request(app, 'GET', `/api/actions/drafts/${draftId}`)).json();
    assert.equal(after.is_published, true);
    assert.equal(after.is_active, true);
});

let failures = 0;for (const [name, fn] of tests) {
    try {
        await fn();
        console.log(`  PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`  FAIL ${name}\n    ${error.stack ?? error.message}`);
    }
}
console.log(`compat-work-e: ${tests.length - failures}/${tests.length} passed`);
if (failures) process.exit(1);
