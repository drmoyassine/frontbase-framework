/**
 * A-25 WA9 — cloud-mode deploy wiring in `deployCommand` (wrangler mocked via
 * the runWrangler seam; no Cloudflare account, no network).
 *
 * Pinned invariants (correction 12): the two deployment-mode values ride
 * `wrangler deploy --var` — NON-secret, argv-safe, and NEVER written into
 * wrangler.toml (a committed mode var would flip every self-host reusing the
 * file into cloud boot). RESEND_API_KEY is the opposite case: a real secret,
 * so its VALUE travels on stdin only and never reaches argv or the returned
 * result (only its name is reported).
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployCommand } from '../dist/cli/deploy.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

function fixture() {
    const dir = mkdtempSync(join(tmpdir(), 'fb-deploy-cloud-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'sw.ts'), '// sw');
    writeFileSync(join(dir, 'src', 'worker.ts'), '// worker');
    // Pre-declare a d1 binding so provisionD1 reuses it (no real wrangler d1 create).
    writeFileSync(join(dir, 'wrangler.toml'),
        'name = "t"\nmain = "dist/worker.mjs"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "t-db"\ndatabase_id = "abc"\n');
    return dir;
}

/** Recording wrangler mock: fresh-deploy path, captures { args, stdin }. */
function recorder() {
    const calls = [];
    const runWrangler = async (args, { stdin } = {}) => {
        calls.push({ args, stdin });
        if (args[0] === 'deployments' && args[1] === 'list') {
            return { code: 1, stdout: '', stderr: 'This Worker does not exist on your account. [code: 10007]' };
        }
        if (args[0] === 'd1' && args[1] === 'create') {
            return { code: 0, stdout: JSON.stringify({ uuid: 'cccccccc-2222-3333-4444-555555555555' }), stderr: '' };
        }
        if (args[0] === 'deploy') {
            return { code: 0, stdout: '  https://test-app.test-account.workers.dev\n', stderr: '' };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
    };
    return { calls, runWrangler };
}

const deployCall = (calls) => calls.find((c) => c.args[0] === 'deploy');
const secretPut = (calls, name) => calls.find((c) => c.args[0] === 'secret' && c.args[2] === name);
const RESEND = 're_sk_SENTINEL';

console.log('— cloud mode: the --var pair + the Resend secret —');
{
    const dir = fixture();
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', {
        cwd: dir, target: 'cloudflare',
        appName: 'cloud-app', cloud: true, baseDomain: 'frontbase.dev',
        adminEmail: 'op@frontbase.test', adminPassword: 'pw-cloud', resendApiKey: RESEND,
        sessionSecret: 'fixed-session-secret',
        runWrangler,
    });
    check('cloud deploy succeeded', res.ok === true);
    const dep = deployCall(calls);
    check('deploy carries --var FRONTBASE_DEPLOYMENT_MODE:cloud', dep?.args.includes('FRONTBASE_DEPLOYMENT_MODE:cloud') === true
        && dep?.args[dep.args.indexOf('FRONTBASE_DEPLOYMENT_MODE:cloud') - 1] === '--var');
    check('deploy carries --var FRONTBASE_BASE_DOMAIN:frontbase.dev', dep?.args.includes('FRONTBASE_BASE_DOMAIN:frontbase.dev') === true
        && dep?.args[dep.args.indexOf('FRONTBASE_BASE_DOMAIN:frontbase.dev') - 1] === '--var');
    check('wrangler.toml still has no deployment-mode values after a cloud deploy', (() => {
        const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
        return !toml.includes('FRONTBASE_DEPLOYMENT_MODE') && !toml.includes('FRONTBASE_BASE_DOMAIN');
    })());
    check('RESEND_API_KEY travels on stdin, never argv', (() => {
        const put = secretPut(calls, 'RESEND_API_KEY');
        return put?.stdin === RESEND && !put.args.includes(RESEND);
    })());
    check('result reports the secret NAME only — the Resend key never reaches it',
        res.details?.secretsSet?.includes('RESEND_API_KEY') === true
        && !JSON.stringify(res).includes(RESEND));
}

console.log('— non-cloud deploy: argv unchanged —');
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', {
        cwd: fixture(), target: 'cloudflare',
        appName: 'plain-app',
        adminEmail: 'op@frontbase.test', adminPassword: 'pw',
        sessionSecret: 'fixed-session-secret',
        runWrangler,
    });
    check('deploy succeeded without cloud opts', res.ok === true);
    check('deploy args carry NO --var at all', !deployCall(calls)?.args.includes('--var'));
    check('no RESEND_API_KEY is pushed when not provided', !secretPut(calls, 'RESEND_API_KEY'));
}

console.log('— cloud mode validation —');
{
    const { calls, runWrangler } = recorder();
    const res = await deployCommand('.', {
        cwd: fixture(), target: 'cloudflare',
        appName: 'broken-app', cloud: true, // baseDomain missing
        runWrangler,
    });
    check('cloud without --base-domain is refused with the remediation in the message',
        res.ok === false && res.summary.includes('--base-domain'));
    check('refusal happens BEFORE any wrangler call', calls.length === 0);
}

console.log(failures === 0 ? 'deploy-cloud: PASS ✅' : `deploy-cloud: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
