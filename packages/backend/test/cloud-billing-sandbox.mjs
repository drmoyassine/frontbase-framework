/** Real Stripe sandbox checkout transport proof. No payment or webhook delivery claim.
 * node --env-file=<local cloud-test.env> packages/backend/test/cloud-billing-sandbox.mjs
 * Creates then expires a Checkout Session and deletes its temporary customer.
 */
import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';

const secretKey = process.env.STRIPE_SECRET_KEY;
assert.match(secretKey ?? '', /^sk_test_/, 'Only a Stripe test key is allowed');
const priceIds = { basic: process.env.STRIPE_BASIC_PRICE_ID, pro: process.env.STRIPE_PRO_PRICE_ID };
assert.ok(priceIds.basic && priceIds.pro, 'Both sandbox prices are required');
const stripe = async (path, method = 'GET') => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${secretKey}` } });
    assert.equal(response.ok, true, `Stripe ${method} ${path.split('/')[0]} HTTP ${response.status}`);
    return response.json();
};
for (const [plan, amount] of [['basic', 199], ['pro', 2900]]) {
    const price = await stripe(`prices/${priceIds[plan]}`);
    assert.equal(price.livemode, false);
    assert.equal(price.active, true);
    assert.equal(price.currency, 'usd');
    assert.equal(price.unit_amount, amount);
    assert.equal(price.recurring?.interval, 'month');
    assert.equal(price.recurring?.interval_count, 1);
}
const tenant = `sandbox-${Date.now().toString(36)}`;
const runner = sqliteRunner(':memory:');
await migrateUp(runner);
await new TenantStore(runner).createTenant(tenant, 'Temporary Stripe transport check', new Date().toISOString());
const created = { customers: [], sessions: [] };
const transport = async (input, init) => {
    const response = await fetch(input, init);
    if (response.ok) {
        const value = await response.clone().json();
        if (String(input).endsWith('/customers')) created.customers.push(value.id);
        if (String(input).endsWith('/checkout/sessions')) created.sessions.push(value.id);
    }
    return response;
};
try {
    const app = await createCompatApp({
        makeRunner: () => runner, cloudMode: true,
        sessionSecret: 'sandbox-transport-test-only-not-for-deploy',
        resolvePrincipal: async () => ({ user: { id: 'sandbox-user', email: 'sandbox@example.test', role: 'owner' }, tenant }),
        userStoreFor: (slug) => new UserStore(runner, slug),
        billing: { secretKey, priceIds, webhookSecret: 'whsec_not_delivery_evidence', baseDomain: 'frontbase.test', fetch: transport },
    });
    const response = await app.fetch(new Request('https://app.frontbase.test/api/billing/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan_slug: 'basic' }),
    }));
    assert.equal(response.status, 200, 'framework checkout route');
    const checkout = await response.json();
    assert.equal(new URL(checkout.url).hostname, 'checkout.stripe.com');
    assert.equal(created.customers.length, 1);
    assert.equal(created.sessions.length, 1);
    const session = await stripe(`checkout/sessions/${created.sessions[0]}?expand[]=line_items`);
    assert.equal(session.livemode, false);
    assert.equal(session.mode, 'subscription');
    assert.equal(session.status, 'open');
    assert.equal(session.payment_status, 'unpaid');
    assert.equal(session.client_reference_id, tenant);
    assert.equal(session.metadata.tenant_slug, tenant);
    assert.equal(session.metadata.plan_slug, 'basic');
    assert.equal(session.line_items.data[0].price.id, priceIds.basic);
    const customer = await stripe(`customers/${created.customers[0]}`);
    assert.equal(customer.metadata.tenant_slug, tenant);
    console.log('PASS: sandbox catalog, framework checkout, Stripe session and tenant binding. Payment/portal/webhook delivery NOT tested.');
} finally {
    const cleanupErrors = [];
    for (const id of created.sessions) {
        try { await stripe(`checkout/sessions/${id}/expire`, 'POST'); }
        catch { cleanupErrors.push(`Checkout Session ${id}`); }
    }
    for (const id of created.customers) {
        try { await stripe(`customers/${id}`, 'DELETE'); }
        catch { cleanupErrors.push(`Customer ${id}`); }
    }
    assert.deepEqual(cleanupErrors, [], 'Temporary sandbox resources need cleanup');
    console.log('Cleanup: temporary checkout sessions expired and customers deleted. No payment attempted.');
}
