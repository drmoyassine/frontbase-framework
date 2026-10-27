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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

/** A recording wrangler mock: captures every { args, stdin } and succeeds.
 *  `deployments list` (the app-existence check) reports "does not exist" by
 *  default — these tests exercise the FRESH-deploy path, matching a real
 *  `deployCommand` call where the app hasn't been created yet. */
function recorder() {
    const calls = [];
    const runWrangler = async (args, { stdin } = {}) => {
        calls.push({ args, stdin });
        if (args[0] === 'deployments' && args[1] === 'list') {
            return { code: 1, stdout: '', stderr: 'This Worker does not exist on your account. [code: 10007]' };
        }
        if (args[0] === 'd1' && args[1] === 'create') {
            // The fixture's wrangler.toml declares "t-db", but the resolved
            // appName (explicit or randomly generated) rarely matches it, so
            // provisionD1 correctly goes through a real create call here too —
            // this must return a parseable id, not a bare 'ok'.
            return { code: 0, stdout: JSON.stringify({ uuid: 'cccccccc-2222-3333-4444-555555555555' }), stderr: '' };
        }
        if (args[0] === 'deploy') {
            return { code: 0, stdout: '  https://test-app.test-account.workers.dev\n', stderr: '' };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
    };
    return { calls, runWrangler };
}

const SENTINEL_SESSION = 'GENERATED_SESSION_SENTINEL_b64';
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery staple!';
const SETUP = 'setup-tok-123';
const GENERATED_SETUP = 'generated-setup-capability';
const FIXED_NOW = Date.parse('2026-07-16T10:00:00.000Z');

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
    const expectedAppName = res.details?.appName;
    // deploy now runs with --name <appName> (app-identity, see app-identity.mjs
    // for the naming/existence-check behavior itself — this test only cares that
    // the deploy call happened and happened before secrets).
    check('wrangler deploy was invoked', calls.some((c) => c.args[0] === 'deploy' && c.args[1] === '--name'));
    check('secret puts target the resolved app worker', calls.some((c) => c.args[0] === 'secret' && c.args[1] === 'put' && c.args[3] === '--name' && c.args[4] === expectedAppName));
    check('deploy ran AFTER secret puts', calls.findIndex((c) => c.args[0] === 'deploy') > calls.findIndex((c) => c.args[0] === 'secret'));

    check('SESSION_SECRET set, value auto-generated, on stdin', put('SESSION_SECRET')?.stdin === SENTINEL_SESSION);
    check('details.sessionSecretGenerated = true', res.details?.sessionSecretGenerated === true);
    check('ADMIN_EMAIL set on stdin', put('ADMIN_EMAIL')?.stdin === EMAIL);
    check('ADMIN_PASSWORD set on stdin', put('ADMIN_PASSWORD')?.stdin === PASSWORD);
    check("ADMIN_ROLE defaults to 'master_admin' on stdin for product self-host", put('ADMIN_ROLE')?.stdin === 'master_admin');
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

// Invalid setup TTL fails before provisioning or secret changes.
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', { cwd: fixture(), target: 'cloudflare', setupTtlMinutes: 1, runWrangler });
    check('invalid setup TTL → ok:false', res.ok === false);
    check('invalid setup TTL → no wrangler calls made', calls.length === 0);
}

// ── 3. Explicit --session-secret is used verbatim, not generated ───────────────
{
    const { calls, runWrangler } = recorder();
    let setupLink;
    const res = await deployCommand('.', {
        cwd: fixture(), target: 'cloudflare', sessionSecret: 'my-own-key', runWrangler,
        genSecret: () => SENTINEL_SESSION,
        genSetupToken: () => GENERATED_SETUP,
        nowMs: () => FIXED_NOW,
        onSetupLink: (link) => { setupLink = link; },
    });
    const put = calls.find((c) => c.args[2] === 'SESSION_SECRET');
    check('explicit session secret used on stdin', put?.stdin === 'my-own-key');
    check('sessionSecretGenerated = false when provided', res.details?.sessionSecretGenerated === false);
    check('no ADMIN_* secrets when not seeding', !calls.some((c) => String(c.args[2]).startsWith('ADMIN_')));
    check('fresh no-admin deploy auto-generates SETUP_TOKEN', calls.find((c) => c.args[2] === 'SETUP_TOKEN')?.stdin === GENERATED_SETUP);
    check('fresh no-admin deploy sets 30-minute expiry', calls.find((c) => c.args[2] === 'SETUP_EXPIRES_AT')?.stdin === '2026-07-16T10:30:00.000Z');
    check('setup link delivered through the sensitive callback', setupLink?.url.includes(`/setup#/setup?claim=${GENERATED_SETUP}`));
    check('setup link reports its expiry', setupLink?.expiresAt === '2026-07-16T10:30:00.000Z');
    check('raw setup capability NOT returned in result', !JSON.stringify(res).includes(GENERATED_SETUP));
    check('result reports setup link generated without the secret', res.details?.setupLinkGenerated === true);
}

// ── 4. --app-name given, app ALREADY EXISTS on Cloudflare → redeploy, reusing
//    its D1 database (THE bug this closes: a second deploy under an existing
//    app name used to try `wrangler d1 create <name>-db` unconditionally and
//    fail with "A database with that name already exists"). ─────────────────
{
    const calls = [];
    const EXISTING_DB_ID = 'already-provisioned-uuid-999';
    const runWrangler = async (args, { stdin } = {}) => {
        calls.push({ args, stdin });
        if (args.join(' ') === 'deployments list --name my-existing-app') return { code: 0, stdout: '[history]', stderr: '' };
        if (args.join(' ') === 'd1 info my-existing-app-db --json') return { code: 0, stdout: JSON.stringify({ uuid: EXISTING_DB_ID }), stderr: '' };
        if (args[0] === 'd1' && args[1] === 'create') { calls.push({ FAIL: 'd1 create should NEVER be called on a redeploy' }); return { code: 1, stdout: '', stderr: 'A database with that name already exists' }; }
        if (args[0] === 'deploy') return { code: 0, stdout: '  https://my-existing-app.test-account.workers.dev\n', stderr: '' };
        return { code: 0, stdout: 'ok', stderr: '' };
    };
    // Fresh cwd with NO local wrangler.toml binding at all — simulates deploying
    // from a checkout that has never seen this app before (a different machine,
    // a fresh clone) — the local file is NOT the source of truth, Cloudflare is.
    const dir = mkdtempSync(join(tmpdir(), 'fb-deploy-seed-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'sw.ts'), '// sw');
    writeFileSync(join(dir, 'src', 'worker.ts'), '// worker');
    writeFileSync(join(dir, 'wrangler.toml'), 'name = "placeholder"\nmain = "dist/worker.mjs"\n');

    const res = await deployCommand('.', { cwd: dir, target: 'cloudflare', appName: 'my-existing-app', runWrangler });
    check('redeploy of an existing app succeeds', res.ok === true);
    check('redeploy summary says "redeployed", not "fresh"', /redeployed/.test(res.summary));
    check('details.appExisted = true', res.details?.appExisted === true);
    check('`wrangler d1 create` was NEVER called (reused the looked-up id instead)', !calls.some((c) => c.args?.[0] === 'd1' && c.args?.[1] === 'create'));
    check('the EXISTING database id ended up in wrangler.toml (not a newly-created one)', readFileSync(join(dir, 'wrangler.toml'), 'utf8').includes(EXISTING_DB_ID));
    check('`wrangler deploy --name my-existing-app` was called', calls.some((c) => c.args?.join(' ') === 'deploy --name my-existing-app'));
    // SESSION_SECRET must NOT be auto-rotated on a redeploy (would silently log
    // out every admin) — only pushed if the caller explicitly supplied one.
    check('SESSION_SECRET NOT auto-rotated on redeploy (no value given)', !calls.some((c) => c.args?.[2] === 'SESSION_SECRET'));
    check('SETUP_TOKEN NOT auto-rotated on ordinary redeploy', !calls.some((c) => c.args?.[2] === 'SETUP_TOKEN'));
    check('details.sessionSecretGenerated = false on redeploy', res.details?.sessionSecretGenerated === false);

    const beforeRecovery = calls.length;
    let recoveryLink;
    const recovery = await deployCommand('.', {
        cwd: dir,
        target: 'cloudflare',
        appName: 'my-existing-app',
        setupLink: true,
        runWrangler,
        genSetupToken: () => GENERATED_SETUP,
        nowMs: () => FIXED_NOW,
        onSetupLink: (link) => { recoveryLink = link; },
    });
    const recoveryCalls = calls.slice(beforeRecovery);
    check('--setup-link recovery redeploy succeeds', recovery.ok === true);
    check('--setup-link rotates SETUP_TOKEN', recoveryCalls.find((c) => c.args?.[2] === 'SETUP_TOKEN')?.stdin === GENERATED_SETUP);
    check('--setup-link sets a new expiry', recoveryCalls.find((c) => c.args?.[2] === 'SETUP_EXPIRES_AT')?.stdin === '2026-07-16T10:30:00.000Z');
    check('--setup-link returns the new link only through callback', recoveryLink?.url.includes(`/setup#/setup?claim=${GENERATED_SETUP}`));
}

// ── 5. --app-name given, app does NOT exist → fresh provision under that name ──
{
    const calls = [];
    const FRESH_ID = 'aaaaaaaa-2222-3333-4444-555555555555';
    const runWrangler = async (args, { stdin } = {}) => {
        calls.push({ args, stdin });
        if (args.join(' ') === 'deployments list --name a-fresh-named-app') return { code: 1, stdout: '', stderr: 'code: 10007' };
        if (args[0] === 'd1' && args[1] === 'create') return { code: 0, stdout: JSON.stringify({ uuid: FRESH_ID }), stderr: '' };
        return { code: 0, stdout: 'ok', stderr: '' };
    };
    const res = await deployCommand('.', { cwd: fixture(), target: 'cloudflare', appName: 'a-fresh-named-app', runWrangler, genSecret: () => SENTINEL_SESSION });
    // NOTE: fixture()'s wrangler.toml declares "t-db", which does NOT match
    // this app's resolved name ("a-fresh-named-app-db") — provisionD1 correctly
    // does NOT reuse it (that binding belongs to a different app) and instead
    // creates fresh under this app's name (handled by this test's own
    // runWrangler mock above). This checks the EXISTENCE-CHECK path chose the
    // fresh branch (appExisted:false).
    check('fresh named app: appExisted = false', res.details?.appExisted === false);
    check('fresh named app: summary says fresh', /fresh/.test(res.summary));
    check('fresh named app: SESSION_SECRET IS auto-generated (fresh deploy)', res.details?.sessionSecretGenerated === true);
}

// ── 6. NO --app-name at all → ALWAYS fresh, a random unused name is generated ──
{
    const calls = [];
    const generatedCandidates = [];
    const runWrangler = async (args, { stdin } = {}) => {
        calls.push({ args, stdin });
        if (args[0] === 'deployments' && args[1] === 'list') {
            generatedCandidates.push(args[3]);
            return { code: 1, stdout: '', stderr: 'code: 10007' }; // first candidate is always free
        }
        if (args[0] === 'd1' && args[1] === 'create') return { code: 0, stdout: JSON.stringify({ uuid: 'bbbbbbbb-2222-3333-4444-555555555555' }), stderr: '' };
        return { code: 0, stdout: 'ok', stderr: '' };
    };
    const res = await deployCommand('.', { cwd: fixture(), target: 'cloudflare', runWrangler, rand: () => 0.5 });
    check('no --app-name: deploy succeeds with a generated name', res.ok === true);
    check('no --app-name: a random name was checked against Cloudflare', generatedCandidates.length === 1 && /^[a-z]+-[a-z]+$/.test(generatedCandidates[0]));
    check('no --app-name: details.appName is the generated name', res.details?.appName === generatedCandidates[0]);
    check('no --app-name: appExisted = false (always fresh)', res.details?.appExisted === false);
    check('no --app-name: `wrangler deploy --name <generated>` was called', calls.some((c) => c.args?.join(' ') === `deploy --name ${generatedCandidates[0]}`));
}

console.log(failures === 0 ? '\ndeploy-seed: PASS ✅' : `\ndeploy-seed: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
