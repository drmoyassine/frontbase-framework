/** Assembled local journey. Provider doubles are NOT Supabase/Stripe acceptance. */
import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

const password = 'Local-journey-password-2026!';
const port = Number(process.env.CLOUD_E2E_PORT ?? 8791);
const origin = `http://app.localhost:${port}`;

async function api(page: Page, path: string, method = 'GET', data?: unknown) {
    return page.evaluate(async ({ path, method, data }) => {
        const response = await fetch(path, {
            method, credentials: 'include',
            ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
        });
        return { status: response.status, body: await response.json() };
    }, { path, method, data });
}
async function signup(page: Page, slug: string) {
    await page.goto(`${origin}/admin/signup`);
    await page.getByLabel('Email', { exact: true }).fill(`${slug}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password', { exact: true }).fill(password);
    await page.getByLabel('Workspace Name', { exact: true }).fill(slug);
    await page.getByLabel('Workspace URL', { exact: true }).fill(slug);
    await expect(page.getByRole('button', { name: 'Create Workspace', exact: true })).toBeEnabled();
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create Workspace', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole('link', { name: /builder studio/i })).toBeVisible();
    const me = await api(page, '/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.tenant_slug).toBe(slug);
}
async function webhook(page: Page, id: string, type: string, object: unknown) {
    const payload = JSON.stringify({ id, type, data: { object } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'whsec_local_fixture').update(`${timestamp}.${payload}`).digest('hex');
    const result = await page.evaluate(async ({ payload, signature }) => {
        const response = await fetch('/api/billing/webhooks/stripe', {
            method: 'POST', body: payload, headers: { 'stripe-signature': signature },
        });
        return { status: response.status, body: await response.json() };
    }, { payload, signature: `t=${timestamp},v1=${signature}` });
    return { status: () => result.status, json: async () => result.body };
}

test('two customers: browser signup, sessions, publish/reload, isolation, billing lifecycle and reset', async ({ browser }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    const run = Date.now().toString(36);
    const alice = `e2e-a-${run}`, bob = `e2e-b-${run}`;
    try {
        await test.step('anonymous plans are public; billing stays authenticated', async () => {
            await a.goto(`${origin}/admin/signup`);
            expect((await api(a, '/api/plans/public')).status).toBe(200);
            expect((await api(a, '/api/billing/checkout', 'POST', { plan_slug: 'basic' })).status).toBe(401);
        });
        await test.step('two fresh customers sign up through the actual cloud console', async () => {
            await signup(a, alice);
            await signup(b, bob);
            for (const context of contexts) {
                const session = (await context.cookies()).find((c) => c.name === 'frontbase_session');
                expect(session?.httpOnly).toBe(true);
                expect(session?.secure).toBe(true);
                expect(session?.sameSite).toBe('Lax');
            }
            await a.reload();
            await expect(a.getByRole('link', { name: /builder studio/i })).toBeVisible();
        });
        let pageId: string;
        const marker = `Published journey ${alice}`;
        await test.step('save layout and publish through real APIs, then render in a fresh browser', async () => {
            // Use the console's list path; the legacy homepage endpoint hides auto-seeded Home rows.
            const pages = await api(a, '/api/pages/');
            expect(pages.status).toBe(200);
            const home = pages.body.data.find((entry: { isHomepage: boolean }) => entry.isHomepage);
            expect(home, 'signup seeded a homepage').toBeTruthy();
            pageId = home.id;
            const saved = await api(a, `/api/pages/${pageId}/layout/`, 'PUT', {
                layoutData: { root: {}, content: [{ id: 'journey-heading', type: 'Heading', props: { content: marker, level: 'h1' } }] },
            });
            expect(saved.status).toBe(200);
            const published = await api(a, `/api/pages/${pageId}/publish/local/`, 'POST', {});
            expect(published.status).toBe(200);
            expect(published.body.success).toBe(true);
            await a.goto(`${origin}/admin/pages`);
            await a.reload();
            expect((await api(a, `/api/pages/${pageId}/`)).body.data.layoutData.content[0].props.content).toBe(marker);
            const visitor = await browser.newContext();
            try {
                const publicPage = await visitor.newPage();
                expect((await publicPage.goto(`http://${alice}.localhost:${port}/`))?.status()).toBe(200);
                await expect(publicPage.getByRole('heading', { name: marker, exact: true })).toBeVisible();
                await publicPage.reload();
                await expect(publicPage.getByRole('heading', { name: marker, exact: true })).toBeVisible();
                expect((await publicPage.goto(`http://${bob}.localhost:${port}/`))?.status()).toBe(200);
                await expect(publicPage.getByText(marker, { exact: true })).toHaveCount(0);
            } finally { await visitor.close(); }
        });
        await test.step('another authenticated tenant cannot read, edit or publish the page', async () => {
            expect((await api(b, `/api/pages/${pageId}/`)).status).toBe(404);
            expect((await api(b, `/api/pages/${pageId}/layout/`, 'PUT', { layoutData: { root: {}, content: [] } })).status).toBe(404);
            expect((await api(b, `/api/pages/${pageId}/publish/local/`, 'POST', {})).status).toBe(404);
            expect((await api(a, `/api/pages/${pageId}/`)).body.data.layoutData.content[0].props.content).toBe(marker);
        });
        await test.step('checkout is tenant-bound; signed events upgrade only that tenant and deduplicate', async () => {
            const checkout = await api(a, '/api/billing/checkout', 'POST', { plan_slug: 'basic' });
            expect(checkout.status).toBe(200);
            expect(checkout.body.url).toBe(`https://checkout.stripe.test/cus_${alice}`);
            expect((await api(b, '/api/billing/portal', 'POST', {})).status).toBe(400);
            const completed = { customer: `cus_${alice}`, subscription: `sub_${alice}`, status: 'complete', metadata: { tenant_slug: alice, plan_slug: 'basic' } };
            expect((await webhook(a, `evt_complete_${run}`, 'checkout.session.completed', completed)).status()).toBe(200);
            expect((await (await webhook(a, `evt_complete_${run}`, 'checkout.session.completed', completed)).json()).duplicate).toBe(true);
            expect((await api(a, '/api/tenants/me/plan')).body.plan.id).toBe('basic');
            expect((await api(b, '/api/tenants/me/plan')).body.plan.id).toBe('free');
            const portal = await api(a, '/api/billing/portal', 'POST', {});
            expect(portal.body.url).toBe(`https://billing.stripe.test/cus_${alice}`);
            const invoice = { customer: `cus_${alice}`, subscription: `sub_${alice}` };
            expect((await webhook(a, `evt_failed_${run}`, 'invoice.payment_failed', invoice)).status()).toBe(200);
            expect((await api(a, `/__e2e/tenant?slug=${alice}`)).body.status).toBe('past_due');
            expect((await webhook(a, `evt_paid_${run}`, 'invoice.payment_succeeded', invoice)).status()).toBe(200);
            expect((await api(a, `/__e2e/tenant?slug=${alice}`)).body.status).toBe('active');
            expect((await webhook(a, `evt_cancel_${run}`, 'customer.subscription.deleted', { ...invoice, id: `sub_${alice}` })).status()).toBe(200);
            expect((await api(a, '/api/tenants/me/plan')).body.plan.id).toBe('free');
        });
        await test.step('reset delivery seam changes password; logout and browser login use the new password', async () => {
            expect((await api(a, '/api/auth/forgot-password', 'POST', { email: `${alice}@example.test` })).status).toBe(200);
            const mailbox = await api(a, `/__e2e/reset?email=${alice}@example.test`);
            const token = mailbox.body.token;
            expect(token).toBeTruthy();
            const newPassword = `${password}-reset`;
            expect((await api(a, '/api/auth/reset-password', 'POST', { email: `${alice}@example.test`, token, password: newPassword })).status).toBe(200);
            expect((await api(a, '/api/auth/reset-password', 'POST', { email: `${alice}@example.test`, token, password })).status).toBe(400);
            expect((await api(a, '/api/auth/logout', 'POST', {})).status).toBe(200);
            expect((await api(a, '/api/auth/me')).status).toBe(401);
            expect((await api(a, '/api/auth/login', 'POST', { email: `${alice}@example.test`, password })).status).toBe(401);
            await a.goto(`${origin}/admin/login`);
            await a.getByRole('textbox', { name: /email|admin@/i }).fill(`${alice}@example.test`);
            await a.locator('input[type="password"]').fill(newPassword);
            await a.getByRole('button', { name: /sign in/i }).click();
            await expect(a.getByRole('link', { name: /builder studio/i })).toBeVisible();
        });
    } finally { await Promise.all(contexts.map((c) => c.close())); }
});
