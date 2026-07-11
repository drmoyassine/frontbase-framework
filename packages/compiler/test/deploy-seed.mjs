/**
 * CF-19 deploy-seed gate. The `frontbase deploy --admin-email/--admin-password`
 * flow must push secrets to wrangler CORRECTLY and SAFELY:
 *   - the right secret NAMES are set (SESSION_SECRET always; ADMIN_* when seeding)
 *   - SESSION_SECRET is auto-generated when not supplied
 *   - every secret VALUE travels on STDIN — NEVER as an argv element (process-list
 *     leak) and NEVER in the returned summary/details
 *   - --admin-email without --admin-password fails fast (before any wrangler call)
 *
 * wrangler is mocked via the runWrangler seam (no Cloudflare account, no network).
 * The fixture wrangler.toml already declares a d1 binding so provisionD1 no-ops.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployCommand } from '../dist/cli/deploy.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'fb-deploy-seed-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'sw.ts'), '// sw');
    writeFileSync(join(dir, 'src', 'worker.ts'), '// worker');
    // Pre-declare a d1 binding so provisionD1 reuses it (no real wrangler d1 create).
    writeFileSync(join(dir, 'wrangler.toml'),
        'name = "t"\nmain = "dist/worker.mjs"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "t-db"\ndatabase_id = "abc"\n');
    return dir;
}

/** A recording wrangler mock: captures every { args, stdin } and succeeds. */
function recorder() {
    const calls = [];
    const runWrangler = async (args, { stdin }) => { calls.push({ args, stdin }); return { code: 0, stdout: 'ok', stderr: '' }; };
    return { calls, runWrangler };
}

const SENTINEL_SESSION = 'GENERATED_SESSION_SENTINEL_b64';
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery staple!';
const SETUP = 'setup-tok-123';

// ── 1. Full seeding run ───────────────────────────────────────────────────────
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', {
        cwd: fixture(), target: 'cloudflare',
        adminEmail: EMAIL, adminPassword: PASSWORD, setupToken: SETUP,
        runWrangler, genSecret: () => SENTINEL_SESSION,
    });
    check('deploy succeeded', res.ok === true);

    const put = (name) => calls.find((c) => c.args[0] === 'secret' && c.args[1] === 'put' && c.args[2] === name);
    check('wrangler deploy was invoked', calls.some((c) => c.args.length === 1 && c.args[0] === 'deploy'));
    check('deploy ran BEFORE any secret put', calls.findIndex((c) => c.args[0] === 'deploy') < calls.findIndex((c) => c.args[0] === 'secret'));

    check('SESSION_SECRET set, value auto-generated, on stdin', put('SESSION_SECRET')?.stdin === SENTINEL_SESSION);
    check('details.sessionSecretGenerated = true', res.details?.sessionSecretGenerated === true);
    check('ADMIN_EMAIL set on stdin', put('ADMIN_EMAIL')?.stdin === EMAIL);
    check('ADMIN_PASSWORD set on stdin', put('ADMIN_PASSWORD')?.stdin === PASSWORD);
    check("ADMIN_ROLE defaults to 'owner' on stdin", put('ADMIN_ROLE')?.stdin === 'owner');
    check('SETUP_TOKEN set on stdin', put('SETUP_TOKEN')?.stdin === SETUP);

    // THE security guarantee: no secret VALUE ever appears in an argv element.
    const allArgs = calls.flatMap((c) => c.args);
    const leaked = [SENTINEL_SESSION, EMAIL, PASSWORD, SETUP].filter((v) => allArgs.includes(v));
    check('NO secret value leaked to argv (process list)', leaked.length === 0);

    // …nor in the returned result (summary/details are names-only).
    const serialized = JSON.stringify(res);
    const leakedOut = [SENTINEL_SESSION, PASSWORD, SETUP].filter((v) => serialized.includes(v));
    check('NO secret value leaked to the deploy result', leakedOut.length === 0);
    check('details.secretsSet is NAMES only', JSON.stringify(res.details?.secretsSet) === JSON.stringify(['SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_ROLE', 'SETUP_TOKEN']));
}

// ── 2. --admin-email WITHOUT --admin-password fails fast (no wrangler calls) ────
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', { cwd: fixture(), target: 'cloudflare', adminEmail: EMAIL, runWrangler, genSecret: () => SENTINEL_SESSION });
    check('email without password → ok:false', res.ok === false);
    check('email without password → no wrangler calls made', calls.length === 0);
}

// ── 3. Explicit --session-secret is used verbatim, not generated ───────────────
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', { cwd: fixture(), target: 'cloudflare', sessionSecret: 'my-own-key', runWrangler, genSecret: () => SENTINEL_SESSION });
    const put = calls.find((c) => c.args[2] === 'SESSION_SECRET');
    check('explicit session secret used on stdin', put?.stdin === 'my-own-key');
    check('sessionSecretGenerated = false when provided', res.details?.sessionSecretGenerated === false);
    check('no ADMIN_* secrets when not seeding', !calls.some((c) => String(c.args[2]).startsWith('ADMIN_')));
    check('no SETUP_TOKEN when not provided', !calls.some((c) => c.args[2] === 'SETUP_TOKEN'));
}

console.log(failures === 0 ? '\ndeploy-seed: PASS ✅' : `\ndeploy-seed: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
