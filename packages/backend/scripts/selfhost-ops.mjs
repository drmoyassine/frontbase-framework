#!/usr/bin/env node
/** Self-host state-DB operations (task 11) — the SQLite-family counterpart of
 *  scripts/cloud-ops.mjs (which owns the Cloud Supabase Postgres path and stays the only tool
 *  for it). Commands:
 *    export       --url <stateDbUrl> --out <payload.json>
 *    verify-backup --backup <payload.json>          (offline: SHA-256 + structure, no DB)
 *    restore      --url <freshStateDbUrl> --backup <payload.json> --confirm-empty-target
 *    integrity    --url <stateDbUrl>               (run the integrity walk against any DB)
 *  URLs: file:, libsql://, https://, wss:// (Turso) and :memory: only — the Postgres/Cloud path
 *  is cloud-ops.mjs, D1 restore is a platform export/import followed by `integrity`.
 *  SESSION_SECRET provenance is recorded automatically (presence only, never the value):
 *  an env-set export must restore under the SAME env value; a boot-generated export (secret
 *  persisted inside the state DB) must restore with NO overriding env var. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import process from 'node:process';
import { sqliteRunner } from '@frontbase/edge-infra';
import { exportStateBackup, restoreStateBackup, verifyStateIntegrity } from '../dist/compat/backup-restore.js';

const redact = (url) => String(url).replace(/\/\/[^@/]*@/, '//***@');
const ALLOWED = /^(file:|libsql:|https:|wss:|:memory:)/;
const fail = (message) => { console.error(`selfhost-ops: ${message}`); process.exit(2); };

function parseCli(argv) {
    const args = { _: [] };
    for (let index = 2; index < argv.length; index++) {
        const token = argv[index];
        if (token.startsWith('--')) {
            const next = argv[index + 1];
            // Boolean flags (e.g. --confirm-empty-target) may appear last or before another
            // flag; only consume a value when the next token is a real operand.
            if (next === undefined || next.startsWith('--')) args[token.slice(2)] = true;
            else { args[token.slice(2)] = next; index++; }
        } else args._.push(token);
    }
    return args;
}
function openStateDb(url) {
    if (!ALLOWED.test(url)) fail(`unsupported state DB url ${redact(url)} — file:, libsql://, https://, wss:// or :memory: only (Cloud/Postgres uses cloud-ops.mjs; D1 restore uses a platform export/import + integrity)`);
    return sqliteRunner(url, process.env.FRONTBASE_STATE_AUTH_TOKEN);
}
const gitCommit = () => { try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
const sidecarOf = (payloadPath) => `${payloadPath}.manifest.json`;

async function verifyBackupFile(payloadPath) {
    let payload, sidecar;
    try { payload = JSON.parse(await readFile(payloadPath, 'utf8')); } catch { fail(`backup payload unreadable: ${payloadPath}`); }
    try { sidecar = JSON.parse(await readFile(sidecarOf(payloadPath), 'utf8')); } catch { fail(`manifest sidecar missing: ${sidecarOf(payloadPath)}`); }
    const bytes = Buffer.from(JSON.stringify(payload));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (payload.format !== 'frontbase.state-backup' || payload.version !== 1) fail('unrecognized backup format');
    if (sidecar.payloadSha256 !== sha256) fail(`payload SHA-256 mismatch (sidecar ${sidecar.payloadSha256}, actual ${sha256}) — the backup is corrupt or was modified`);
    const countDrift = Object.keys(sidecar.tables ?? {}).filter((table) => (payload.tables?.[table]?.length ?? -1) !== sidecar.tables[table]);
    if (countDrift.length) fail(`table count drift in payload: ${countDrift.join(',')}`);
    return { payload, sidecar, sha256, bytes: bytes.length };
}

const args = parseCli(process.argv);
const command = args._[0];
if (command === 'export') {
    if (!args.url || !args.out) fail('export requires --url <stateDbUrl> --out <payload.json>');
    const db = openStateDb(args.url);
    const backup = await exportStateBackup(db, new Date().toISOString(), Boolean(process.env.SESSION_SECRET));
    const payloadText = JSON.stringify(backup);
    await writeFile(args.out, payloadText);
    const sha256 = createHash('sha256').update(Buffer.from(payloadText)).digest('hex');
    const sidecar = {
        format: 'frontbase.state-backup.manifest', version: 1, createdAt: backup.createdAt,
        payloadBytes: Buffer.byteLength(payloadText), payloadSha256: sha256,
        migrations: backup.migrations, tables: backup.counts, encCounts: backup.encCounts,
        secretProvenance: backup.secretProvenance, consistent: backup.consistent, gitCommit: gitCommit(),
        sourceUrl: redact(args.url),
    };
    await writeFile(sidecarOf(args.out), JSON.stringify(sidecar, null, 2));
    console.log(`selfhost-ops: exported ${backup.counts && Object.keys(backup.counts).length} tables (${sidecar.payloadBytes} bytes, sha256 ${sha256.slice(0, 16)}…) to ${args.out}`);
    console.log(`selfhost-ops: SESSION_SECRET at export: ${backup.secretProvenance.envSecretPresent ? 'ENV-SET (restore under the SAME value)' : 'not set (boot-generated secret lives in the backup; restore with NO overriding env var)'}`);
    if (!backup.consistent) console.log('selfhost-ops: WARNING export ran without a read transaction (possibly torn) — run `integrity` and treat verify results as authoritative');
} else if (command === 'verify-backup') {
    if (!args.backup) fail('verify-backup requires --backup <payload.json>');
    const { sidecar, sha256, bytes } = await verifyBackupFile(args.backup);
    console.log(`selfhost-ops: backup verified offline (${bytes} bytes, sha256 ${sha256.slice(0, 16)}…, migrations to ${sidecar.migrations?.at(-1)}, exported ${sidecar.createdAt})`);
} else if (command === 'restore') {
    if (!args.url || !args.backup) fail('restore requires --url <freshStateDbUrl> --backup <payload.json>');
    if (!args['confirm-empty-target']) fail('restore refuses to run without --confirm-empty-target (isolated-target rule: restore into a FRESH database only, then repoint; never over a live state DB)');
    const verified = await verifyBackupFile(args.backup);
    const db = openStateDb(args.url);
    const { report } = await restoreStateBackup(db, verified.payload, new Date().toISOString(), { confirmEmptyTarget: true });
    const evidence = { at: new Date().toISOString(), target: redact(args.url), backup: args.backup, sha256: verified.sha256, report };
    await writeFile(`${args.backup}.restore.json`, JSON.stringify(evidence, null, 2));
    for (const check of report.checks) console.log(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
    if (!report.ok) { console.error('selfhost-ops: restore completed but the INTEGRITY WALK FAILED — do not repoint traffic; see the checks above'); process.exit(1); }
    console.log(`selfhost-ops: restored and verified (evidence ${args.backup}.restore.json) — repoint traffic only after reviewing every check`);
} else if (command === 'integrity') {
    if (!args.url) fail('integrity requires --url <stateDbUrl>');
    const report = await verifyStateIntegrity(openStateDb(args.url));
    for (const check of report.checks) console.log(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
    if (!report.ok) { console.error('selfhost-ops: integrity walk FAILED'); process.exit(1); }
    console.log('selfhost-ops: integrity walk passed');
} else {
    fail('usage: selfhost-ops.mjs <export|verify-backup|restore|integrity> --url … --out/--backup … [--confirm-empty-target]');
}
