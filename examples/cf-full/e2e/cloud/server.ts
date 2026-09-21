/** Local CL-6 fixture only. Never imported by a deploy entrypoint. */
import { serve } from '@hono/node-server';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from '../../src/worker.js';
import { createDiskAssets } from '../../src/assets-disk.js';

const identities = new Map<string, { id: string; email: string; password: string }>();
const resets = new Map<string, string>();
const billing = {
    priceIds: { basic: 'price_test_basic', pro: 'price_test_pro' },
    secretKey: 'sk_test_local_fixture', webhookSecret: 'whsec_local_fixture', baseDomain: 'localhost',
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        const fields = new URLSearchParams(String(init?.body));
        if (path === '/v1/customers') return Response.json({ id: `cus_${fields.get('metadata[tenant_slug]')}` });
        if (path === '/v1/checkout/sessions') return Response.json({ url: `https://checkout.stripe.test/${fields.get('customer')}` });
        if (path === '/v1/billing_portal/sessions') return Response.json({ url: `https://billing.stripe.test/${fields.get('customer')}` });
        throw new Error('Unexpected fixture billing request');
    },
};
const runner = sqliteRunner(':memory:');
const engine = await createCmsEngine({
    runner,
    sessionSecret: 'local-cloud-journey-secret-not-for-deployment',
    cloud: { baseDomain: 'localhost' },
    cloudAuth: {
        async createUser(email, password) {
            if (identities.has(email)) throw new Error('duplicate identity');
            const user = { id: crypto.randomUUID(), email, password };
            identities.set(email, user);
            return { id: user.id, email };
        },
        async signIn(email, password) {
            const user = identities.get(email);
            return user?.password === password ? { id: user.id, email } : null;
        },
        async deleteUser(id) {
            for (const [email, user] of identities) if (user.id === id) identities.delete(email);
        },
        async requestPasswordReset(email) {
            if (identities.has(email)) resets.set(email, crypto.randomUUID());
        },
        async updatePassword(token, password) {
            for (const [email, saved] of resets) {
                if (saved !== token) continue;
                identities.get(email)!.password = password;
                resets.delete(email);
                return true;
            }
            return false;
        },
    },
    billing,
    assets: createDiskAssets(join(dirname(fileURLToPath(import.meta.url)), '..', 'console-dist')),
});
const port = Number(process.env.CLOUD_E2E_PORT ?? 8791);
serve({
    hostname: '127.0.0.1', port,
    fetch: async (request) => {
        const url = new URL(request.url);
        // Local mailbox only; this file is absent from every production bundle.
        if (url.pathname === '/__e2e/tenant') {
            const rows = await runner.query('SELECT plan, status FROM tenants WHERE slug = ?', [url.searchParams.get('slug') ?? '']);
            return Response.json(rows[0] ?? null);
        }
        if (url.pathname === '/__e2e/reset') {
            return Response.json({ token: resets.get(url.searchParams.get('email') ?? '') ?? null });
        }
        return engine.fetch(request);
    },
});
console.log(`Local Cloud journey fixture listening on ${port}; providers simulated, state ephemeral`);
