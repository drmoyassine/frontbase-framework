/**
 * CL-6 hosted acceptance. Opt-in because it creates records in real provider
 * sandboxes and exact production-zone test routes:
 *   CLOUD_HOSTED_E2E=1
 *   CLOUD_HOSTED_APP_ORIGIN=https://cl6-app.frontbase.dev
 *   CLOUD_HOSTED_TENANT_ORIGIN=https://cl6-t2.frontbase.dev
 *   CLOUD_HOSTED_PASSWORD=<private test-account password>
 *   STRIPE_SECRET_KEY=sk_test_...
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
 */
import { test, expect, type Page } from '@playwright/test';

const enabled = process.env.CLOUD_HOSTED_E2E === '1';
const appOrigin = process.env.CLOUD_HOSTED_APP_ORIGIN;
const tenantOrigin = process.env.CLOUD_HOSTED_TENANT_ORIGIN;
const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabase = {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const password = process.env.CLOUD_HOSTED_PASSWORD ?? '';
test.skip(!enabled || !appOrigin || !tenantOrigin || !password || !stripeKey?.startsWith('sk_test_')
    || !supabase.url || !supabase.serviceRoleKey, 'Hosted CL-6 credentials required');

const run = Date.now().toString(36);
const slug = 'cl6-t2';
const email = `cl6-t2-${run}@example.test`;
const marker = `Hosted CL-6 canvas edit ${run}`;

async function api(page: Page, path: string, method = 'GET', data?: unknown) {
    const response = await page.evaluate(async ({ path, method, data }) => {
        const value = await fetch(path, {
            method, credentials: 'include',
            ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
        });
        return { status: value.status, body: await value.json().catch(() => null) };
    }, { path, method, data });
    return response;
}

async function stripe(path: string, method = 'GET') {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        method, headers: { Authorization: `Bearer ${stripeKey}` },
    });
    expect(response.ok, `Stripe ${path}`).toBe(true);
    return response.json();
}

test('second hosted customer: signup, payment, data source, canvas edit, publish and portal', async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    await test.step('fresh Supabase signup and authenticated session', async () => {
        await page.goto(`${appOrigin}/admin/signup`);
        await page.getByLabel('Email', { exact: true }).fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByLabel('Confirm Password', { exact: true }).fill(password);
        await page.getByLabel('Workspace Name', { exact: true }).fill('CL6 Second Customer');
        await page.getByLabel('Workspace URL', { exact: true }).fill(slug);
        await page.waitForFunction(() => document.body.innerText.includes('✓ Available'));
        const signup = page.waitForResponse((value) => value.url().endsWith('/api/auth/signup') && value.request().method() === 'POST');
        await page.getByRole('button', { name: 'Create Workspace', exact: true }).click();
        expect((await signup).status()).toBe(200);
        await expect(page.getByRole('link', { name: /builder studio/i })).toBeVisible();
        const me = await api(page, '/api/auth/me');
        expect(me.status).toBe(200);
        expect(me.body.user?.tenant_slug).toBe(slug);
    });

    let subscriptionId = '';
    let sessionId = '';
    await test.step('real Stripe sandbox Checkout is paid and webhook upgrades the tenant', async () => {
        const checkout = await api(page, '/api/billing/checkout', 'POST', { plan_slug: 'basic' });
        expect(checkout.status).toBe(200);
        expect(checkout.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
        await page.goto(checkout.body.url, { waitUntil: 'domcontentloaded' });
        await page.locator('#payment-method-accordion-item-title-card').check({ force: true });
        await page.getByPlaceholder('1234 1234 1234 1234').fill('4242 4242 4242 4242');
        await page.getByPlaceholder('MM / YY').fill('12 / 34');
        await page.getByPlaceholder('CVC').fill('123');
        await page.getByPlaceholder('Full name on card').fill('CL6 Second Customer');
        await page.locator('button', { hasText: 'Subscribe' }).click();
        await page.waitForURL(/billing=success/, { timeout: 60_000 });
        sessionId = new URL(checkout.body.url).pathname.split('/').pop()!;
        const session = await stripe(`checkout/sessions/${sessionId}`);
        expect(session.status).toBe('complete');
        expect(session.payment_status).toBe('paid');
        subscriptionId = session.subscription;
        let plan = '';
        for (let attempt = 0; attempt < 12; attempt++) {
            await page.waitForTimeout(2500);
            plan = (await api(page, '/api/tenants/me/plan')).body.plan?.id ?? '';
            if (plan === 'basic') break;
        }
        expect(plan).toBe('basic');
    });

    let datasourceId = '';
    await test.step('real Supabase data source connects and introspects', async () => {
        const created = await api(page, '/api/sync/datasources/', 'POST', {
            name: `CL6 Supabase ${run}`, type: 'supabase',
            api_url: supabase.url, service_role_key: supabase.serviceRoleKey, schema: 'public',
        });
        expect(created.status).toBe(201);
        datasourceId = created.body.id;
        const connected = await api(page, `/api/sync/datasources/${datasourceId}/test/`, 'POST', {});
        expect(connected.status).toBe(200);
        expect(connected.body.success).toBe(true);
    });

    let pageId = '';
    await test.step('Builder UI adds a component, saves through its own store and publishes', async () => {
        const pages = await api(page, '/api/pages/');
        expect(pages.status).toBe(200);
        const home = pages.body.data.find((entry: { isHomepage: boolean }) => entry.isHomepage);
        pageId = home.id;
        const before = home.layoutData?.content?.filter((entry: { type: string }) => entry.type === 'Heading').length ?? 0;
        await page.goto(`${appOrigin}/admin/builder/${pageId}`, { waitUntil: 'domcontentloaded' });
        const heading = page.locator('[title*="Heading (Double-click to add)"]').first();
        await heading.waitFor();
        await heading.dblclick();
        const save = page.waitForResponse((value) => value.url().includes('/api/pages/') && value.request().method() === 'PUT');
        await page.getByRole('button', { name: /^Save/ }).click();
        expect((await save).status()).toBe(200);
        const afterResponse = await api(page, `/api/pages/${pageId}/`);
        const headings = afterResponse.body.data.layoutData.content.filter((entry: { type: string }) => entry.type === 'Heading');
        expect(headings.length).toBeGreaterThan(before);
        const publish = await api(page, `/api/pages/${pageId}/publish/local/`, 'POST', {});
        expect(publish.status).toBe(200);
        expect(publish.body.success).toBe(true);
    });

    await test.step('second public tenant host renders the saved page', async () => {
        const visitor = await browser.newContext();
        const publicPage = await visitor.newPage();
        const response = await publicPage.goto(tenantOrigin, { waitUntil: 'domcontentloaded' });
        expect(response?.status()).toBe(200);
        await expect(publicPage.locator('h1, h2, h3, h4, h5, h6').filter({ hasText: 'Heading' }).first()).toBeVisible();
        await publicPage.reload({ waitUntil: 'domcontentloaded' });
        await visitor.close();
    });

    await test.step('Stripe customer portal cancels the subscription and webhook downgrades', async () => {
        const portal = await api(page, '/api/billing/portal', 'POST', {});
        expect(portal.status).toBe(200);
        expect(portal.body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
        await page.goto(portal.body.url, { waitUntil: 'domcontentloaded' });
        await page.getByText(/cancel/i).first().click();
        await page.getByRole('button', { name: /cancel subscription/i }).first().click();
        await page.getByRole('button', { name: /cancel subscription/i }).last().click();
        await page.waitForURL(/canceled=true|billing=success/, { timeout: 60_000 }).catch(() => {});
        const subscription = await stripe(`subscriptions/${subscriptionId}`);
        expect(['canceled', 'canceling']).toContain(subscription.status);
        let plan = '';
        for (let attempt = 0; attempt < 12; attempt++) {
            await page.waitForTimeout(2500);
            plan = (await api(page, '/api/tenants/me/plan')).body.plan?.id ?? '';
            if (plan === 'free') break;
        }
        expect(plan).toBe('free');
    });

    await context.close();
});
