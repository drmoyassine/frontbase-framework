import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { PLAN_CATALOG, catalogPlan } from '../plans/catalog.js';
import { serializePlan } from './tenants.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export interface StripeBillingConfig {
    secretKey: string;
    webhookSecret: string;
    baseDomain: string;
    fetch?: typeof globalThis.fetch;
}

const encoder = new TextEncoder();
const toHexBytes = (hex: string): Uint8Array | null => {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
    return Uint8Array.from(hex.match(/../g)!.map((value) => Number.parseInt(value, 16)));
};

export async function verifyStripeSignature(
    payload: string,
    header: string,
    secret: string,
    nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
    const parts = header.split(',').map((part) => part.trim().split('=', 2));
    const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
    const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter((value): value is string => typeof value === 'string');
    if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || signatures.length === 0) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const data = encoder.encode(`${timestamp}.${payload}`);
    for (const signature of signatures) {
        const bytes = toHexBytes(signature);
        if (bytes && await crypto.subtle.verify('HMAC', key, new Uint8Array(bytes).buffer, data)) return true;
    }
    return false;
}

async function stripeRequest(config: StripeBillingConfig, path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
    const body = new URLSearchParams(fields);
    const response = await (config.fetch ?? globalThis.fetch)(`https://api.stripe.com/v1/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!response.ok) throw new Error(`stripe_${path.replace(/\W+/g, '_')}_${response.status}`);
    return await response.json() as Record<string, unknown>;
}

class BillingStore {
    constructor(private readonly runner: DbRunner) {}
    async byTenant(tenant: string) {
        return (await this.runner.query('SELECT tenant_slug, customer_id, subscription_id, plan_id, status, current_period_end FROM billing_accounts WHERE tenant_slug = ? LIMIT 1', [tenant]))[0] ?? null;
    }
    async byExternal(customerId?: string, subscriptionId?: string) {
        if (subscriptionId) {
            const row = (await this.runner.query('SELECT tenant_slug, customer_id, subscription_id, plan_id, status, current_period_end FROM billing_accounts WHERE subscription_id = ? LIMIT 1', [subscriptionId]))[0];
            if (row) return row;
        }
        return customerId
            ? (await this.runner.query('SELECT tenant_slug, customer_id, subscription_id, plan_id, status, current_period_end FROM billing_accounts WHERE customer_id = ? LIMIT 1', [customerId]))[0] ?? null
            : null;
    }
    async save(input: { tenant: string; customerId: string; subscriptionId?: string | null; planId?: string | null; status: string; periodEnd?: string | null }, now: string) {
        await this.runner.exec(
            `INSERT INTO billing_accounts (tenant_slug, provider, customer_id, subscription_id, plan_id, status, current_period_end, updated_at)
             VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?)
             ON CONFLICT(tenant_slug) DO UPDATE SET customer_id=excluded.customer_id, subscription_id=COALESCE(excluded.subscription_id,billing_accounts.subscription_id), plan_id=COALESCE(excluded.plan_id,billing_accounts.plan_id), status=excluded.status, current_period_end=COALESCE(excluded.current_period_end,billing_accounts.current_period_end), updated_at=excluded.updated_at`,
            [input.tenant, input.customerId, input.subscriptionId ?? null, input.planId ?? null, input.status, input.periodEnd ?? null, now],
        );
    }
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

export function registerBillingWebhookRoute(app: App, runner: DbRunner, config: StripeBillingConfig, now: () => string): void {
    app.post('/api/billing/webhooks/:provider', async (c) => {
        if (c.req.param('provider') !== 'stripe') return c.json({ detail: 'Unsupported billing provider' }, 404);
        const payload = await c.req.text();
        const signature = c.req.header('stripe-signature') ?? '';
        if (!await verifyStripeSignature(payload, signature, config.webhookSecret)) return c.json({ detail: 'Invalid webhook signature' }, 400);
        const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
        if (!event.id || !event.type || !event.data?.object) return c.json({ detail: 'Invalid webhook event' }, 400);
        const eventId = event.id;
        const eventType = event.type;
        const eventObject = event.data.object;

        const apply = async (tx: DbRunner): Promise<boolean> => {
            const inserted = await tx.exec(
                `INSERT INTO billing_events (provider, event_id, received_at) VALUES ('stripe', ?, ?) ON CONFLICT(provider, event_id) DO NOTHING`,
                [eventId, now()],
            );
            if (inserted === 0) return false;
            const object = eventObject;
            const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata as Record<string, unknown> : {};
            const customerId = stringValue(object.customer);
            const subscriptionId = eventType.startsWith('customer.subscription.') ? stringValue(object.id) : stringValue(object.subscription);
            const store = new BillingStore(tx);
            const existing = await store.byExternal(customerId, subscriptionId);
            const tenant = stringValue(metadata.tenant_slug) ?? stringValue(existing?.tenant_slug);
            const planId = stringValue(metadata.plan_slug) ?? stringValue(existing?.plan_id);
            if (!tenant || !customerId) return true;

            if (eventType === 'customer.subscription.deleted') {
                await store.save({ tenant, customerId, subscriptionId, planId: 'free', status: 'canceled' }, now());
                await tx.exec("UPDATE tenants SET plan = 'free', status = 'active' WHERE slug = ?", [tenant]);
            } else if (eventType === 'checkout.session.completed' || eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated') {
                const rawStatus = stringValue(object.status) ?? 'active';
                const active = ['active', 'trialing', 'complete'].includes(rawStatus);
                const period = typeof object.current_period_end === 'number' ? new Date(object.current_period_end * 1000).toISOString() : null;
                await store.save({ tenant, customerId, subscriptionId, planId, status: rawStatus, periodEnd: period }, now());
                if (planId) await tx.exec('UPDATE tenants SET plan = ?, status = ? WHERE slug = ?', [planId, active ? 'active' : rawStatus, tenant]);
            } else if (eventType === 'invoice.payment_failed') {
                await store.save({ tenant, customerId, subscriptionId, planId, status: 'past_due' }, now());
                await tx.exec("UPDATE tenants SET status = 'past_due' WHERE slug = ?", [tenant]);
            }
            return true;
        };
        const processed = runner.transaction ? await runner.transaction(apply) : await apply(runner);
        return c.json({ received: true, duplicate: !processed });
    });
}

export function registerBillingRoutes(app: App, runner: DbRunner, config: StripeBillingConfig, now: () => string): void {
    const store = new BillingStore(runner);
    app.get('/api/plans/public', async (c) => {
        const detailed = PLAN_CATALOG.map((plan) => serializePlan({
            id: plan.id, name: plan.name, price_cents: plan.priceCents, interval: plan.interval,
            limits: JSON.stringify(plan.limits), is_active: 1, created_at: now(), updated_at: now(),
        }, now()));
        return c.json({ plans: detailed.map((plan) => ({ slug: plan.slug, name: plan.name, price_display: plan.price_display, price_period: plan.price_period })), detailed });
    });
    app.post('/api/billing/checkout', async (c) => {
        const principal = c.get('principal') as { user?: { email?: string } } | undefined;
        const tenant = c.get('tenant');
        const body = await c.req.json().catch(() => ({})) as { plan_slug?: string };
        const plan = body.plan_slug ? catalogPlan(body.plan_slug) : undefined;
        if (!plan?.stripePriceId) return c.json({ detail: 'This plan is not available for online checkout' }, 400);
        let account = await store.byTenant(tenant);
        let customerId = stringValue(account?.customer_id);
        if (!customerId) {
            const customer = await stripeRequest(config, 'customers', {
                email: principal?.user?.email ?? '', 'metadata[tenant_slug]': tenant,
            });
            customerId = stringValue(customer.id);
            if (!customerId) throw new Error('stripe_customer_missing_id');
            await store.save({ tenant, customerId, status: 'pending' }, now());
            account = await store.byTenant(tenant);
        }
        const origin = `https://app.${config.baseDomain}`;
        const session = await stripeRequest(config, 'checkout/sessions', {
            mode: 'subscription', customer: customerId,
            'line_items[0][price]': plan.stripePriceId, 'line_items[0][quantity]': '1',
            'metadata[tenant_slug]': tenant, 'metadata[plan_slug]': plan.id,
            'subscription_data[metadata][tenant_slug]': tenant,
            'subscription_data[metadata][plan_slug]': plan.id,
            success_url: `${origin}/frontbase-admin/settings?billing=success`,
            cancel_url: `${origin}/frontbase-admin/settings?billing=cancelled`,
        });
        const url = stringValue(session.url);
        if (!url) throw new Error('stripe_checkout_missing_url');
        return c.json({ url });
    });
    app.post('/api/billing/portal', async (c) => {
        const tenant = c.get('tenant');
        const account = await store.byTenant(tenant);
        const customerId = stringValue(account?.customer_id);
        if (!customerId) return c.json({ detail: 'No billing account exists for this workspace' }, 400);
        const session = await stripeRequest(config, 'billing_portal/sessions', {
            customer: customerId,
            return_url: `https://app.${config.baseDomain}/frontbase-admin/settings`,
        });
        const url = stringValue(session.url);
        if (!url) throw new Error('stripe_portal_missing_url');
        return c.json({ url });
    });
}
