import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.CLOUD_E2E_PORT ?? 8791);
export default defineConfig({
    testDir: './cloud', testMatch: '*.spec.ts', workers: 1, fullyParallel: false,
    forbidOnly: !!process.env.CI, retries: 0, timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [['list']], outputDir: './test-results/cloud',
    use: { baseURL: `http://app.localhost:${port}`, trace: 'off', screenshot: 'off', video: 'off' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'node .cloud-e2e/server.mjs', cwd: '..',
        url: `http://127.0.0.1:${port}/api/console/health`,
        reuseExistingServer: false, timeout: 30_000,
    },
});
