/**
 * Work A semantic regression gate.
 *
 * Contract-shape conformance alone cannot detect handlers that return plausible
 * constants. This gate proves the synchronizer mutates a real datasource,
 * introspects native relationships, sends webhooks, extracts WordPress content,
 * and enforces the single-use Sheets callback capability.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

const tempDir = mkdtempSync(join(tmpdir(), 'frontbase-sync-'));
const datasourceUrl = `file:${join(tempDir, 'datasource.sqlite').replaceAll('\\', '/')}`;
const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const datasourceRunner = sqliteRunner(datasourceUrl);
await datasourceRunner.exec('PRAGMA foreign_keys = ON');
await datasourceRunner.exec('CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
await datasourceRunner.exec(
    'CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, FOREIGN KEY(parent_id) REFERENCES parents(id))',
);
await datasourceRunner.exec("INSERT INTO parents (id, name) VALUES ('parent-1', 'Parent One')");
await datasourceRunner.exec("INSERT INTO children (id, parent_id, title) VALUES ('child-1', 'parent-1', 'Original')");

const outbound = [];
const externalFetch = async (input, init = {}) => {
    const url = String(input);
    outbound.push({ url, method: String(init.method ?? 'GET'), body: init.body });
    if (url.includes('/discover')) {
        return Response.json({ post_types: [{ name: 'post' }], site: { name: 'Real fixture' } });
    }
    if (url.includes('/extract/post')) {
        return Response.json({ records: [{ id: 7, title: 'Imported post' }], total: 1, total_pages: 1 });
    }
    return Response.json({ received: true });
};

let callbackTriedSessionAuth = false;
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async (request) => {
        if (new URL(request.url).pathname.endsWith('/sheets/connect/callback/')) {
            callbackTriedSessionAuth = true;
            throw new Error('callback_must_not_require_browser_session');
        }
        return { user: { id: 'owner-a', role: 'owner' }, tenant: 'tenant-a' };
    },
    sessionSecret: 'sync-functional-test-secret',
    externalFetch,
    now: () => new Date().toISOString(),
});

async function request(method, path, body) {
    const response = await app.fetch(new Request(`http://sync.test${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { response, body: await response.clone().json().catch(() => null) };
}

{
    const created = await request('POST', '/api/sync/datasources/', {
        name: 'Functional SQLite',
        type: 'sqlite',
        config: { url: datasourceUrl },
    });
    assert.equal(created.response.status, 201);
    const datasourceId = created.body.id;

    const schema = await request('GET', `/api/sync/datasources/${datasourceId}/tables/children/schema/`);
    assert.equal(schema.response.status, 200);
    assert.equal(schema.body.columns.some((column) => column.name === 'title'), true);
    assert.equal(schema.body.foreign_keys[0].referenced_table, 'parents');

    const relations = await request('GET', `/api/sync/datasources/${datasourceId}/relationships/`);
    assert.equal(relations.response.status, 200);
    assert.equal(relations.body.relationships[0].from_table, 'children');
    assert.equal(relations.body.relationships[0].to_table, 'parents');
    const displayRelationship = await request(
        'POST',
        `/api/sync/datasources/${datasourceId}/relationships/`,
        {
            from_table: 'children',
            from_column: 'parent_id',
            to_table: 'parents',
            to_column: 'id',
            display_column: 'name',
            relationship_type: 'many_to_one',
        },
    );
    assert.equal(displayRelationship.response.status, 201);

    const injected = await request(
        'GET',
        `/api/sync/datasources/${datasourceId}/tables/children%22%20UNION%20SELECT%20*%20FROM%20parents--/data/`,
    );
    assert.ok(injected.response.status === 400 || injected.response.status === 404);
    assert.equal((await datasourceRunner.query('SELECT COUNT(*) AS total FROM parents'))[0].total, 1);

    const inserted = await request('POST', `/api/sync/datasources/${datasourceId}/tables/children/records/`, {
        id: 'child-2',
        parent_id: 'parent-1',
        title: 'Created',
    });
    assert.equal(inserted.body.success, true);
    const patched = await request('PATCH', `/api/sync/datasources/${datasourceId}/tables/children/records/child-2`, {
        title: 'Patched',
    });
    assert.equal(patched.body.success, true);
    assert.equal((await datasourceRunner.query("SELECT title FROM children WHERE id='child-2'"))[0].title, 'Patched');

    const filters = encodeURIComponent(JSON.stringify([{ field: 'parent_id', operator: 'eq', value: 'parent-1' }]));
    const data = await request(
        'GET',
        `/api/sync/datasources/${datasourceId}/tables/children/data/?filters=${filters}&search=Patched&sort=title&order=desc`,
    );
    assert.equal(data.response.status, 200);
    assert.equal(data.body.records.length, 1);
    assert.equal(data.body.records[0].id, 'child-2');
    assert.equal(data.body.fk_columns.parent_id.lookup['parent-1'], 'Parent One');
    const aggregate = await request(
        'GET',
        `/api/sync/datasources/${datasourceId}/tables/children/aggregate/?category=parent_id&aggregation=count`,
    );
    assert.equal(aggregate.body.success, true);
    assert.equal(aggregate.body.data[0].value, 2);
    const distinct = await request(
        'GET',
        `/api/sync/datasources/${datasourceId}/tables/children/distinct/title/`,
    );
    assert.equal(distinct.body.data.includes('Patched'), true);

    const search = await request('GET', `/api/sync/datasources/${datasourceId}/search?q=Patched`);
    assert.equal(search.response.status, 200);
    assert.equal(search.body.matches.some((match) => match.table === 'children'), true);

    const view = await request('POST', `/api/sync/datasources/${datasourceId}/views/`, {
        name: 'Children',
        target_table: 'children',
        webhooks: [{ url: 'https://webhook.example/frontbase' }],
    });
    assert.equal(view.response.status, 201);
    const viewPatch = await request('PATCH', `/api/sync/views/${view.body.id}/records?key_column=id`, {
        id: 'child-2',
        title: 'View patched',
    });
    assert.equal(viewPatch.body.success, true);
    assert.equal((await datasourceRunner.query("SELECT title FROM children WHERE id='child-2'"))[0].title, 'View patched');
    const trigger = await request('POST', `/api/sync/views/${view.body.id}/trigger/`, { title: 'Delivered' });
    assert.equal(trigger.body.success, true);
    assert.equal(outbound.some((call) => call.url === 'https://webhook.example/frontbase'), true);

    const wordpress = await request('POST', '/api/sync/datasources/', {
        name: 'WordPress',
        type: 'wordpress_plugin',
        config: {
            api_url: 'https://wordpress.example',
            username: 'wp-user',
            app_password: 'wp-secret-marker',
        },
    });
    const discovery = await request('GET', `/api/sync/datasources/${wordpress.body.id}/wordpress/discover/`);
    assert.equal(discovery.body.post_types[0].name, 'post');
    const imported = await request('POST', '/api/sync/wordpress/import/', {
        datasource_id: wordpress.body.id,
        options: { postTypes: ['post'] },
    });
    assert.equal(imported.response.status, 200);
    const result = await request('GET', `/api/sync/wordpress/import/${imported.body.import_id}/`);
    assert.equal(result.body.status, 'completed');
    assert.equal(result.body.processedRecords, 1);
    assert.equal(result.body.records.post[0].title, 'Imported post');
    assert.equal((await request('GET', '/api/sync/wordpress/import/not-owned/')).response.status, 404);

    // Issuing a connect token mints a single-use capability backed by the
    // sheets_connect_tokens table (migration v16). The raw token is returned to the
    // SPA; only its SHA-256 is persisted. addonInstallUrl is the Google Workspace
    // Marketplace listing (empty default => SPA renders its bundled fallback).
    const issued = await request('POST', '/api/sync/datasources/sheets/connect/issue/', {});
    assert.equal(issued.response.status, 200);
    assert.equal(typeof issued.body.token, 'string');
    assert.ok(issued.body.token.length > 0, 'issue must return a non-empty bearer token');
    assert.equal(typeof issued.body.addonInstallUrl, 'string');
    assert.equal(typeof issued.body.expiresAt, 'string');

    // The CALLBACK's capability check is still live, and it is the security-bearing
    // half of this flow — it runs unauthenticated, so single-use enforcement is the
    // only thing standing between a leaked token and a datasource write. Seed a token
    // the way a configured store would; without this the two assertions below would
    // pass against a 503 and prove nothing.
    const token = 'sheets-capability-under-test';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await runner.exec(
        `INSERT INTO sheets_connect_tokens
             (token_hash, tenant_slug, datasource_id, expires_at, consumed_at, result, created_at)
         VALUES (?,?,NULL,?,NULL,NULL,?)`,
        [
            tokenHash,
            'tenant-a',
            new Date(Date.now() + 600_000).toISOString(),
            new Date().toISOString(),
        ],
    );
    const callbackBody = {
        token,
        spreadsheetId: 'sheet-1',
        spreadsheetName: 'Tenant A Sheet',
        webAppUrl: 'https://script.google.com/macros/s/test/exec',
        webAppSecret: 'sheet-secret-marker',
    };
    const callback = await request('POST', '/api/sync/datasources/sheets/connect/callback/?local_kw=1', callbackBody);
    assert.equal(callback.response.status, 200);
    assert.equal(callbackTriedSessionAuth, false, 'callback incorrectly attempted browser-session auth');
    const replay = await request('POST', '/api/sync/datasources/sheets/connect/callback/?local_kw=1', callbackBody);
    assert.equal(replay.response.status, 401, 'Sheets capability must be single-use');
    const status = await request('GET', `/api/sync/datasources/sheets/connect/status/?token=${token}`);
    assert.equal(status.body.connected, true);
    assert.equal(status.body.accountId, callback.body.accountId);

    const storedConfigs = await runner.query(
        'SELECT config FROM datasources WHERE tenant_slug = ?',
        ['tenant-a'],
    );
    assert.equal(storedConfigs.every((row) => String(row.config).startsWith('enc:')), true);
    assert.equal(JSON.stringify(storedConfigs).includes('wp-secret-marker'), false);
    assert.equal(JSON.stringify(storedConfigs).includes('sheet-secret-marker'), false);

    console.log('compat-sync-functional: PASS');
}
