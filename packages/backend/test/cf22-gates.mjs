/**
 * One-command CF-22 gate runner: contract/response, derived behavior, negative
 * inputs, auth/key security, tenant isolation, and mutation proof.
 */
import { spawnSync } from 'node:child_process';

const gates = [
    ['contract drift', 'contract-diff.mjs', []],
    ['route registration', 'routed-ops.mjs', []],
    ['response + behavior', 'compat-conformance.mjs', ['--gate', '--behavior', '--behavior-gate']],
    ['negative/fuzz', 'compat-negative.mjs', []],
    ['tenant isolation', 'compat-tenant-matrix.mjs', []],
    ['API-key security', 'compat-security.mjs', []],
    ['auth/reset behavior', 'compat-behavior-auth.mjs', ['--gate']],
    ['mutation proof', 'mutation.mjs', []],
];

for (const [label, script, args] of gates) {
    console.log(`\n=== CF-22: ${label} ===`);
    const result = spawnSync(process.execPath, [`test/${script}`, ...args], {
        cwd: new URL('..', import.meta.url),
        stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('\nCF-22 gates: PASS — response, behavior, fuzz, security, and isolation are green');
