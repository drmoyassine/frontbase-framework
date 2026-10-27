import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
const runner = sqliteRunner(':memory:'); await migrateUp(runner);
let tenant = 'alpha', authenticated = true;
const app = await createCompatApp({ makeRunner: async () => runner, resolvePrincipal: async () => ({ user: authenticated ? { id: 'owner', role: 'owner' } : null, tenant }), sessionSecret: 'identity-test-session', now: () => '2026-10-12T00:00:00Z' });
const request = (method, body) => app.request('/api/project/', { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const identity = { name: 'Public name', origin: 'https://example.com', locale: 'en' };
assert.equal((await request('PUT', { name: 'Internal label', description: 'Internal description', logoUrl: '/static/logo.png' })).status, 200);
assert.equal((await request('PUT', { siteIdentity: identity })).status, 200);
const project = await (await request('GET')).json();
assert.deepEqual(project.siteIdentity, identity); assert.equal(project.name, 'Internal label'); assert.equal(project.description, 'Internal description'); assert.equal(project.logoUrl, '/static/logo.png');
for (const invalid of [{ ...identity, origin: 'http://example.com' }, { ...identity, origin: 'https://user:password@example.com' }, { ...identity, locale: 'not a language' }, { ...identity, secret: 'PRIVATE_IDENTITY_SENTINEL' }]) {
    const denial = await request('PUT', { siteIdentity: invalid }); assert.equal(denial.status, 400); assert.ok(!(await denial.text()).includes('PRIVATE_IDENTITY_SENTINEL'));
    assert.deepEqual((await (await request('GET')).json()).siteIdentity, identity);
}
const configured = await (await app.request('/api/project/site-configuration/')).json(); assert.equal(configured.revision, 0); assert.equal(configured.draft, null);
tenant = 'beta'; assert.equal((await (await request('GET')).json()).siteIdentity, undefined);
tenant = 'alpha'; authenticated = false; assert.equal((await request('PUT', { siteIdentity: identity })).status, 401);
console.log('project-site-identity: strict public defaults, legacy metadata preservation, no config migration, owner isolation and auth passed');
