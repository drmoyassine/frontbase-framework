/**
 * CF-22 P2 Wave 1 — conformance for the console-core tags (Meta, settings, Themes,
 * project, security-events). Every response is validated against the VENDORED
 * contract Zod (the product's own schema), proving the framework handlers emit
 * product-shaped bodies. variables is covered by compat-variables.mjs (P1).
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import {
    zRootStatus, zHealthStatus, zQueueHealth,
    zGeneralSettings, zPrivacySettingsOutput, zSecuritySettings, zRedisSettings,
    zRedisTestResult, zTelemetryAck, zLicenseValidationResponse, zAdminInviteResponse,
    zComponentThemeOut, zProjectResponse,
} from '../dist/compat/zod.gen.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

async function makeApp({ externalFetch } = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    return createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'owner', role: 'owner' }, tenant: '_default' }),
        sessionSecret: 'frontbase-test-session-secret',
        externalFetch,
        now: () => '2026-07-15T00:00:00Z',
        includeProductRoot: true,
    });
}
const req = (app, method, path, body, form) =>
    app.fetch(new Request('http://api.local' + path, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : (form ?? undefined),
    }));

// ---- Meta (unauthenticated health) ----
test('Meta: GET /health / queue-health conform (and need no auth)', async () => {
    const runner = sqliteRunner(':memory:'); await migrateUp(runner);
    const anon = await createCompatApp({ makeRunner: async () => runner, resolvePrincipal: async () => ({ user: null, tenant: undefined }), includeProductRoot: true });
    zRootStatus.parse(await (await req(anon, 'GET', '/')).json());
    zHealthStatus.parse(await (await req(anon, 'GET', '/health')).json());
    zQueueHealth.parse(await (await req(anon, 'GET', '/api/queue/health')).json());
});

// ---- settings ----
test('settings: GET each domain returns defaults conformantly', async () => {
    const app = await makeApp();
    zGeneralSettings.parse(await (await req(app, 'GET', '/api/settings/general')).json());
    zPrivacySettingsOutput.parse(await (await req(app, 'GET', '/api/settings/privacy/')).json());
    zSecuritySettings.parse(await (await req(app, 'GET', '/api/settings/security/')).json());
    zRedisSettings.parse(await (await req(app, 'GET', '/api/settings/redis/')).json());
});

test('settings: PUT general round-trips conformantly', async () => {
    const app = await makeApp();
    const body = { siteName: 'Acme', siteUrl: 'https://acme.test', defaultLanguage: 'fr', timezone: 'Europe/Paris' };
    const r = await req(app, 'PUT', '/api/settings/general', body);
    assert.equal(r.status, 200);
    zGeneralSettings.parse(await r.json());
    const back = await (await req(app, 'GET', '/api/settings/general')).json();
    assert.equal(back.siteName, 'Acme');
});

test('settings: action endpoints return conformant acks', async () => {
    let authorization = '';
    const app = await makeApp({
        externalFetch: async (_input, init) => {
            authorization = String(new Headers(init?.headers).get('authorization') ?? '');
            return Response.json({ result: 'PONG' });
        },
    });
    const redisPut = await req(app, 'PUT', '/api/settings/redis/', {
        redis_url: 'https://example.upstash.io',
        redis_token: 'upstash-secret',
        redis_type: 'upstash',
        redis_enabled: true,
        cache_ttl_data: 300,
        cache_ttl_count: 300,
    });
    assert.equal(redisPut.status, 200);
    assert.equal((await redisPut.json()).redis_token, '');
    const redis = await req(app, 'POST', '/api/settings/redis/test/', {});
    assert.equal(redis.status, 200);
    zRedisTestResult.parse(await redis.json());
    assert.equal(authorization, 'Bearer upstash-secret');
    zTelemetryAck.parse(await (await req(app, 'POST', '/api/settings/telemetry', {
        install_id: 'compat-wave1',
        edition: 'community',
        page_count: 0,
        automation_count: 0,
        data_sources: [],
        storage_providers: [],
        email_providers: [],
    })).json());
    zLicenseValidationResponse.parse(await (await req(app, 'POST', '/api/settings/validate-license', {
        license_key: 'community',
        install_id: 'compat-wave1',
    })).json());
    zAdminInviteResponse.parse(await (await req(app, 'POST', '/api/settings/invites', {
        email: 'invited-admin@example.com',
        role: 'admin',
    })).json());
});

// ---- Themes ----
test('Themes: create → list → delete conform to ComponentThemeOut', async () => {
    const app = await makeApp();
    const created = await (await req(app, 'POST', '/api/themes/', { name: 'Dark', component_type: 'button', styles_data: { color: '#000' } })).json();
    zComponentThemeOut.parse(created);
    const list = await (await req(app, 'GET', '/api/themes/')).json();
    assert.ok(Array.isArray(list) && list.length === 1);
    zComponentThemeOut.parse(list[0]);
    const del = await req(app, 'DELETE', '/api/themes/' + created.id);
    assert.equal(del.status, 204);
});

// ---- project ----
test('project: GET/PUT conform to ProjectResponse; upload returns an object', async () => {
    const app = await makeApp();
    zProjectResponse.parse(await (await req(app, 'GET', '/api/project/')).json());
    const put = await req(app, 'PUT', '/api/project/', { name: 'Renamed', appUrl: 'https://x.test' });
    assert.equal(put.status, 200);
    zProjectResponse.parse(await put.json());
    const fd = new FormData(); fd.append('file', new Blob(['x'], { type: 'image/png' }), 'logo.png');
    const up = await req(app, 'POST', '/api/project/assets/upload/', undefined, fd);
    assert.equal(up.status, 200);
    assert.equal((await up.json()).success, true);
});

// ---- security-events ----
test('security-events: list + summary return objects', async () => {
    const app = await makeApp();
    assert.equal((await req(app, 'GET', '/api/security-events/')).status, 200);
    const summary = await (await req(app, 'GET', '/api/security-events/summary')).json();
    assert.ok(typeof summary.total === 'number');
});

// Runner
let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\ncompat-wave1: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
