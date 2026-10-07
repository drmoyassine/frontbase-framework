#!/usr/bin/env node
/**
 * wordpress-pilot-ops / rehearse-restore.mjs — workstream E (operations/restore rehearsal).
 *
 * Ephemeral, SYNTHETIC restore-rehearsal tooling for one self-host Frontbase
 * deployment (the WordPress pilot topology). It exercises the backup → verify →
 * destroy → restore → verify discipline against four synthetic state classes:
 *
 *   1. application control state  — a REAL server-created state DB (real
 *      migrations, synthetic administrator, generated session secret), snapshotted
 *      with SQLite `VACUUM INTO`, restored into a fresh directory;
 *   2. canonical database boundary — deliberately NOT copied: canonical content
 *      is owned outside the deployment (pilot: Studygram Supabase). The tool only
 *      proves the deployment-side secret/reference discipline;
 *   3. connected object storage   — a synthetic object directory with per-key
 *      SHA-256 manifest entries (stand-in for Garage/S3 objects);
 *   4. secrets                    — an `enc:` probe row written with the REAL
 *      @frontbase/edge-infra vault cipher (HKDF-SHA256 → AES-256-GCM) under the
 *      session secret persisted in the state DB, decrypted only from the restored
 *      copy, plus a fail-closed wrong-key refusal probe.
 *
 * Safety properties (mirroring scripts/cloud-ops.mjs discipline):
 *   - manifests record only redacted identities, sizes, SHA-256 hashes and counts;
 *   - every manifest is sanitation-scanned: no session-secret value, no probe
 *     plaintext, no `enc:` ciphertext may enter a written artifact;
 *   - restore refuses to write anywhere but an explicitly confirmed fresh,
 *     empty target directory (never over the backup, never over a live source);
 *   - corrupted or missing artifacts fail closed with a named reason.
 *
 * This tool creates schedules for nothing, contacts no network service, and
 * touches no live/production state. Prerequisite: `pnpm -r build` — the probe
 * imports the built `@frontbase/edge-infra` vault primitives so the at-rest
 * contract exercised is the real one, not a re-implementation.
 *
 * CLI:
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs seed-objects --dir <dir>
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs add-probe-secrets --db <dbPath>
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs backup --db <dbPath> --objects <dir> --output <backupDir>
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs verify --manifest <backupDir>/manifest.json
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs restore --manifest <backupDir>/manifest.json --target-dir <freshDir> --confirm-fresh-target
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs check-restored --manifest <manifest> --target-dir <restoredDir>
 *   node scripts/wordpress-pilot-ops/rehearse-restore.mjs cipher-probe --db <dbPath> [--wrong-key]
 *
 * Every command prints one JSON line ({"ok": ...}) and exits 0/1.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const EDGE_INFRA_DIST = resolve(HERE, '..', '..', 'packages', 'edge-infra', 'dist', 'index.js');

/** Fixed synthetic probe plaintext — never a real secret; used only to prove the
 *  restored ciphertext decrypts, under the key persisted in the restored DB, to
 *  exactly the original synthetic value. */
export const PROBE_PLAINTEXT = JSON.stringify({
    kind: 'ops-rehearsal-probe',
    note: 'synthetic swarm2 workstream E — not a credential',
});

/** Synthetic objects standing in for connected-storage content. */
export const SYNTHETIC_OBJECTS = [
    {
        key: 'public-images/synthetic-probe.png',
        contentType: 'image/png',
        bytes: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'base64',
        ),
    },
    {
        key: 'public-images/synthetic-note.txt',
        contentType: 'text/plain; charset=utf-8',
        bytes: Buffer.from('swarm2 workstream E synthetic object — disposable rehearsal data\n', 'utf8'),
    },
];

const SESSION_TENANT = '_system';
const SESSION_KEY = 'boot.session_secret';
const PROBE_ROW_KEY = 'ops.rehearsal.secret_probe';
const STATE_FILE = 'state-snapshot.db';
const MANIFEST_FILE = 'manifest.json';
const OBJECTS_SUBDIR = 'objects';

// ── small helpers ────────────────────────────────────────────────────────────

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(message, extra = {}) {
    console.log(JSON.stringify({ ok: false, error: message, ...extra }));
    process.exit(1);
}

function ok(payload) {
    console.log(JSON.stringify({ ok: true, ...payload }));
}

function basenameOf(p) {
    const norm = String(p).replace(/[\\/]+$/, '');
    const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
    return idx === -1 ? norm : norm.slice(idx + 1);
}

function openDb(path, { readOnly = false } = {}) {
    try {
        return new DatabaseSync(path, { readOnly });
    } catch (error) {
        if (readOnly) {
            // Older node:sqlite builds without `readOnly` — fall back, never write.
            return new DatabaseSync(path);
        }
        throw error;
    }
}

function integrityCheck(db) {
    const row = db.prepare('PRAGMA integrity_check').get();
    const value = row ? Object.values(row)[0] : 'missing';
    if (value !== 'ok') throw new Error(`integrity_check failed: ${value}`);
    return value;
}

function tableRowCounts(db) {
    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map((r) => r.name);
    return tables.map((name) => ({ name, rows: Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n) }));
}

function readSessionSecret(db) {
    const row = db
        .prepare('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?')
        .get(SESSION_TENANT, SESSION_KEY);
    return row ? String(row.value) : null;
}

function readProbeRow(db) {
    const row = db
        .prepare('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?')
        .get(SESSION_TENANT, PROBE_ROW_KEY);
    return row ? String(row.value) : null;
}

async function loadVault() {
    if (!existsSync(EDGE_INFRA_DIST)) {
        fail('missing-built-dependency', {
            missing: relative(process.cwd(), EDGE_INFRA_DIST),
            prerequisite: 'pnpm -r build (the probe imports the built @frontbase/edge-infra vault primitives)',
        });
    }
    return import(pathToFileURL(EDGE_INFRA_DIST).href);
}

// ── sanitation ───────────────────────────────────────────────────────────────

/** Assert an artifact-to-be-written carries no secret-shaped material. */
export function assertSanitized(text, forbidden) {
    for (const { label, value } of forbidden) {
        if (value && String(text).includes(String(value))) {
            throw new Error(`sanitation-failure: artifact would contain ${label}`);
        }
    }
}

// ── commands ─────────────────────────────────────────────────────────────────

/** seed-objects: write the fixed synthetic objects into a fresh objects dir. */
export async function seedObjects({ dir }) {
    if (existsSync(dir)) {
        for (const object of SYNTHETIC_OBJECTS) {
            const target = join(dir, object.key);
            if (existsSync(target)) {
                const existing = readFileSync(target);
                if (!existing.equals(object.bytes)) {
                    fail('seed-refused-existing-different-content', { key: object.key });
                }
            }
        }
    }
    for (const object of SYNTHETIC_OBJECTS) {
        const target = join(dir, object.key);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, object.bytes);
    }
    ok({ seeded: SYNTHETIC_OBJECTS.map((o) => o.key), dir: basenameOf(dir) });
}

/** add-probe-secrets: write the `enc:` probe row under the persisted session secret. */
export async function addProbeSecrets({ db: dbPath }) {
    const vault = await loadVault();
    const db = openDb(dbPath);
    try {
        integrityCheck(db);
        const secret = readSessionSecret(db);
        if (!secret || !/^[0-9a-f]{64}$/.test(secret)) {
            fail('session-secret-row-missing-or-unexpected-shape', {
                hint: 'boot the real server once (SESSION_SECRET unset) so it generates and persists the secret',
            });
        }
        const key = await vault.deriveKey(secret);
        const ciphertext = 'enc:' + (await vault.encrypt(PROBE_PLAINTEXT, key));
        db.prepare(
            'INSERT OR REPLACE INTO settings (tenant_slug, key, value, updated_at) VALUES (?, ?, ?, ?)',
        ).run(SESSION_TENANT, PROBE_ROW_KEY, ciphertext, new Date().toISOString());
        ok({ probe: 'written', key: PROBE_ROW_KEY, db: basenameOf(dbPath) });
    } finally {
        db.close();
    }
}

/** backup: integrity-check the live DB, snapshot it with VACUUM INTO, copy
 *  objects, write a sanitized manifest. */
export async function backupState({ db: dbPath, objects, output }) {
    if (existsSync(join(output, MANIFEST_FILE))) fail('backup-refused-manifest-exists', { output: basenameOf(output) });
    mkdirSync(output, { recursive: true });
    const vault = await loadVault();

    const live = openDb(dbPath);
    let secret;
    let probeCiphertext;
    let tables;
    try {
        integrityCheck(live);
        tables = tableRowCounts(live);
        secret = readSessionSecret(live);
        probeCiphertext = readProbeRow(live);
        live.exec(`VACUUM INTO '${join(output, STATE_FILE).replace(/'/g, "''")}'`);
    } finally {
        live.close();
    }

    const snapshot = openDb(join(output, STATE_FILE), { readOnly: true });
    let snapshotTables;
    let snapshotIntegrity;
    try {
        snapshotIntegrity = integrityCheck(snapshot);
        snapshotTables = tableRowCounts(snapshot);
    } finally {
        snapshot.close();
    }
    if (JSON.stringify(snapshotTables) !== JSON.stringify(tables)) {
        fail('snapshot-table-mismatch', {});
    }

    const objectEntries = [];
    if (objects) {
        for (const object of SYNTHETIC_OBJECTS) {
            const source = join(objects, object.key);
            if (!existsSync(source)) fail('object-missing-at-backup', { key: object.key });
            const bytes = readFileSync(source);
            const target = join(output, OBJECTS_SUBDIR, object.key);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, bytes);
            objectEntries.push({ key: object.key, bytes: bytes.length, sha256: sha256(bytes), contentType: object.contentType });
        }
    }

    const snapshotBytes = readFileSync(join(output, STATE_FILE));
    const manifest = {
        manifestVersion: 1,
        tool: 'wordpress-pilot-ops/rehearse-restore.mjs',
        createdAt: new Date().toISOString(),
        synthetic: true,
        source: { kind: 'sqlite-file', pathRedacted: true, basename: basenameOf(dbPath) },
        generator: { node: process.version, sqlite: new DatabaseSync(':memory:').prepare('SELECT sqlite_version() AS v').get().v },
        state: { file: STATE_FILE, bytes: snapshotBytes.length, sha256: sha256(snapshotBytes), integrity: snapshotIntegrity },
        tables: snapshotTables,
        sessionSecret: { present: Boolean(secret), shape: secret && /^[0-9a-f]{64}$/.test(secret) ? 'hex-64' : 'unexpected' },
        probe: { present: Boolean(probeCiphertext), encrypted: probeCiphertext ? probeCiphertext.startsWith('enc:') : false },
        objects: objectEntries,
    };

    const forbidden = [
        { label: 'the persisted session secret value', value: secret ?? '' },
        { label: 'probe plaintext', value: PROBE_PLAINTEXT },
        { label: 'enc: ciphertext', value: probeCiphertext ?? '' },
    ];
    const manifestText = JSON.stringify(manifest, null, 2);
    try {
        assertSanitized(manifestText, forbidden);
    } catch (error) {
        rmSync(join(output, MANIFEST_FILE), { force: true });
        fail(error.message, {});
    }
    writeFileSync(join(output, MANIFEST_FILE), manifestText);
    ok({
        backup: basenameOf(output),
        stateSha256: manifest.state.sha256,
        stateBytes: manifest.state.bytes,
        tables: manifest.tables.length,
        objects: objectEntries.length,
        sessionSecretPersisted: manifest.sessionSecret.present,
        probeEncrypted: manifest.probe.encrypted,
    });
}

/** verify: re-hash the snapshot + objects and re-check integrity against the manifest. */
export async function verifyBackup({ manifest: manifestPath }) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const backupDir = dirname(manifestPath);
    const failures = [];
    const snapshotPath = join(backupDir, manifest.state.file);
    if (!existsSync(snapshotPath)) failures.push(`missing ${manifest.state.file}`);
    if (failures.length === 0) {
        const bytes = readFileSync(snapshotPath);
        if (bytes.length !== manifest.state.bytes) failures.push('state byte-size mismatch');
        if (sha256(bytes) !== manifest.state.sha256) failures.push('state sha256 mismatch');
        try {
            const db = openDb(snapshotPath, { readOnly: true });
            try {
                const integrity = integrityCheck(db);
                if (integrity !== manifest.state.integrity) failures.push('integrity result mismatch');
                if (JSON.stringify(tableRowCounts(db)) !== JSON.stringify(manifest.tables)) failures.push('table row counts mismatch');
            } finally {
                db.close();
            }
        } catch (error) {
            failures.push(`snapshot open failed: ${error.message}`);
        }
    }
    for (const object of manifest.objects ?? []) {
        const path = join(backupDir, OBJECTS_SUBDIR, object.key);
        if (!existsSync(path)) {
            failures.push(`missing object ${object.key}`);
            continue;
        }
        const bytes = readFileSync(path);
        if (sha256(bytes) !== object.sha256) failures.push(`object sha256 mismatch ${object.key}`);
    }
    if (failures.length > 0) fail('verify-failed', { failures });
    ok({ verified: basenameOf(manifestPath), tables: manifest.tables.length, objects: (manifest.objects ?? []).length });
}

/** restore: copy the snapshot + objects into a confirmed fresh target directory. */
export async function restoreBackup({ manifest: manifestPath, targetDir, confirmFreshTarget }) {
    if (!confirmFreshTarget) fail('restore-refused-without-confirm-fresh-target', { hint: 'pass --confirm-fresh-target' });
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
        fail('restore-refused-target-not-empty', { target: basenameOf(targetDir) });
    }
    const backupDir = dirname(manifestPath);
    const norm = (p) => resolve(p).replace(/[\\/]+$/, '') + sep;
    if (norm(targetDir).startsWith(norm(backupDir)) || norm(backupDir).startsWith(norm(targetDir))) {
        fail('restore-refused-nested-target', {});
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    mkdirSync(targetDir, { recursive: true });
    const dbTarget = join(targetDir, 'app.db');
    copyFileSync(join(backupDir, manifest.state.file), dbTarget);
    const restoredBytes = readFileSync(dbTarget);
    if (sha256(restoredBytes) !== manifest.state.sha256) fail('restored-state-hash-mismatch', {});
    for (const object of manifest.objects ?? []) {
        const from = join(backupDir, OBJECTS_SUBDIR, object.key);
        if (!existsSync(from)) fail('backup-object-missing', { key: object.key });
        if (String(object.key).includes('..') || resolve(object.key) === object.key) fail('unsafe-object-key', { key: object.key });
        const to = join(targetDir, object.key);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        if (sha256(readFileSync(to)) !== object.sha256) fail('restored-object-hash-mismatch', { key: object.key });
    }
    ok({ restoredTo: basenameOf(targetDir), stateSha256: manifest.state.sha256, objects: (manifest.objects ?? []).length });
}

/** check-restored: full semantic verification of a restored deployment state. */
export async function checkRestored({ manifest: manifestPath, targetDir }) {
    const vault = await loadVault();
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const failures = [];
    const dbPath = join(targetDir, 'app.db');
    if (!existsSync(dbPath)) fail('restored-db-missing', { target: basenameOf(targetDir) });

    let secret = null;
    try {
        const db = openDb(dbPath, { readOnly: true });
        try {
            if (integrityCheck(db) !== 'ok') failures.push('restored integrity_check not ok');
            if (JSON.stringify(tableRowCounts(db)) !== JSON.stringify(manifest.tables)) failures.push('restored table row counts differ from manifest');
            secret = readSessionSecret(db);
            if (!secret) failures.push('persisted session secret row missing after restore');
            else if (!/^[0-9a-f]{64}$/.test(secret)) failures.push('persisted session secret unexpected shape');
            if (manifest.probe?.present) {
                const probeCiphertext = readProbeRow(db);
                if (!probeCiphertext) failures.push('probe row missing after restore');
                else if (!probeCiphertext.startsWith('enc:')) failures.push('probe row not encrypted after restore');
                else {
                    try {
                        const key = await vault.deriveKey(secret ?? '');
                        const plaintext = await vault.decrypt(probeCiphertext.slice('enc:'.length), key);
                        if (plaintext !== PROBE_PLAINTEXT) failures.push('probe decrypted to unexpected plaintext');
                    } catch {
                        failures.push('probe decrypt failed under the restored session secret');
                    }
                }
            }
        } finally {
            db.close();
        }
    } catch (error) {
        failures.push(`restored db open failed: ${error.message}`);
    }

    for (const object of manifest.objects ?? []) {
        const path = join(targetDir, object.key);
        if (!existsSync(path)) {
            failures.push(`restored object missing ${object.key}`);
            continue;
        }
        const bytes = readFileSync(path);
        if (sha256(bytes) !== object.sha256) failures.push(`restored object hash mismatch ${object.key}`);
    }

    if (failures.length > 0) fail('check-restored-failed', { failures });
    ok({
        target: basenameOf(targetDir),
        integrity: 'ok',
        tables: manifest.tables.length,
        rows: manifest.tables.reduce((sum, t) => sum + t.rows, 0),
        sessionSecretPreserved: Boolean(secret),
        probeDecrypted: Boolean(manifest.probe?.present),
        objectsVerified: (manifest.objects ?? []).length,
    });
}

/** cipher-probe: prove the probe row fails closed under a wrong key (or decrypts
 *  under the correct one with --positive). */
export async function cipherProbe({ db: dbPath, wrongKey = false, positive = false }) {
    const vault = await loadVault();
    const db = openDb(dbPath, { readOnly: true });
    let ciphertext;
    let secret;
    try {
        secret = readSessionSecret(db);
        ciphertext = readProbeRow(db);
    } finally {
        db.close();
    }
    if (!secret || !ciphertext) fail('probe-or-secret-missing', {});
    try {
        const key = await vault.deriveKey(wrongKey ? `wrong-key-${randomUUID()}` : secret);
        const plaintext = await vault.decrypt(ciphertext.slice('enc:'.length), key);
        if (wrongKey) fail('wrong-key-decrypt-unexpectedly-succeeded', {});
        if (positive && plaintext !== PROBE_PLAINTEXT) fail('positive-decrypt-plaintext-mismatch', {});
        ok({ wrongKeyRefused: false, decrypted: positive ? 'exact-match' : 'succeeded' });
    } catch (error) {
        if (wrongKey) {
            ok({ wrongKeyRefused: true, reason: 'decrypt failed closed (opaque error, no plaintext)' });
            return;
        }
        fail('correct-key-decrypt-failed', { message: error.message });
    }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token.startsWith('--')) {
            const key = token.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                args[key] = true;
            } else {
                args[key] = next;
                i++;
            }
        }
    }
    return args;
}

export async function main(argv) {
    const [command] = argv.slice(2);
    const args = parseArgs(argv);
    switch (command) {
        case 'seed-objects':
            return seedObjects({ dir: args.dir });
        case 'add-probe-secrets':
            return addProbeSecrets({ db: args.db });
        case 'backup':
            return backupState({ db: args.db, objects: args.objects, output: args.output });
        case 'verify':
            return verifyBackup({ manifest: args.manifest });
        case 'restore':
            return restoreBackup({
                manifest: args.manifest,
                targetDir: args['target-dir'],
                confirmFreshTarget: args['confirm-fresh-target'] === true,
            });
        case 'check-restored':
            return checkRestored({ manifest: args.manifest, targetDir: args['target-dir'] });
        case 'cipher-probe':
            return cipherProbe({ db: args.db, wrongKey: args['wrong-key'] === true, positive: args.positive === true });
        default:
            fail('unknown-command', { command: String(command), see: 'header comment for usage' });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await main(process.argv);
}
