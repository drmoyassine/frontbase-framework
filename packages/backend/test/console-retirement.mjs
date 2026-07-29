import { createConsole } from '../dist/index.js';
import { createEngine, directProvider } from '@frontbase/edge-core';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const consoleApp = await createConsole({
    makeRunner: () => runner,
    sessionSecret: 'console-retirement-test-secret',
    setupToken: 'setup-capability',
    retireLegacyApi: true,
});
const manifest = {
    version: 'console-retirement',
    pages: {},
    queries: {},
};
const app = createEngine({
    manifest,
    data: directProvider(manifest),
    environment: 'edge',
    console: consoleApp,
});

const checks = [];
const check = (name, condition) => checks.push({ name, condition });
const request = (path, init) => app.fetch(new Request(`https://test.local/api/console${path}`, init));

check('health remains available', (await request('/health')).status === 200);
check('setup status remains available', (await request('/setup/status')).status === 200);
check('legacy root is 410', (await request('')).status === 410);
check('legacy login is 410', (await request('/login', { method: 'POST', body: '{}' })).status === 410);
check('legacy pages are 410', (await request('/pages')).status === 410);
check('legacy write is 410', (await request('/drafts/home', { method: 'PUT', body: '{}' })).status === 410);
const unknown = await request('/anything-else', { method: 'PATCH', body: '{}' });
check('unknown legacy routes and methods are 410', unknown.status === 410);
check('retirement response is explicit', (await unknown.json()).detail?.includes('retired') === true);

for (const result of checks) {
    console.log(`${result.condition ? 'PASS' : 'FAIL'} ${result.name}`);
}
if (checks.some((result) => !result.condition)) process.exit(1);
console.log(`console retirement: ${checks.length}/${checks.length} passed`);
