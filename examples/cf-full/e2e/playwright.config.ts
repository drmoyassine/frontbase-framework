/**
 * CF-22 Gate 4 — browser acceptance against the REAL deployable Worker.
 *
 * `wrangler dev` runs dist/worker.mjs on workerd with a local D1 and the real
 * Static Assets binding, so this exercises the same artifact `deploy:cf-full`
 * ships — not an in-process approximation. That distinction matters: the
 * in-process smoke suite was green while the console was hitting 404s in a
 * browser, because it tested contract paths rather than the paths the console
 * actually calls.
 *
 *   pnpm --filter @frontbase/example-cf-full e2e
 *
 * Against a deployed worker instead (Gate 4 part 2):
 *   E2E_BASE_URL=https://<worker>.workers.dev pnpm --filter @frontbase/example-cf-full e2e
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8788);
const externalTarget = process.env.E2E_BASE_URL;
const baseURL = externalTarget ?? `http://127.0.0.1:${PORT}`;

// Credentials the local worker seeds on first boot. Against a deployed target the
// caller supplies real ones; nothing here is a production secret.
export const ADMIN = {
    email: process.env.E2E_ADMIN_EMAIL ?? 'owner@example.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'correct horse battery staple',
};

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.ts',
    // The suite drives one console session and mutates real rows; serial keeps
    // the assertions about "what the list contains" meaningful.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
    timeout: 60_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL,
        // Failure evidence is the point of this gate — keep it for every failure.
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        actionTimeout: 15_000,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Only manage a server when testing locally; an external target is already up.
    webServer: externalTarget ? undefined : {
        command: [
            'node build.mjs && wrangler dev',
            `--port ${PORT}`,
            '--var SESSION_SECRET:e2e-secret-not-for-prod-0123456789abcdef',
            `--var ADMIN_EMAIL:${ADMIN.email}`,
            `--var ADMIN_PASSWORD:${ADMIN.password}`,
        ].join(' '),
        cwd: '..',
        url: `http://127.0.0.1:${PORT}/api/console/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
