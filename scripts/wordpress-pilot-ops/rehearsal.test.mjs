#!/usr/bin/env node
/**
 * Deterministic gate for scripts/wordpress-pilot-ops/rehearse-restore.mjs.
 *
 * Covers, entirely on synthetic data in temporary directories:
 *   - full roundtrip: seed objects → probe secrets → backup → verify →
 *     restore into a fresh target → check-restored (integrity, row counts,
 *     persisted session secret, `enc:` probe decrypt) → correct-key and
 *     wrong-key cipher probes;
 *   - fail-closed behavior: tampered snapshot, corrupt restored object,
 *     restore without confirmation, restore into a non-empty target,
 *     backup over an existing manifest;
 *   - artifact sanitation: no session-secret value, no probe plaintext and no
 *     `enc:` ciphertext in the written manifest.
 *
 * Run: node scripts/wordpress-pilot-ops/rehearsal.test.mjs   (exit 0 = pass)
 * Prerequisite: pnpm -r build (probe imports the built @frontbase/edge-infra).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROBE_PLAINTEXT, SYNTHETIC_OBJECTS } from './rehearse-restore.mjs';

const TOOL = join(import.meta.dirname, 'rehearse-restore.mjs');

let passed = 0;
const step = (name) => {
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
};

function runCli(args, cwd) {
    const result = spawnSync(process.execPath, [TOOL, ...args], { cwd: cwd ?? process.cwd(), encoding: 'utf8' });
    let json = null;
    try {
        json = JSON.parse(result.stdout.trim().split('\n').pop());
    } catch {
        // leave json null; assertions below surface the raw output
    }
    return { status: result.status, json, stdout: result.stdout, stderr: result.stderr };
}

function makeSyntheticLiveState(root) {
    // A minimal deployment-shaped state DB: the real boot writes more tables,
    // but the tool only relies on `settings` and generic row counts.
    const liveDir = join(root, 'live');
    mkdirSync(liveDir, { recursive: true });
    const dbPath = join(liveDir, 'app.db');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS settings (tenant_slug TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_slug, key))');
    db.exec('CREATE TABLE IF NOT EXISTS pages (id TEXT NOT NULL PRIMARY KEY, slug TEXT NOT NULL, layout TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 0)');
    const secret = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    db.prepare('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?, ?, ?, ?)').run('_system', 'boot.session_secret', secret, new Date().toISOString());
    db.prepare('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?, ?, ?, ?)').run('synthetic-tenant', 'site.public.name', 'Swarm2 E Rehearsal (synthetic)', new Date().toISOString());
    db.prepare('INSERT INTO pages (id, slug, layout, is_public) VALUES (?, ?, ?, ?)').run('synthetic-page-1', 'explore', '{}', 0);
    db.close();
    return { liveDir, dbPath, secret };
}

const root = mkdtempSync(join(tmpdir(), 'frontbase-ops-rehearsal-'));
try {
    // ── roundtrip ────────────────────────────────────────────────────────────
    const { liveDir, dbPath, secret } = makeSyntheticLiveState(root);
    const objectsDir = join(liveDir, 'objects');
    let r = runCli(['seed-objects', '--dir', objectsDir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.ok, true);
    step('seed-objects writes synthetic object set');

    r = runCli(['add-probe-secrets', '--db', dbPath]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.ok, true);
    step('add-probe-secrets writes enc: probe under persisted session secret');

    const backupDir = join(root, 'backup');
    r = runCli(['backup', '--db', dbPath, '--objects', objectsDir, '--output', backupDir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.probeEncrypted, true);
    assert.equal(r.json.sessionSecretPersisted, true);
    const stateSha256 = r.json.stateSha256;
    step('backup snapshots state and objects with manifest');

    const manifestText = readFileSync(join(backupDir, 'manifest.json'), 'utf8');
    assert.equal(manifestText.includes('enc:'), false, 'manifest must not contain ciphertext');
    assert.equal(manifestText.includes(PROBE_PLAINTEXT), false, 'manifest must not contain probe plaintext');
    assert.equal(manifestText.includes(secret), false, 'manifest must not contain the session secret');
    step('manifest sanitation excludes secret, plaintext and ciphertext');

    r = runCli(['verify', '--manifest', join(backupDir, 'manifest.json')]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    step('verify accepts the fresh backup');

    const restoreDir = join(root, 'restored');
    r = runCli(['restore', '--manifest', join(backupDir, 'manifest.json'), '--target-dir', restoreDir, '--confirm-fresh-target']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.stateSha256, stateSha256);
    step('restore copies state and objects into a fresh target');

    r = runCli(['check-restored', '--manifest', join(backupDir, 'manifest.json'), '--target-dir', restoreDir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.sessionSecretPreserved, true);
    assert.equal(r.json.probeDecrypted, true);
    step('check-restored proves integrity, row counts, secret and probe survive');

    r = runCli(['cipher-probe', '--db', join(restoreDir, 'app.db'), '--positive']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.decrypted, 'exact-match');
    step('cipher-probe decrypts restored probe to the exact synthetic plaintext under the restored secret');

    r = runCli(['cipher-probe', '--db', join(restoreDir, 'app.db'), '--wrong-key']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.json.wrongKeyRefused, true);
    step('cipher-probe refuses a wrong key fail-closed');

    // ── fail-closed behavior ────────────────────────────────────────────────
    const tamperRoot = mkdtempSync(join(tmpdir(), 'frontbase-ops-tamper-'));
    try {
        const tampered = makeSyntheticLiveState(tamperRoot);
        r = runCli(['add-probe-secrets', '--db', tampered.dbPath]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const tamperBackup = join(tamperRoot, 'backup');
        r = runCli(['backup', '--db', tampered.dbPath, '--output', tamperBackup]);
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const snapshotPath = join(tamperBackup, 'state-snapshot.db');
        const bytes = readFileSync(snapshotPath);
        bytes[bytes.length - 10] ^= 0xff;
        writeFileSync(snapshotPath, bytes);
        r = runCli(['verify', '--manifest', join(tamperBackup, 'manifest.json')]);
        assert.equal(r.status, 1);
        assert.equal(r.json.ok, false);
        assert.ok(JSON.stringify(r.json.failures).includes('hash'));
        step('verify fails closed on a tampered snapshot');
    } finally {
        rmSync(tamperRoot, { recursive: true, force: true });
    }

    // restore refusals
    r = runCli(['restore', '--manifest', join(backupDir, 'manifest.json'), '--target-dir', join(root, 'refused-no-confirm')]);
    assert.equal(r.status, 1);
    assert.equal(r.json.error, 'restore-refused-without-confirm-fresh-target');
    step('restore refuses without --confirm-fresh-target');

    const occupied = join(root, 'occupied');
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, 'existing.txt'), 'not empty');
    r = runCli(['restore', '--manifest', join(backupDir, 'manifest.json'), '--target-dir', occupied, '--confirm-fresh-target']);
    assert.equal(r.status, 1);
    assert.equal(r.json.error, 'restore-refused-target-not-empty');
    step('restore refuses a non-empty target');

    r = runCli(['backup', '--db', dbPath, '--objects', objectsDir, '--output', backupDir]);
    assert.equal(r.status, 1);
    assert.equal(r.json.error, 'backup-refused-manifest-exists');
    step('backup refuses to overwrite an existing manifest');

    // corrupt one restored object byte → check-restored must name the key
    const objectPath = join(restoreDir, SYNTHETIC_OBJECTS[1].key);
    const objectBytes = readFileSync(objectPath);
    objectBytes[0] ^= 0xff;
    writeFileSync(objectPath, objectBytes);
    r = runCli(['check-restored', '--manifest', join(backupDir, 'manifest.json'), '--target-dir', restoreDir]);
    assert.equal(r.status, 1);
    assert.ok(JSON.stringify(r.json.failures).includes(SYNTHETIC_OBJECTS[1].key));
    step('check-restored fails closed naming the corrupted object key');

    assert.equal(existsSync(join(restoreDir, 'app.db')), true, 'restored db still present after failed object check');
    step('read-only post-restore check preserves the existing restored database');
} finally {
    rmSync(root, { recursive: true, force: true });
}

console.log(`rehearsal gate passed: ${passed} checks`);
