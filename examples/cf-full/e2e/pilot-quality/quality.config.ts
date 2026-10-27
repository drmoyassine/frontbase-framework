/**
 * Workstream C (swarm2, quality-usability) — independent Playwright acceptance
 * for the WordPress pilot directory surfaces.
 *
 * Drives the REAL built self-host artifact (examples/cf-full/dist/node.mjs —
 * build it first with `node build.mjs` in examples/cf-full) on loopback port
 * 4393 (override: PILOT_QUALITY_PORT) with an ephemeral per-run SQLite state
 * database. Never touches port 4389, the primary's server, its database or any
 * shared pilot state.
 *
 *   pnpm e2e:quality        (from examples/cf-full)
 *   PILOT_QUALITY_EVIDENCE_DIR=/private/dir pnpm e2e:quality
 *
 * Screenshots/metrics go to PILOT_QUALITY_EVIDENCE_DIR when set (private
 * evidence directory — never into Git); traces of failures stay in the
 * gitignored test-results folder.
 *
 * NOTE: Playwright evaluates this file in the runner process AND again in
 * every worker process. The runner therefore publishes the per-run ephemeral
 * paths (DB URL, state file) to a fixed bootstrap file in the temp dir, which
 * globalSetup (runner process) and the specs (worker processes) read back —
 * worker re-imports must not regenerate or overwrite those paths.
 */
import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN, SESSION_SECRET } from './fixture-data';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PILOT_QUALITY_PORT ?? 4393);
const baseURL = `http://127.0.0.1:${port}`;
const runId = randomUUID();
const dbFile = join(tmpdir(), `pilot-quality-${runId}.db`);
// Windows-safe file URL, same normalization the backend fixtures use.
const dbUrl = ('file:' + dbFile).replaceAll('\\', '/');
const statePath = join(tmpdir(), `pilot-quality-state-${runId}.json`);
const runDir = join(tmpdir(), 'pilot-quality-run');
const bootstrapPath = join(runDir, 'bootstrap.json');

if (!process.env.TEST_WORKER_INDEX) {
    // Runner process only (guarded so worker re-imports cannot clobber the
    // paths the server, globalSetup and specs must agree on).
    process.env.PILOT_QUALITY_DB_URL = dbUrl;
    process.env.PILOT_QUALITY_STATE = statePath;
    process.env.PILOT_QUALITY_BASE_URL = baseURL;
    mkdirSync(runDir, { recursive: true });
    writeFileSync(bootstrapPath, JSON.stringify({ dbUrl, statePath, baseURL, port }));
}

export default defineConfig({
    testDir: here,
    testMatch: '**/*.quality.ts',
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [['list']],
    outputDir: join(here, 'test-results', 'pilot-quality'),
    globalSetup: './seed/global-setup.ts',
    use: {
        baseURL,
        viewport: { width: 1280, height: 800 },
        trace: 'retain-on-failure',
        screenshot: 'off',
        video: 'off',
        actionTimeout: 15_000,
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
    webServer: {
        command: 'node dist/node.mjs',
        cwd: join(here, '..', '..'),
        url: `${baseURL}/api/console/health`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
            PORT: String(port),
            HOST: '127.0.0.1',
            APP_DB_URL: dbUrl,
            SESSION_SECRET,
            ADMIN_EMAIL: ADMIN.email,
            ADMIN_PASSWORD: ADMIN.password,
        },
    },
});
