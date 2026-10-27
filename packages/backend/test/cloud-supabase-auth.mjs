import assert from 'node:assert/strict';
import { createResolvePrincipal, hashPassword, sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const secret = 'supabase-route-test-secret-0123456789';
const identities = new Map();
const deleted = [];
const resets = [];
const cloudAuth = {
    async signIn(email, password) {
        const identity = identities.get(email);
        return identity?.password === password ? { id: identity.id, email } : null;
    },
    async createUser(email, password) {
        const id = email.startsWith('doomed@') ? 'dupe-id' : `sb-${identities.size + 1}`;
        const identity = { id, email, password };
        identities.set(email, identity);
        return identity;
    },
    async deleteUser(id) { deleted.push(id); },
    async requestPasswordReset(email) { resets.push(email); },
    async updatePassword(token) { return token === 'good-recovery-token'; },
};
await new TenantStore(runner).createTenant('existing', 'Existing', new Date().toISOString());
await new UserStore(runner, 'existing').createUser({
    id: 'dupe-id', email: 'existing@example.test', passwordHash: await hashPassword('local'),
    role: 'owner', tenantSlug: 'existing', now: new Date().toISOString(),
});

const app = await createCompatApp({
    makeRunner: () => runner,
    resolvePrincipal: createResolvePrincipal({ jwtSecret: secret, jwtCookie: 'frontbase_session' }),
    sessionSecret: secret,
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    cloudMode: true,
    cloudAuth,
});
let ip = 1;
const post = (path, body, cookie) => app.fetch(new Request(`https://app.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.0.0.${ip++}`, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
}));

const signup = await post('/api/auth/signup', {
    email: 'owner@example.test', password: 'supabase-password', slug: 'newco', workspace_name: 'NewCo',
});
assert.equal(signup.status, 200);
const cookie = signup.headers.get('set-cookie').split(';')[0];
const stored = (await new UserStore(runner, 'newco').findByEmailAnyTenant('owner@example.test'))[0];
assert.equal(stored.id, 'sb-1');
assert.equal(stored.passwordHash, 'supabase-managed');

assert.equal((await post('/api/auth/login', { email: 'owner@example.test', password: 'wrong' })).status, 401);
const login = await post('/api/auth/login', { email: 'owner@example.test', password: 'supabase-password' });
assert.equal(login.status, 200);
assert.match(login.headers.get('set-cookie'), /^frontbase_session=/);
const me = await app.fetch(new Request('https://app.example.test/api/auth/me', { headers: { cookie } }));
assert.equal(me.status, 200);
assert.equal((await me.json()).user.tenant_slug, 'newco');

assert.equal((await post('/api/auth/forgot-password', { email: 'owner@example.test' })).status, 200);
assert.deepEqual(resets, ['owner@example.test']);
assert.equal((await post('/api/auth/reset-password', { email: 'owner@example.test', token: 'bad', password: 'replacement-password' })).status, 400);
assert.equal((await post('/api/auth/reset-password', { email: 'owner@example.test', token: 'good-recovery-token', password: 'replacement-password' })).status, 200);

const doomed = await post('/api/auth/signup', {
    email: 'doomed@example.test', password: 'supabase-password', slug: 'doomed', workspace_name: 'Doomed',
});
assert.equal(doomed.status, 500);
assert.equal(await new TenantStore(runner).tenantExists('doomed'), false);
assert.deepEqual(deleted, ['dupe-id']);

console.log('cloud Supabase auth routes: PASS');
