import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
await new TenantStore(runner).createTenant('acme', 'Acme', new Date().toISOString());
await new TenantStore(runner).updateTenant('acme', { plan: 'free', status: 'active' });
await new UserStore(runner, 'acme').createUser({ id: 'u1', email: 'owner@acme.test', passwordHash: 'x', role: 'owner', tenantSlug: 'acme', now: new Date().toISOString() });

const calls = [];
const stripeFetch = async (url, init) => {
    calls.push({ url: String(url), body: Object.fromEntries(init.body.entries()), auth: init.headers.Authorization });
    if (String(url).endsWith('/customers')) return Response.json({ id: 'cus_acme' });
    if (String(url).endsWith('/checkout/sessions')) return Response.json({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    if (String(url).endsWith('/billing_portal/sessions')) return Response.json({ id: 'bps_1', url: 'https://billing.stripe.test/bps_1' });
    throw new Error('unexpected_stripe_call');
};
const webhookSecret = 'whsec_test_secret';
const app = await createCompatApp({
    makeRunner: () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1', email: 'owner@acme.test', role: 'owner' }, tenant: 'acme' }),
    sessionSecret: 'billing-test-session-secret-0123456789',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    cloudMode: true,
    billing: { secretKey: 'sk_live_test_shape', webhookSecret, baseDomain: 'frontbase.test', fetch: stripeFetch },
});
let ip = 1;
const request = (path, body) => app.fetch(new Request(`https://app.frontbase.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), 'cf-connecting-ip': `10.1.0.${ip++}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}));

const plans = await request('/api/plans/public');
assert.equal(plans.status, 200);
const planBody = await plans.json();
assert.deepEqual(planBody.detailed.map((plan) => plan.slug), ['free', 'basic', 'pro']);
assert.equal(planBody.detailed[1].gateway_metadata.stripe_price_id, 'price_1TrSYzPclg9BuO7fJ0s6qjdJ');

const checkout = await request('/api/billing/checkout', { plan_slug: 'basic' });
assert.equal(checkout.status, 200);
assert.equal((await checkout.json()).url, 'https://checkout.stripe.test/cs_1');
assert.equal(calls[0].body['metadata[tenant_slug]'], 'acme');
assert.equal(calls[1].body['line_items[0][price]'], 'price_1TrSYzPclg9BuO7fJ0s6qjdJ');
assert.equal(calls[1].body['subscription_data[metadata][plan_slug]'], 'basic');
assert.equal(calls[0].auth, 'Bearer sk_live_test_shape');

const portal = await request('/api/billing/portal', {});
assert.equal(portal.status, 200);
assert.equal((await portal.json()).url, 'https://billing.stripe.test/bps_1');

async function signedEvent(event, timestamp = Math.floor(Date.now() / 1000)) {
    const payload = JSON.stringify(event);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return app.fetch(new Request('https://app.frontbase.test/api/billing/webhooks/stripe', {
        method: 'POST', headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }, body: payload,
    }));
}

const completedEvent = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { customer: 'cus_acme', subscription: 'sub_1', status: 'complete', metadata: { tenant_slug: 'acme', plan_slug: 'basic' } } } };
assert.equal((await signedEvent(completedEvent)).status, 200);
assert.deepEqual(await new TenantStore(runner).getTenant('acme'), { slug: 'acme', name: 'Acme', createdAt: (await new TenantStore(runner).getTenant('acme')).createdAt, plan: 'basic', status: 'active' });
assert.equal((await (await signedEvent(completedEvent)).json()).duplicate, true);
assert.equal((await signedEvent({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_acme', metadata: { tenant_slug: 'acme' } } } })).status, 200);
assert.equal((await new TenantStore(runner).getTenant('acme')).plan, 'free');

const invalid = await app.fetch(new Request('https://app.frontbase.test/api/billing/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}' }));
assert.equal(invalid.status, 400);
console.log('cloud billing: PASS');
