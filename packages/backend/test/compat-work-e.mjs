/**
 * CF-22 Work E regression proof.
 *
 * E1: a local audit-row write must not masquerade as a real node execution.
 * E3: Tier-1 database/RLS/storage routes must demonstrate datasource/provider
 * effects, not merely return successful shapes.
 */
import { strict as assert } from 'node:assert';
import { unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
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
        systemResources: options.systemResources,
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
    assert.deepEqual(distinct.data, ['home']);

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
    // Console contract: byte-transfer ops carry provider_id and the client is
    // resolved per-op from the connected account's stored (encrypted) credentials —
    // an env-wired provider never receives them. A local S3-mock stands in for the
    // object host so the signed requests run for real.
    const objects = new Map();
    const s3mock = createServer((incoming, res) => {
        const key = (incoming.url ?? '/').split('?')[0].replace(/^\/+/, '');
        if (incoming.method === 'PUT') {
            const chunks = [];
            incoming.on('data', (chunk) => chunks.push(chunk));
            incoming.on('end', () => {
                // CopyObject (server-side move) — body unused, source in the header.
                const copySource = incoming.headers['x-amz-copy-source'];
                if (typeof copySource === 'string') {
                    const src = objects.get(copySource.replace(/^\/+/, ''));
                    if (!src) { res.writeHead(404).end('NoSuchKey'); return; }
                    objects.set(key, src);
                } else {
                    objects.set(key, Buffer.concat(chunks));
                }
                res.writeHead(200).end();
            });
        } else if (incoming.method === 'GET') {
            const bytes = objects.get(key);
            if (!bytes) { res.writeHead(404).end('not_found'); return; }
            res.writeHead(200).end(bytes);
        } else if (incoming.method === 'DELETE') {
            objects.delete(key);
            res.writeHead(204).end();
        } else {
            res.writeHead(405).end();
        }
    });
    await new Promise((resolve) => s3mock.listen(0, '127.0.0.1', resolve));
    const s3Endpoint = `http://127.0.0.1:${s3mock.address().port}`;
    const objectText = (bucket, key) => {
        const bytes = objects.get(`${bucket}/${key.replace(/^\/+/, '')}`);
        return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
    };

    // Env-wired provider stays in the harness: a provider_id op must NOT leak into it.
    const storage = memoryStorageProvider();
    const { app, setTenant } = await harness({ storageProvider: storage });
    try {
        const accountResponse = await request(app, 'POST', '/api/edge-providers/', {
            name: 'Tenant A S3 Account',
            provider: 's3',
            config: {
                accessKeyId: 'access-key',
                secretAccessKey: 'must-never-leak',
                endpoint: s3Endpoint,
            },
        });
        assert.equal(accountResponse.status, 201);
        const account = await accountResponse.json();

        const providerResponse = await request(app, 'POST', '/api/storage/providers/', {
            name: 'Tenant A Object Storage',
            provider_account_id: account.id,
        });
        assert.equal(providerResponse.status, 201);
        const provider = await providerResponse.json();
        assert.ok(provider.id);
        // Product parity: the provider response exposes `config` (redacted to {}), not a
        // `has_config` flag. The secret must never appear in the serialized response.
        assert.ok(provider.config !== undefined);
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
        assert.equal(bucketResponse.status, 200, JSON.stringify(bucket));
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
        assert.equal(uploaded.path, 'docs/original.txt');
        assert.equal(objectText(sourceBucket, 'docs/original.txt'), 'provider-backed-content');
        // Resolved through the account, NOT the env-wired provider.
        assert.equal(storage._store.size, 0);

        // Console shape (FileBrowser api.ts): sourceKey/destinationKey + both
        // buckets — no file id, no `bucket` key. Server-side copy + delete.
        const moved = await request(app, 'POST', '/api/storage/move', {
            provider_id: provider.id,
            sourceKey: 'docs/original.txt',
            destinationKey: 'docs/moved.txt',
            sourceBucket: sourceBucket,
            destBucket: sourceBucket,
        });
        const movedBody = await moved.json();
        assert.equal(moved.status, 200);
        assert.equal(movedBody.success, true);
        assert.equal(movedBody.message, 'File moved');
        assert.equal(objectText(sourceBucket, 'docs/original.txt'), undefined);
        assert.equal(objectText(sourceBucket, 'docs/moved.txt'), 'provider-backed-content');

        // Console shape: flat product response — no data wrapper, no job.
        const cross = await (await request(app, 'POST', '/api/storage/move-cross', {
            source_provider_id: provider.id,
            source_bucket: sourceBucket,
            source_key: 'docs/moved.txt',
            dest_provider_id: provider.id,
            dest_bucket: 'target-bucket',
            dest_key: 'docs/moved.txt',
        })).json();
        assert.equal(cross.success, true);
        assert.equal(cross.source, `${sourceBucket}/docs/moved.txt`);
        assert.equal(cross.destination, 'target-bucket/docs/moved.txt');
        assert.equal(cross.bytes, 'provider-backed-content'.length);
        assert.equal(cross.data, undefined);
        assert.equal(objectText('target-bucket', 'docs/moved.txt'), 'provider-backed-content');
        const status = await request(app, 'GET', '/api/storage/move-status/00000000-0000-4000-8000-000000000000');
        assert.equal(status.status, 404);
        assert.equal((await status.json()).detail, 'Move job not found');

        const signed = await (await request(
            app,
            'GET',
            `/api/storage/signed-url?provider_id=${provider.id}&bucket=target-bucket&path=docs%2Fmoved.txt`,
        )).json();
        assert.ok(signed.signedUrl.startsWith(s3Endpoint), `unexpected signed url ${signed.signedUrl}`);
        assert.match(signed.signedUrl, /X-Amz-Signature=/);

        // Console shape: {paths, bucket, provider_id} → bare {success: true}.
        const deleted = await request(app, 'DELETE', '/api/storage/delete', {
            provider_id: provider.id,
            paths: ['docs/moved.txt'],
            bucket: 'target-bucket',
        });
        const deletedBody = await deleted.json();
        assert.equal(deleted.status, 200);
        assert.equal(deletedBody.success, true);
        assert.equal(deletedBody.message, undefined);
        assert.equal(objectText('target-bucket', 'docs/moved.txt'), undefined);

        setTenant('tenant-b');
        const providers = await (await request(app, 'GET', '/api/storage/providers/')).json();
        assert.equal(providers.some((entry) => entry.id === provider.id), false);
        const crossTenantUrl = await request(
            app,
            'GET',
            `/api/storage/signed-url?provider_id=${provider.id}&bucket=target-bucket&path=docs%2Fmoved.txt`,
        );
        assert.equal(crossTenantUrl.status, 404);
    } finally {
        s3mock.close();
    }
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

test('system resources: tabs reflect host-declared truth (CF default = D1 only, others empty)', async () => {
    const { app } = await harness();

    // Default descriptor = the Cloudflare worker's reality: the database tab
    // carries a system card for the bound D1, appended LAST (product parity).
    const databases = await (await request(app, 'GET', '/api/edge-databases/')).json();
    assert.equal(databases.length, 1);
    const systemDb = databases[databases.length - 1];
    assert.equal(systemDb.id, 'local-database');
    assert.equal(systemDb.is_system, true);
    assert.equal(systemDb.provider, 'cloudflare');
    assert.equal(systemDb.db_url, 'd1://system-d1');
    assert.equal(systemDb.name, 'Cloudflare D1');
    assert.equal(systemDb.target_count, 1);
    assert.equal(systemDb.linked_engines[0].id, 'local-edge');
    assert.equal(systemDb.linked_engines[0].provider, 'cloudflare'); // real engine, not 'unknown'

    // No KV/Queues/Vectorize are bound on the worker → NO system cards → the
    // console renders its honest empty states. (The old fixtures claimed
    // "Local Redis"/"Local BullMQ"/"Local Vector (libSQL)" unconditionally.)
    for (const path of ['/api/edge-caches/', '/api/edge-queues/', '/api/edge-vectors/']) {
        const rows = await (await request(app, 'GET', path)).json();
        assert.equal(Array.isArray(rows), true, path);
        assert.ok(rows.every((row) => !row.is_system), `${path} must not synthesize system rows`);
    }

    // System rows are synthesized, never stored — single-op routes 404 on them.
    assert.equal((await request(app, 'DELETE', '/api/edge-databases/local-database')).status, 404);
});

test('system resources: a host descriptor overrides the platform truth (node self-host)', async () => {
    // The Node/Docker entry declares a local SQLite file and nothing else.
    const { app } = await harness({
        systemResources: {
            database: { provider: 'sqlite', name: 'SQLite (libsql)', url: 'file:/data/app.db' },
            cache: null,
            queue: null,
            vector: null,
        },
    });
    const databases = await (await request(app, 'GET', '/api/edge-databases/')).json();
    assert.equal(databases.length, 1);
    assert.equal(databases[0].provider, 'sqlite');
    assert.equal(databases[0].name, 'SQLite (libsql)');
    assert.equal(databases[0].db_url, 'file:/data/app.db');
    // And a host that declares NOTHING gets no database card at all — honest
    // empty state on every tab.
    const bare = await harness({ systemResources: {} });
    const bareDatabases = await (await request(bare.app, 'GET', '/api/edge-databases/')).json();
    assert.deepEqual(bareDatabases, []);
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

test('imported page keeps its layout (POST /api/pages/ with layoutData is stored)', async () => {
    const { app } = await harness();
    // The product's page import sends layoutData (camelCase); the create handler
    // used to read body.layout_data (snake_case) and silently drop it, so imported
    // pages came in empty.
    const layoutData = { content: [{ type: 'Heading', props: { content: 'Imported', level: 'h1' } }], root: {} };
    const created = await (await request(app, 'POST', '/api/pages/', {
        name: 'Imported', slug: 'imported', title: 'I', layoutData,
    })).json();
    const pageId = created.data.id;
    const got = await (await request(app, 'GET', `/api/pages/${pageId}/`)).json();
    assert.deepEqual(got.data.layoutData, layoutData, 'an imported page layout must be stored, not dropped');
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
