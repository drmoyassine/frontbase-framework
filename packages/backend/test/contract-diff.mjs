/**
 * CF-22 P1 / D3+D5 — the contract drift gate, proven GREEN on the committed
 * specs and RED on deliberate breaks (RULE 8 mutation proof).
 *
 *   green : committed framework spec vs vendored product spec → 0 missing, 0 divergent
 *   RED-1 : delete one op from the framework spec → gate detects MISSING
 *   RED-2 : corrupt one op's response schema      → gate detects DIVERGENT
 *
 * Drives scripts/contract-diff.mjs (with --framework overrides for the tampered
 * copies). Requires the framework spec emitted (contracts:emit) + backend built.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const GATE = resolve(root, 'scripts/contract-diff.mjs');
const FWK = resolve(root, 'packages/backend/contracts/framework.openapi.json');
const tmp = mkdtempSync(join(tmpdir(), 'cf22-gate-'));

const gate = (args = []) => spawnSync('node', [GATE, '--quiet', ...args], { cwd: root, encoding: 'utf-8' });
let failed = 0;
const check = (name, fn) => { try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); } };

// Green: committed specs.
check('committed framework spec is conformant (0 missing, 0 divergent)', () => {
    const res = gate();
    assert.equal(res.status, 0, `gate must pass on committed specs: ${res.stdout || res.stderr}`);
    // Counts grow as P2 waves land — just assert the shape + that variables is in.
    assert.match(res.stdout, /implemented=\d+ stubbed=\d+/);
    const [, impl] = res.stdout.match(/implemented=(\d+)/) ?? [];
    assert.ok(Number(impl) >= 6, `at least the P1 variables tag (6) must be implemented, got ${impl}`);
});

// RED-1: remove one op → MISSING detected.
check('mutation: a deleted op is detected as MISSING (gate goes RED)', () => {
    const spec = JSON.parse(readFileSync(FWK, 'utf-8'));
    const somePath = Object.keys(spec.paths).find((p) => p !== '/api/variables/');
    const mutated = JSON.parse(JSON.stringify(spec));
    delete mutated.paths[somePath];
    const mutatedPath = join(tmp, 'missing.json');
    writeFileSync(mutatedPath, JSON.stringify(mutated));
    const res = gate([`--framework=${mutatedPath}`]);
    assert.notEqual(res.status, 0, 'gate must fail when an op is missing');
    assert.match(res.stdout || res.stderr || '', /missing=1/);
});

// RED-2: corrupt an op's schema → DIVERGENT detected.
check('mutation: a corrupted schema is detected as DIVERGENT (gate goes RED)', () => {
    const spec = JSON.parse(readFileSync(FWK, 'utf-8'));
    const mutated = JSON.parse(JSON.stringify(spec));
    // Corrupt the first op's response schema (any op — stubs or implemented).
    outer: for (const [path, item] of Object.entries(mutated.paths)) {
        for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
            if (item[m]) {
                item[m].responses = { '200': { description: 'tampered' } };
                break outer;
            }
        }
    }
    const mutatedPath = join(tmp, 'divergent.json');
    writeFileSync(mutatedPath, JSON.stringify(mutated));
    const res = gate([`--framework=${mutatedPath}`]);
    assert.notEqual(res.status, 0, 'gate must fail when a schema diverges');
    assert.match(res.stdout || res.stderr || '', /divergent=\d/);
});

console.log(`\ncontract-diff: ${3 - failed}/3 passed`);
if (failed) process.exit(1);
