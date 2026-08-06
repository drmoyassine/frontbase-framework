/**
 * CF-22 Gate 4 — the product console, in a real browser, against the real Worker.
 *
 * Everything before this gate tested the API surface. This tests the thing the
 * original complaint was about: does the console the user actually sees work.
 *
 * The distinction is not academic. Every in-process gate was green (286/286
 * conformant) while the console was hitting 404s on `/api/pages` and
 * `/api/database/connections` — because the gates exercised the paths the
 * CONTRACT declares, and the console calls paths without the trailing slash,
 * which FastAPI 307s and the framework did not. Only a browser found that.
 *
 * What each area asserts:
 *   - the route renders its own heading (not a blank shell or an error boundary)
 *   - no uncaught page errors
 *   - no failed same-origin /api/* request
 * Plus a real create → list → delete round trip through the UI's own API layer.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { ADMIN } from './playwright.config';

const CONSOLE = '/frontbase-admin';

type Failure = { url: string; status: number };

/** Collect page errors and failed API calls for the duration of one navigation. */
function watch(page: Page): { errors: string[]; apiFailures: Failure[] } {
    const errors: string[] = [];
    const apiFailures: Failure[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (res) => {
        const url = new URL(res.url());
        if (!url.pathname.startsWith('/api/')) return;
        if (res.status() < 400) return;
        apiFailures.push({ url: url.pathname + url.search, status: res.status() });
    });
    return { errors, apiFailures };
}

async function login(page: Page): Promise<void> {
    await page.goto(CONSOLE, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: /email|admin@/i }).fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    // The shell is the signal the session took: the sidebar only renders authed.
    await expect(page.getByRole('link', { name: /builder studio/i })).toBeVisible();
}

test.describe('CF-22 Gate 4 — console acceptance', () => {
    test.describe.configure({ mode: 'serial' });

    test('1. public eSSR homepage renders (engine-owned, not the console)', async ({ page }) => {
        const seen = watch(page);
        const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
        expect(res?.status()).toBe(200);
        // The engine's eSSR marker — proves GET / did not get shadowed by the
        // compat surface's JSON root when a browser (Accept: text/html) asks.
        expect(await page.content()).toContain('chimera-rendered-by');
        expect(seen.errors).toEqual([]);
    });

    test('2. login gate rejects a bad password, accepts a good one', async ({ page }) => {
        await page.goto(CONSOLE, { waitUntil: 'domcontentloaded' });
        await page.getByRole('textbox', { name: /email|admin@/i }).fill(ADMIN.email);
        await page.locator('input[type="password"]').fill('definitely-not-the-password');
        await page.getByRole('button', { name: /sign in/i }).click();
        // Stays on the login form — the sidebar must not appear.
        await expect(page.getByRole('link', { name: /builder studio/i })).toHaveCount(0);

        await page.locator('input[type="password"]').fill(ADMIN.password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page.getByRole('link', { name: /builder studio/i })).toBeVisible();
    });

    // Each nav area: renders its own content, no page errors, no failed API call.
    const AREAS = [
        { name: '3. Dashboard', path: '/dashboard', heading: /dashboard/i },
        { name: '4. Builder Studio', path: '/pages', heading: /pages/i },
        { name: '5. Data Studio', path: '/data-studio', heading: /data studio|database/i },
        { name: '6. App Users', path: '/users', heading: /users/i },
        { name: '7. File Storage', path: '/storage', heading: /storage/i },
        { name: '8. Automations', path: '/automations', heading: /automations/i },
        { name: '9. Edge Resources', path: '/edge', heading: /edge/i },
        { name: '10. Settings', path: '/settings', heading: /settings/i },
    ];

    for (const area of AREAS) {
        test(`${area.name} renders with no page or API errors`, async ({ page }) => {
            const seen = watch(page);
            await login(page);
            await page.goto(CONSOLE + area.path, { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('heading', { name: area.heading }).first()).toBeVisible();
            // networkidle is flaky under HMR-less static serving; settle explicitly.
            await page.waitForLoadState('networkidle').catch(() => {});
            expect(seen.apiFailures, `failed API calls on ${area.path}`).toEqual([]);
            expect(seen.errors, `page errors on ${area.path}`).toEqual([]);
        });
    }

    test('11. real CRUD round trip — create a page, see it listed, delete it', async ({ page }) => {
        const seen = watch(page);
        await login(page);
        const slug = `e2e-${Date.now()}`;

        // Drive the console's own API layer from the page context, so the request
        // carries the session cookie and goes through the same client the UI uses.
        const created = await page.evaluate(async (s) => {
            const r = await fetch('/api/pages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: `E2E ${s}`, slug: s }),
                credentials: 'include',
            });
            return { status: r.status, body: await r.json() };
        }, slug);
        // 201 here also proves the trailing-slash 307 preserved method AND body:
        // the console calls /api/pages, the contract declares /api/pages/.
        expect(created.status).toBe(201);
        const id = created.body?.data?.id;
        expect(id, 'created page id').toBeTruthy();

        await page.goto(CONSOLE + '/pages', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(slug, { exact: false }).first()).toBeVisible();

        const deleted = await page.evaluate(async (pageId) => {
            const r = await fetch(`/api/pages/${pageId}/`, { method: 'DELETE', credentials: 'include' });
            return r.status;
        }, id);
        expect(deleted).toBeLessThan(400);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByText(slug, { exact: false })).toHaveCount(0);
        expect(seen.errors).toEqual([]);
    });

    test('12. session cookie is HttpOnly and SameSite-protected', async ({ page, context }) => {
        await login(page);
        const session = (await context.cookies()).find((c) => c.name === 'frontbase_session');
        expect(session, 'frontbase_session cookie').toBeTruthy();
        expect(session!.httpOnly, 'frontbase_session must be HttpOnly (not readable by JS)').toBe(true);
        expect(session!.sameSite, 'frontbase_session must be SameSite').not.toBe('None');
        // `secure` is only assertable over https — checked on the deployed run.
        if (new URL(page.url()).protocol === 'https:') {
            expect(session!.secure, 'frontbase_session must be Secure over https').toBe(true);
        }
    });

    test('13. hashed console assets are served immutable', async ({ page }) => {
        const assets: Request[] = [];
        page.on('request', (r) => {
            if (/\/frontbase-admin\/assets\/.+\.(js|css)$/.test(new URL(r.url()).pathname)) assets.push(r);
        });
        await page.goto(CONSOLE, { waitUntil: 'load' });
        expect(assets.length, 'console loaded at least one hashed asset').toBeGreaterThan(0);
        const res = await assets[0]!.response();
        expect(res?.status()).toBe(200);
        expect(res?.headers()['cache-control'] ?? '').toContain('immutable');
    });

    test('14. logging out revokes access to the console', async ({ page }) => {
        await login(page);
        await page.getByRole('button', { name: /log out/i }).click();
        await expect(page.getByRole('link', { name: /builder studio/i })).toHaveCount(0);
        // And the API refuses the cleared session rather than just hiding the UI.
        const status = await page.evaluate(async () => {
            const r = await fetch('/api/auth/me', { credentials: 'include' });
            return r.status;
        });
        expect(status).toBe(401);
    });

    test('15. legacy console API is gone while setup and health remain', async ({ request }) => {
        expect((await request.get('/api/console/health')).status()).toBe(200);
        expect((await request.get('/api/console/setup/status')).status()).toBe(200);

        const assertRetired = async (response: Awaited<ReturnType<typeof request.get>>) => {
            expect(response.status()).toBe(410);
            expect((await response.json()).detail).toContain('retired');
        };
        await assertRetired(await request.get('/api/console'));
        await assertRetired(await request.get('/api/console/me'));
        await assertRetired(await request.post('/api/console/login', { data: {} }));
        await assertRetired(await request.get('/api/console/pages'));
        await assertRetired(await request.patch('/api/console/not-a-route', { data: {} }));
    });
});
