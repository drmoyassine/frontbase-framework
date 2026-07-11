/**
 * M-ID.2 gate — tenant provisioning + cross-tenant authorization (canActOnTenant)
 * + RULE 8 (drop the check → RED). Also exercises the provisioning route end-to-end.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createConsole, UserStore, seedOwner, canActOnTenant, TenantStore } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// --- canActOnTenant (the authorization predicate) ---
const masterAdmin = { user: { id: 'm', role: 'master_admin' }, tenant: '_root' };
const tenantAdminA = { user: { id: 'a', role: 'tenant_admin' }, tenant: 'tenant-A' };
const tenantAdminB = { user: { id: 'b', role: 'tenant_admin' }, tenant: 'tenant-B' };

check('master_admin can act on ANY tenant', canActOnTenant(masterAdmin, 'tenant-A') && canActOnTenant(masterAdmin, 'tenant-B'));
check('tenant_admin A can act on A', canActOnTenant(tenantAdminA, 'tenant-A'));
check('tenant_admin A CANNOT act on B', !canActOnTenant(tenantAdminA, 'tenant-B'));
check('tenant_admin B CANNOT act on A', !canActOnTenant(tenantAdminB, 'tenant-A'));

// --- provisioning end-to-end ---
const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const userStore = new UserStore(runner, '_default');
// Seed master_admin
await userStore.createUser({ email: 'master@test.com', passwordHash: 'x', role: 'master_admin', now: '2026-07-11T00:00:00Z', tenantSlug: '_root' });
const tenants = new TenantStore(runner);
const t1 = await tenants.createTenant('acme', 'Acme Corp', '2026-07-11T00:00:01Z');
check('createTenant works', t1.slug === 'acme');
check('tenantExists', await tenants.tenantExists('acme'));
check('listTenants includes acme', (await tenants.listTenants()).some((t) => t.slug === 'acme'));

// --- provisioning route (POST /tenants) ---
const app = await createConsole({
    makeRunner: async () => runner,
    sessionSecret: 'test-secret',
    resolvePrincipal: async () => masterAdmin, // simulate a master_admin session
});
const req = (path, init) => app.fetch(new Request('http://c.local' + path, init));

const provRes = await req('/tenants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Globex', adminEmail: 'admin@globex.com' }),
});
check('POST /tenants → 200 (master_admin)', provRes.status === 200);
const provBody = await provRes.json();
check('provisioning returns tenant + admin', provBody.tenant?.slug === 'globex' && provBody.admin?.email === 'admin@globex.com');
check('temp password returned ONCE (present in response)', !!provBody.admin?.tempPassword);
check('temp password is a non-empty string', typeof provBody.admin?.tempPassword === 'string' && provBody.admin.tempPassword.length > 0);
// Verify the tenant_admin was actually seeded
const globexStore = new UserStore(runner, 'globex');
check('tenant_admin seeded in globex tenant', await globexStore.countUsers() === 1);
const globexAdmin = await globexStore.findByEmailForVerify('admin@globex.com');
check('tenant_admin has role tenant_admin', globexAdmin?.role === 'tenant_admin');

// --- non-master-admin cannot provision ---
const app2 = await createConsole({
    makeRunner: async () => runner,
    sessionSecret: 'test-secret',
    resolvePrincipal: async () => tenantAdminA,
});
const deniedRes = await app2.fetch(new Request('http://c.local/tenants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Evil', adminEmail: 'evil@test.com' }),
}));
check('tenant_admin CANNOT provision (403)', deniedRes.status === 403);

// --- GET /tenants (master_admin only) ---
const listRes = await req('/tenants');
check('GET /tenants → 200 (master_admin)', listRes.status === 200);
const listBody = await listRes.json();
check('list includes both tenants', listBody.tenants.length >= 2);

// --- CRIT-1: the provisioned tenant_admin can actually LOG IN with the temp password ---
// (login is cross-tenant by email; the globex admin lives in tenant 'globex').
const loginApp = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret' });
const tempPw = provBody.admin.tempPassword;
const taLogin = await loginApp.fetch(new Request('http://c.local/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@globex.com', password: tempPw }) }));
check('CRIT-1: provisioned tenant_admin can log in with the temp password', taLogin.status === 200);
const taBody = await taLogin.json();
check('tenant_admin login carries role tenant_admin', taBody.user?.role === 'tenant_admin');
// and the session cookie scopes them to 'globex' (via the JWT tenant_slug claim)
const taCookie = (taLogin.headers.get('set-cookie') ?? '').split(';')[0];
const meRes = await loginApp.fetch(new Request('http://c.local/me', { headers: { cookie: taCookie } }));
check('tenant_admin /me → 200 (session valid)', meRes.status === 200);

// wrong temp password → 401 (opaque)
const badLogin = await loginApp.fetch(new Request('http://c.local/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@globex.com', password: 'not-the-temp-password' }) }));
check('wrong temp password → 401', badLogin.status === 401);

console.log(failures === 0 ? '\nprovision: PASS ✅' : `\nprovision: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
