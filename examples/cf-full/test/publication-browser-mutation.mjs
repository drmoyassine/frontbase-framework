/** Test-only delivered-SW fault; never mutates production source. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const run = mutation => spawnSync(process.execPath, ['.publication-e2e/browser.mjs'], { encoding: 'utf8', timeout: 120000, env: { ...process.env, ...(mutation ? { PUBLICATION_BROWSER_MUTATION: mutation } : {}) } });
const baseline = run(); assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
const broken = run('retain-interception');
assert.equal(broken.status, 1, broken.stdout + broken.stderr);
assert.match(broken.stderr, /STALE_BAKED_DEMO/, 'red must identify stale browser interception');
console.log('publication controlled-browser delivered-SW fault: baseline PASS, retained interception RED (1/1), source unchanged');
