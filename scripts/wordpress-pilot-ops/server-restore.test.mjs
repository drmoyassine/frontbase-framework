/** Same-version synthetic real-server drill. No external storage or production data. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { deriveKey, encrypt, decrypt } from '../../packages/edge-infra/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../../examples/cf-full/dist/node.mjs');
const tool = join(here, 'rehearse-restore.mjs');
const tempParent = realpathSync(tmpdir());
const root = mkdtempSync(join(tempParent, 'frontbase-server-restore-'));
const port = Number(process.env.RESTORE_TEST_PORT ?? 4395);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const base = `http://127.0.0.1:${port}`;
const email = `restore-${randomBytes(6).toString('hex')}@example.test`;
const password = randomBytes(24).toString('hex');
let child = null;
let assertions = 0;
function passed(name) { assertions++; console.log(`ok - ${name}`); }
async function stop() {
    if (!child) return;
    const running = child; child = null;
    if (running.exitCode !== null) return;
    const exited = once(running, 'exit'); running.kill(); await exited;
}
async function boot(db, secret, seed = false) {
    // Permit only runtime necessities, never inherit live DB/auth/provider variables.
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    Object.assign(env, { PORT: String(port), HOST: '127.0.0.1', APP_DB_URL: pathToFileURL(db).href });
    if (secret) env.SESSION_SECRET = secret;
    if (seed) { env.ADMIN_EMAIL = email; env.ADMIN_PASSWORD = password; }
    child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    // Drain without logging generated credentials or private state.
    child.stdout.resume(); child.stderr.resume();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        assert.equal(child.exitCode, null, 'synthetic server exited before health');
        try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('synthetic server health timeout');
}
async function login(pass = password) {
    return fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: pass }), signal: AbortSignal.timeout(3000) });
}
function command(...args) {
    const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.equal(result.status, 0, `synthetic operation ${args[0]} failed`);
    const response = JSON.parse(result.stdout.trim()); assert.equal(response.ok, true); return response;
}
function withDb(path, fn) { const db = new DatabaseSync(path); try { return fn(db); } finally { db.close(); } }

try {
    // Never send credentials to an unrelated process already using the assigned port.
    let occupied = false;
    try { await fetch(base + '/health', { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
    assert.equal(occupied, false, 'assigned restore-test port already occupied');
    for (const mode of ['persisted', 'environment']) {
        const live = join(root, mode); mkdirSync(live);
        const dbPath = join(live, 'app.db');
        const secret = mode === 'environment' ? randomBytes(32).toString('hex') : undefined;
        await boot(dbPath, secret, true);
        assert.equal((await login()).status, 200);
        assert.equal((await login('deliberately-wrong')).status, 401);
        assert.equal((await fetch(base + '/api/console/health')).status, 200);
        await stop(); passed(`${mode}: real migrations, health and authenticated baseline`);

        if (mode === 'persisted') command('add-probe-secrets', '--db', dbPath);
        else {
            const encrypted = 'enc:' + await encrypt('synthetic environment-custody probe', await deriveKey(secret));
            withDb(dbPath, db => {
                assert.equal(db.prepare("SELECT value FROM settings WHERE tenant_slug='_system' AND key='boot.session_secret'").get(), undefined);
                db.prepare('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)')
                    .run('_system', 'ops.environment_probe', encrypted, new Date().toISOString());
            });
        }
        command('seed-objects', '--dir', join(live, 'objects'));
        const backup = join(root, `${mode}-backup`);
        command('backup', '--db', dbPath, '--objects', join(live, 'objects'), '--output', backup);
        const manifestPath = join(backup, 'manifest.json');
        const manifestText = readFileSync(manifestPath, 'utf8');
        assert.ok(!manifestText.includes(password));
        if (secret) assert.ok(!manifestText.includes(secret));
        command('verify', '--manifest', manifestPath);
        const restored = join(root, `${mode}-restored`);
        command('restore', '--manifest', manifestPath, '--target-dir', restored, '--confirm-fresh-target');
        command('check-restored', '--manifest', manifestPath, '--target-dir', restored);
        const forgedManifest = JSON.parse(manifestText);
        forgedManifest.sessionSecret = mode === 'persisted' ? { present: false, shape: null } : { present: true, shape: 'hex-64' };
        const forgedPath = join(backup, 'mismatched-key-custody.json');
        writeFileSync(forgedPath, JSON.stringify(forgedManifest));
        const mismatch = spawnSync(process.execPath, [tool, 'check-restored', '--manifest', forgedPath, '--target-dir', restored], { encoding: 'utf8', timeout: 20000, windowsHide: true });
        assert.equal(mismatch.status, 1, 'incorrect persisted-key metadata must refuse');
        assert.match(mismatch.stdout, /presence differs from manifest/);
        passed(`${mode}: verified snapshot and objects restored into absent target`);
        if (mode === 'persisted') {
            command('cipher-probe', '--db', join(restored, 'app.db'), '--positive');
            command('cipher-probe', '--db', join(restored, 'app.db'), '--wrong-key');
        } else {
            const ciphertext = withDb(join(restored, 'app.db'), db => db.prepare("SELECT value FROM settings WHERE key='ops.environment_probe'").get().value);
            assert.equal(await decrypt(ciphertext.slice(4), await deriveKey(secret)), 'synthetic environment-custody probe');
            const wrongKey = await deriveKey('wrong-key');
            await assert.rejects(() => decrypt(ciphertext.slice(4), wrongKey));
        }
        passed(`${mode}: exact decryption and wrong-key refusal`);
        await boot(join(restored, 'app.db'), secret);
        assert.equal((await login()).status, 200);
        assert.equal((await login('deliberately-wrong')).status, 401);
        assert.equal((await fetch(base + '/api/console/health')).status, 200);
        await stop(); passed(`${mode}: restored server login without administrator reseeding`);
    }
    console.log(`${assertions} real-server restore groups passed (synthetic, same-version SQLite, no deployment)`);
} finally {
    await stop();
    // Delete only the newly generated, contained synthetic root; never a supplied path.
    const checked = realpathSync(root);
    assert.equal(dirname(checked), tempParent);
    assert.ok(relative(tempParent, checked).startsWith('frontbase-server-restore-'));
    rmSync(checked, { recursive: true, force: true });
}
