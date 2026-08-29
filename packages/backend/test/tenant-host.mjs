/**
 * A-25 Phase 4 — tenancy core (WA1): host→tenant resolution, product-parity slug
 * validation, migrations v20/v21, TenantStore plan/status.
 *
 * The product reference is `fastapi-backend/app/auth/tenant_provisioning.py`
 * (validate_slug messages are asserted VERBATIM) and
 * `services/edge/src/middleware/tenant.ts` (host prefix parsing).
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import {
    SLUG_RE, RESERVED_SLUGS, PRODUCT_RESERVED_SLUGS, FRAMEWORK_RESERVED_SLUGS,
    extractTenantSlug, normalizeHost, slugValid, slugError, resolveTenantFromHost,
} from '../dist/tenancy/host.js';
import { TenantStore } from '../dist/db/tenants.js';
import { migrateUp, migrateDown, MIGRATIONS } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };
const BASE = 'frontbase.dev';

// ── 1. Host parsing ─────────────────────────────────────────────────────────
console.log('— host resolution —');
check('app host → kind app', extractTenantSlug('app.frontbase.dev', BASE).kind === 'app');
check('tenant host → kind tenant + slug', (() => {
    const r = extractTenantSlug('acme.frontbase.dev', BASE);
    return r.kind === 'tenant' && r.slug === 'acme';
})());
check('apex → kind apex', extractTenantSlug('frontbase.dev', BASE).kind === 'apex');
check('reserved label → kind reserved', extractTenantSlug('api.frontbase.dev', BASE).kind === 'reserved'
    && extractTenantSlug('www.frontbase.dev', BASE).kind === 'reserved');
check('foreign domain → foreign', extractTenantSlug('acme.example.com', BASE).kind === 'foreign');
check('multi-label subdomain → foreign (no a.b.frontbase.dev tenants)',
    extractTenantSlug('a.b.frontbase.dev', BASE).kind === 'foreign');
check('missing host → foreign', extractTenantSlug(null, BASE).kind === 'foreign'
    && extractTenantSlug('', BASE).kind === 'foreign');
check('port stripped (tenant:8080)', extractTenantSlug('acme.frontbase.dev:8080', BASE).slug === 'acme');
check('port stripped (app:3000)', extractTenantSlug('app.frontbase.dev:3000', BASE).kind === 'app');
check('uppercase host normalized', extractTenantSlug('ACME.FrontBase.DEV', BASE).slug === 'acme');
check('bare apex with port → apex', extractTenantSlug('frontbase.dev:443', BASE).kind === 'apex');
check('custom app label respected', extractTenantSlug('console.frontbase.dev', BASE, 'console').kind === 'app'
    && extractTenantSlug('console.frontbase.dev', BASE, 'app').kind === 'tenant');
check('prefix-only match rejected (notfrontbase.dev)', extractTenantSlug('notfrontbase.dev', BASE).kind === 'foreign');
check('bare IPv6 → foreign', extractTenantSlug('[::1]:8787', BASE).kind === 'foreign');
check('resolveTenantFromHost reads the Request', resolveTenantFromHost(
    { headers: { get: (n) => (n === 'host' ? 'acme.frontbase.dev' : null) } }, BASE,
).slug === 'acme');

// ── 2. Slug validation — product parity (tenant_provisioning.py:176-187) ────
console.log('— slug validation (product-parity messages) —');
check('slugError: <3 chars', slugError('ab') === 'Slug must be at least 3 characters');
check('slugError: >50 chars', slugError('a'.repeat(51)) === 'Slug must be at most 50 characters');
check('slugError: bad charset', slugError('-acme') === 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen'
    && slugError('acme-') === 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen'
    && slugError('a cme') === 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen');
check('slugError: reserved', slugError('app') === "'app' is a reserved name" && slugError('api') === "'api' is a reserved name");
check('slugError: null when valid', slugError('acme') === null && slugError('a-b-c') === null && slugError('9lives') === null);
check('slugValid mirrors slugError', slugValid('acme') === true && slugValid('ab') === false && slugValid('www') === false);
check('SLUG_RE matches product regex', SLUG_RE.source === '^[a-z0-9][a-z0-9-]*[a-z0-9]$');
check('reserved set = product 31 + framework 4', PRODUCT_RESERVED_SLUGS.size === 31 && FRAMEWORK_RESERVED_SLUGS.size === 4
    && RESERVED_SLUGS.size === 35);
check('engine scopes never registrable', ['_default', '_root', '_global'].every((s) => !slugValid(s)));

// ── 3. Migrations v20/v21 ───────────────────────────────────────────────────
console.log('— migrations v20/v21 —');
const runner = sqliteRunner(':memory:');
await migrateUp(runner, () => '2026-08-28T00:00:00Z');
const versions = (await import('../dist/db/migrations.js')).appliedVersions;
check('v20 + v21 recorded', (await versions(runner)).includes(20) && (await versions(runner)).includes(21));
const cols = await runner.query(`SELECT name, "notnull" AS nn, dflt_value FROM pragma_table_info('tenants')`);
const planCol = cols.find((c) => c.name === 'plan');
const statusCol = cols.find((c) => c.name === 'status');
check('tenants.plan/status exist', Boolean(planCol) && Boolean(statusCol));
check('plan/status nullable, NO default (self-host stays unlimited)',
    Number(planCol?.nn) === 0 && planCol?.dflt_value == null
    && Number(statusCol?.nn) === 0 && statusCol?.dflt_value == null);
check('rate_limit_counters exists with the right shape', await (async () => {
    const rows = await runner.query("SELECT name, pk FROM pragma_table_info('rate_limit_counters')");
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    return by.bucket_key?.pk === 1 && Boolean(by.window_start) && Boolean(by.count) && rows.length === 3;
})());
// v21 roundtrip (proper down). v20 has an EMPTY down like v13/v17/v19 (SQLite
// can't drop columns portably) — full-set convergence with v20 stays covered by
// test/migrations.mjs, which rolls back everything and rebuilds tenants at v3.
{
    const fp = (await import('../dist/db/migrations.js')).schemaFingerprint;
    const before = await fp(runner);
    await migrateDown(runner, 1, MIGRATIONS);
    const midState = await runner.query("SELECT name FROM sqlite_master WHERE name = 'rate_limit_counters'");
    check('v21 rollback drops rate_limit_counters', midState.length === 0);
    await migrateUp(runner, () => '2026-08-28T00:00:00Z');
    check('v21 apply→rollback→re-apply converges', (await fp(runner)) === before);
}

// ── 4. TenantStore plan/status ──────────────────────────────────────────────
console.log('— TenantStore plan/status —');
const tenants = new TenantStore(runner);
await tenants.createTenant('acme', 'Acme Inc', '2026-08-28T00:00:00Z');
const bare = await tenants.getTenant('acme');
check('getTenant: fresh row has plan=null status=null (self-host unlimited)', bare?.plan === null && bare?.status === null);
check('getTenant: missing row → null', await tenants.getTenant('ghost') === null);
const planned = await tenants.updateTenant('acme', { plan: 'free', status: 'active' });
check('updateTenant sets plan+status', planned?.plan === 'free' && planned?.status === 'active');
const suspended = await tenants.updateTenant('acme', { status: 'suspended' });
check('updateTenant partial patch keeps other fields', suspended?.plan === 'free' && suspended?.status === 'suspended');
const renamed = await tenants.updateTenant('acme', { name: 'Acme Renamed' });
check('updateTenant name-only patch', renamed?.name === 'Acme Renamed' && renamed?.plan === 'free');
check('updateTenant empty patch is a no-op read', JSON.stringify(await tenants.updateTenant('acme', {})) === JSON.stringify(renamed));
check('updateTenant on missing slug → null', await tenants.updateTenant('ghost', { plan: 'free' }) === null);
check('tenantExists still works alongside', await tenants.tenantExists('acme') === true);

console.log(failures === 0 ? '\ntenant-host: PASS ✅' : `\ntenant-host: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
