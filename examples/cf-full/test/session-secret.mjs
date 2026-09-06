/**
 * resolveSessionSecret contract, proven rather than assumed. The resolver is
 * the one seam every one-click deploy (Deploy Button) boot flows through when
 * no operator-provided SESSION_SECRET exists, so these are the properties
 * every host inherits:
 *
 *   1. env wins — a non-empty (and whitespace-trimmed) SESSION_SECRET is
 *      returned verbatim, NOTHING is persisted (the Docker/CLI/smoke contract
 *      is byte-identical to pre-fallback behavior).
 *   2. generate + persist — first boot with no env secret stores 64 hex chars
 *      under settings['_system','boot.session_secret'].
 *   3. reuse — a second boot on the same state DB returns the SAME value with
 *      no second row (stable across isolates and redeploys).
 *   4. race convergence — a concurrent boot cannot create a second row
 *      (INSERT OR IGNORE); both readers see one winner.
 *
 * Pure unit level: a fake DbRunner over a Map models the (tenant_slug, key)
 * primary key and honors INSERT OR IGNORE — no SQL driver, no files.
 */
import { resolveSessionSecret } from '../dist/session-secret.mjs';

let failures = 0;
const check = (label, ok) =>
    ok ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`));

/** In-memory settings table with the real PK + OR IGNORE semantics. */
function fakeRunner() {
    const rows = new Map(); // slug+key → { value, updated_at }
    return {
        async query(sql, params = []) {
            if (/INSERT OR IGNORE/.test(sql)) {
                const [slug, key, value, at] = params;
                const id = slug + ' ' + key;
                if (!rows.has(id)) rows.set(id, { value, updated_at: at });
                return 1;
            }
            if (/SELECT value FROM settings/.test(sql)) {
                const [slug, key] = params;
                const row = rows.get(slug + ' ' + key);
                return row ? [{ value: row.value }] : [];
            }
            throw new Error('unexpected query: ' + sql);
        },
        async exec(sql, params = []) { return this.query(sql, params); },
        get rowCount() { return rows.size; },
        getRow(slug, key) { return rows.get(slug + ' ' + key); },
    };
}

console.log('=== session-secret resolver contract ===');

// 1. env wins — verbatim, nothing persisted.
{
    const runner = fakeRunner();
    const secret = await resolveSessionSecret(runner, '  env-provided-secret  ');
    check('non-empty env value is trimmed and returned verbatim', secret === 'env-provided-secret');
    check('env path never touches the settings table', runner.rowCount === 0);
}

// 1b. whitespace-only env counts as unset.
{
    const runner = fakeRunner();
    const secret = await resolveSessionSecret(runner, '   ');
    check('whitespace-only env falls through to generation', /^[0-9a-f]{64}$/.test(secret) && runner.rowCount === 1);
}

// 2 + 3. generate + persist, then reuse.
{
    const runner = fakeRunner();
    const first = await resolveSessionSecret(runner, undefined);
    check('generated secret is 64 hex chars (256-bit)', /^[0-9a-f]{64}$/.test(first));
    const row = runner.getRow('_system', 'boot.session_secret');
    check("persisted under settings['_system', 'boot.session_secret']", row?.value === first);
    const second = await resolveSessionSecret(runner, undefined);
    check('second boot reuses the persisted value', second === first && runner.rowCount === 1);
    // Distinct state DBs generate distinct secrets (no shared constant).
    const other = fakeRunner();
    check('independent deployments generate independent secrets', (await resolveSessionSecret(other, undefined)) !== first);
}

// 4. race: two boots against one state DB — OR IGNORE keeps one row, one value.
{
    const shared = fakeRunner();
    const [a, b] = await Promise.all([
        resolveSessionSecret(shared, undefined),
        resolveSessionSecret(shared, undefined),
    ]);
    check('racing boots converge on one persisted value', a === b && shared.rowCount === 1);
}

// 5. env override AFTER a generated secret existed.
{
    const runner = fakeRunner();
    await resolveSessionSecret(runner, undefined);
    const overridden = await resolveSessionSecret(runner, 'operator-rotated-secret');
    check('explicit env overrides the persisted generated value', overridden === 'operator-rotated-secret');
}

console.log(failures === 0 ? '\nsession-secret: PASS ✅' : `\nsession-secret: ${failures} FAILURE(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
