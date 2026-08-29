/**
 * A-25 Phase 4 — cloud serving plane: the tenancy/serving pure modules and the
 * anonymous data-plane tenant resolution (the `requestTenant` dep on
 * CreateCompatAppDeps → data-execute instead of the `_root` fallback).
 *
 * RULE 8 target: the `tenant_slug` predicate inside
 * resolvePublishedPageForTenant and the scopePrincipalToHost strip — both
 * mutation-proven in test/mutation.mjs (cloud-serving entries).
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { UserStore } from '../dist/db/users.js';
import { createCompatApp } from '../dist/compat/app.js';
import {
    resolvePublishedPageForTenant, tenantHostState, scopePrincipalToHost,
} from '../dist/tenancy/serving.js';
import { seedPlanCatalog, tenantPlanId } from '../dist/compat/plans/catalog.js';

const NOW = '2026-01-01T00:00:00.000Z';
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const cipher = await createSecretCipher('cloud-serving-test-secret-0123456789');
const pages = (t) => new PagesStore(runner, t);

// ── seed two tenants with distinct published content ──
const tenants = new TenantStore(runner);
for (const [slug, name] of [['acme', 'Acme'], ['globex', 'Globex']]) {
    await tenants.createTenant(slug, name, NOW);
    await tenants.updateTenant(slug, { plan: 'free', status: 'active' });
    await pages(slug).ensureHomepage(NOW);
}
const acmeHome = (await pages('acme').list()).find((r) => r.is_homepage === 1);
await pages('acme').update(acmeHome.id, { layoutData: { root: {}, content: [{ id: 'h', type: 'Text', props: { content: 'acme-home-marker' } }] } }, NOW);
await runner.exec('UPDATE compat_pages SET is_published = 1 WHERE tenant_slug = ? AND id = ?', ['acme', acmeHome.id]);
const about = await pages('acme').create({ name: 'About', slug: 'about', layout_data: { content: [] } }, 'p-acme-about', NOW);
await runner.exec('UPDATE compat_pages SET is_published = 1 WHERE tenant_slug = ?', ['acme']);

console.log('— resolvePublishedPageForTenant (the tenant_slug predicate) —');
const acmeHomeResolved = await resolvePublishedPageForTenant(runner, 'acme', '/');
check('tenant homepage resolves by is_homepage for THAT tenant', acmeHomeResolved?.title === 'Home');
const aboutResolved = await resolvePublishedPageForTenant(runner, 'acme', '/about');
check('tenant slug page resolves within the tenant', aboutResolved?.slug === 'about');
const globexAbout = await resolvePublishedPageForTenant(runner, 'globex', '/about');
check('missing slug in tenant → null (CLOUD: no fallback option passed)', globexAbout === null);
const leaked = await resolvePublishedPageForTenant(runner, 'globex', '/about', { crossTenantFallback: true });
check('SELF-HOST opt-in still reads across tenants (crossTenantFallback)', leaked?.slug === 'about');
const globexHome = await resolvePublishedPageForTenant(runner, 'globex', '/');
check('second tenant gets its OWN homepage (same slug space per tenant)', globexHome !== null && globexHome.slug === 'home');
const deletedProbe = await pages('acme').create({ name: 'Gone', slug: 'gone', layout_data: { content: [] } }, 'p-acme-gone', NOW);
await pages('acme').softDelete(deletedProbe.id, NOW);
await runner.exec('UPDATE compat_pages SET is_published = 1 WHERE tenant_slug = ? AND id = ?', ['acme', deletedProbe.id]);
check('soft-deleted page is never served', (await resolvePublishedPageForTenant(runner, 'acme', '/gone')) === null);

console.log('— tenantHostState (registered-tenant gate input; negatives never cached) —');
const activeState = await tenantHostState(runner, 'acme');
check('registered + active → {found:true, status:"active"}', activeState.found === true && activeState.status === 'active');
const missingState = await tenantHostState(runner, 'nosuch');
check('unregistered slug → {found:false} (no status to cache)', missingState.found === false && missingState.status === undefined);
const plainState = await tenantHostState(runner, 'plain-co');
check('unregistered-but-valid slug → found:false', plainState.found === false);
await tenants.createTenant('plain-co', 'Plain Co', NOW);
const nullStatus = await tenantHostState(runner, 'plain-co');
check('registered with NULL status → found + undefined status (gate must reject)', nullStatus.found === true && nullStatus.status === undefined);

console.log('— scopePrincipalToHost (correction 2: the private-page cross-tenant hole) —');
const principal = { user: { id: 'u1' }, tenant: 'acme' };
check('host undefined (self-host/foreign) → principal unchanged', scopePrincipalToHost(principal, undefined) === principal);
check('host == tenant → unchanged', scopePrincipalToHost(principal, 'acme') === principal);
const scoped = scopePrincipalToHost(principal, 'globex');
check('host ≠ tenant → user stripped, tenant cleared', scoped !== principal && scoped.user === null && scoped.tenant === undefined);
check('scoping never mutates the original principal', principal.user !== null && principal.tenant === 'acme');

console.log('— anonymous data plane: requestTenant replaces the `_root` fallback —');
// One sqlite file per tenant with a `notes` table holding a tenant marker, so
// a request through the compat app proves WHICH tenant's datasource served it.
const dir = mkdtempSync(join(tmpdir(), 'cloud-serving-'));
const seedDs = async (tenant, label) => {
    const file = join(dir, `${tenant}.db`).replaceAll('\\', '/');
    const dsRunner = sqliteRunner(`file:${file}`);
    await dsRunner.exec('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, marker TEXT)');
    await dsRunner.exec('DELETE FROM notes');
    await dsRunner.exec('INSERT INTO notes (marker) VALUES (?)', [label]);
    const store = new SyncStore(runner, tenant, cipher);
    const ds = await store.createDatasource({ name: `${tenant} db`, kind: 'sqlite', config: { url: `file:${file}` } }, `ds-${tenant}`, NOW);
    return ds.id;
};
const acmeDs = await seedDs('acme', 'acme-data');
const globexDs = await seedDs('globex', 'globex-data');

const dataRequestFor = (dsId) => ({
    dataRequest: {
        fetchStrategy: 'proxy',
        datasourceId: dsId,
        body: { query: 'SELECT marker FROM notes', params: [] },
    },
});

const app = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: 'cloud-serving-test-secret-0123456789',
    userStoreFor: (t) => new UserStore(runner, t),
    now: () => NOW,
    requestTenant: async (req) => {
        const host = req.headers.get('host') ?? '';
        return host.startsWith('acme.') ? 'acme' : host.startsWith('globex.') ? 'globex' : undefined;
    },
});
const call = (host, body, headers = {}) => app.fetch(new Request('https://' + host + '/api/data/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host, ...headers },
    body: JSON.stringify(body),
}));
const markerOf = async (r) => {
    const j = await r.json();
    return j?.data?.[0]?.marker;
};

const acmeRes = await call('acme.frontbase.test', dataRequestFor(acmeDs));
check('anonymous execute on acme host reads ACME\'s datasource', acmeRes.status === 200 && (await markerOf(acmeRes.clone())) === 'acme-data');
const globexRes = await call('globex.frontbase.test', dataRequestFor(globexDs));
check('anonymous execute on globex host reads GLOBEX\'s datasource', globexRes.status === 200 && (await markerOf(globexRes.clone())) === 'globex-data');
const stolen = await call('acme.frontbase.test', dataRequestFor(globexDs));
check('cross-tenant datasourceId on acme host is denied (403)', stolen.status === 403);
const selfHostShape = await call('acme.frontbase.test', dataRequestFor('ds-_root'));
check('unknown datasource in the resolved tenant → 403 (not `_root` leak)', selfHostShape.status === 403);

// Authenticated callers keep principal priority over the host fallback.
const authedApp = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: 'cloud-serving-test-secret-0123456789',
    userStoreFor: (t) => new UserStore(runner, t),
    now: () => NOW,
    resolvePrincipal: async () => ({ user: { id: 'u9' }, tenant: 'globex' }),
    requestTenant: async () => 'acme',
});
const authed = await authedApp.fetch(new Request('https://acme.frontbase.test/api/data/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'acme.frontbase.test' },
    body: JSON.stringify(dataRequestFor(globexDs)),
}));
check('authenticated principal tenant WINS over the host tenant', authed.status === 200 && (await markerOf(authed.clone())) === 'globex-data');
const authedSteal = await authedApp.fetch(new Request('https://acme.frontbase.test/api/data/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'acme.frontbase.test' },
    body: JSON.stringify(dataRequestFor(acmeDs)),
}));
check('authenticated caller cannot reach another tenant\'s datasource either', authedSteal.status === 403);

console.log('— plan catalog smoke (full coverage in cloud-plan-gates, WA5) —');
const seeded = await seedPlanCatalog(runner, NOW);
check('seedPlanCatalog seeds the free plan once', seeded.includes('free') && (await seedPlanCatalog(runner, NOW)).length === 0);
check('tenantPlanId reads tenants.plan', (await tenantPlanId(runner, 'acme')) === 'free' && (await tenantPlanId(runner, 'plain-co')) === null);

console.log(failures === 0 ? 'cloud-serving: PASS ✅' : `cloud-serving: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
