/**
 * RULE 8 mutation harness — shared library.
 *
 * A security/isolation/no-leak gate is worthless until a mutation proves it
 * FAILS. This lib runs each gate against a DELIBERATELY BROKEN guarantee and
 * asserts the gate goes RED. A mutation that leaves the gate green means the
 * gate tests the wrong thing — that's the finding to fix (review-fix).
 *
 * Two mutation kinds:
 *   - SOURCE mutation: edit the package's .ts that implements the guarantee,
 *     rebuild, run the real gate, expect non-zero exit, restore.
 *   - ARTIFACT mutation (no-leak): build a deliberately-leaky artifact and run
 *     the gate's exclusion check, expecting it to FIRE (i.e., the gate WOULD
 *     fail — proving the check is not a no-op).
 *
 * Source originals are restored in a `finally` so a crash never leaves a package
 * broken. After all mutations, the package is rebuilt once to confirm green.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FW = fileURLToPath(new URL('../', import.meta.url));

let total = 0, wentRed = 0, stayedGreen = 0;
const evidence = [];

/** Mutate a source file, run `fn`, always restore the original. */
export async function withSourceMutation(label, file, find, replace, fn) {
    const abs = file.startsWith('/') || /^[A-Za-z]:/.test(file) ? file : FW + file;
    const original = readFileSync(abs, 'utf8');
    if (!original.includes(find)) {
        evidence.push({ label, result: 'MUTATION_MISS', detail: `find-string not in ${file}` });
        total++; stayedGreen++;
        console.log(`  ⚠️  ${label}: MUTATION MISS (find-string not found — fix the mutation)`);
        return;
    }
    writeFileSync(abs, original.replace(find, replace));
    try {
        await fn();
    } finally {
        writeFileSync(abs, original);
    }
}

/** Rebuild a package (tsc). Returns true on success. */
export function buildPackage(pkg) {
    const pnpmCli = process.env.npm_execpath;
    const executable = process.platform === 'win32' && pnpmCli ? process.execPath : 'pnpm';
    const args = process.platform === 'win32' && pnpmCli
        ? [pnpmCli, '--filter', pkg, 'build']
        : ['--filter', pkg, 'build'];
    const r = spawnSync(executable, args, { cwd: FW, encoding: 'utf8' });
    if (r.status !== 0) {
        const detail = r.error?.message || r.stderr || r.stdout || `exit ${String(r.status)}`;
        console.error(`build failed for ${pkg}: ${String(detail).trim()}`);
    }
    return r.status === 0;
}

/** Run a gate script in a package; returns its exit code (0 = green/pass, ≠0 = red/fail). */
export function runGate(pkgDir, script, args = []) {
    const r = spawnSync('node', [script, ...args], { cwd: pkgDir });
    return r.status ?? 0;
}

/** Assert a gate went RED (non-zero) under mutation — the RULE 8 proof. */
export function expectRed(label, exitCode, detail = '') {
    total++;
    if (exitCode !== 0) {
        wentRed++;
        evidence.push({ label, result: 'RED', detail });
        console.log(`  ✅ ${label}: gate went RED (exit ${exitCode}) — the guarantee is real`);
    } else {
        stayedGreen++;
        evidence.push({ label, result: 'STAYED_GREEN', detail });
        console.log(`  ❌ ${label}: gate STAYED GREEN under mutation — HOLLOW GATE, fix it`);
    }
}

/** Assert an exclusion check FIRED on a leaky artifact (no-leak mutation). */
export function expectFired(label, fired, detail = '') {
    total++;
    if (fired) {
        wentRed++;
        evidence.push({ label, result: 'FIRED', detail });
        console.log(`  ✅ ${label}: exclusion check fired on the leaky artifact — real`);
    } else {
        stayedGreen++;
        evidence.push({ label, result: 'NO_FIRE', detail });
        console.log(`  ❌ ${label}: exclusion check did NOT fire on a leaky artifact — HOLLOW`);
    }
}

/** Print the summary and exit non-zero if any gate stayed green / didn't fire. */
export function summarize(pkg) {
    console.log(`\n${pkg} mutation harness: ${wentRed}/${total} gates proven RED on break${stayedGreen ? ` · ${stayedGreen} HOLLOW` : ''}`);
    if (stayedGreen > 0) {
        console.log(`\n${pkg}: mutation: FAIL ❌ (${stayedGreen} gate(s) not proven)`);
        process.exit(1);
    }
    console.log(`${pkg}: mutation: PASS ✅`);
}

export const repoRoot = FW;
export { evidence };
