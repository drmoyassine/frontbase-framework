/** Bounded, offline rehearsal preflight. Not a general production backup format. */
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HASH = /^[a-f0-9]{64}$/;
const MAX_FILE = 64 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = () => { throw new Error('invalid-backup'); };
const record = (x, fields) => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join('|') !== [...fields].sort().join('|')) refuse();
};
const text = x => { if (typeof x !== 'string' || !x.length || x.length > 256 || /[\x00-\x1f]/.test(x)) refuse(); };
const size = x => { if (!Number.isSafeInteger(x) || x < 0 || x > MAX_FILE) refuse(); };

export function portableKey(key) {
    text(key);
    if (!/^[A-Za-z0-9_./-]+$/.test(key)) refuse();
    for (const part of key.split('/')) {
        if (!part || part === '.' || part === '..' || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) refuse();
    }
    return key;
}

/** Reject symlinks/junctions anywhere in an existing path, including parents. */
export function plainPath(path, kind) {
    const full = resolve(path);
    let cursor = full;
    while (true) {
        const stat = lstatSync(cursor);
        if (stat.isSymbolicLink() || (cursor !== full && !stat.isDirectory())) refuse();
        if (cursor === full && (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) refuse();
        const parent = dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
    }
    // Also refuse aliases normalized by the filesystem (junction/reparse paths).
    const actual = realpathSync.native(full);
    const norm = p => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
    if (norm(actual) !== norm(full)) refuse();
    return full;
}

export function checkedBytes(path, expected) {
    plainPath(path, 'file');
    const before = lstatSync(path);
    if (before.nlink !== 1 || before.size > (expected ? MAX_FILE : 64 * 1024)) refuse();
    const fd = openSync(path, 'r');
    try {
        const opened = fstatSync(fd);
        if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || !opened.isFile()) refuse();
        const bytes = readFileSync(fd);
        if (bytes.length > (expected ? MAX_FILE : 64 * 1024)) refuse();
        if (expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256)) refuse();
        return bytes;
    } finally { closeSync(fd); }
}

export function loadManifest(path) {
    const manifest = JSON.parse(checkedBytes(path).toString('utf8'));
    record(manifest, ['manifestVersion','tool','createdAt','synthetic','source','generator','state','tables','sessionSecret','probe','objects']);
    if (manifest.manifestVersion !== 1 || manifest.synthetic !== true || manifest.tool !== 'wordpress-pilot-ops/rehearse-restore.mjs') refuse();
    if (typeof manifest.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(manifest.createdAt) || !Number.isFinite(Date.parse(manifest.createdAt))) refuse();
    record(manifest.source, ['kind','pathRedacted','basename']);
    if (manifest.source.kind !== 'sqlite-file' || manifest.source.pathRedacted !== true) refuse();
    text(manifest.source.basename);
    record(manifest.generator,['node','sqlite']); text(manifest.generator.node); text(manifest.generator.sqlite);
    record(manifest.state,['file','bytes','sha256','integrity']);
    if (manifest.state.file !== 'state-snapshot.db' || manifest.state.integrity !== 'ok' || !HASH.test(manifest.state.sha256)) refuse();
    size(manifest.state.bytes);
    if (!Array.isArray(manifest.tables) || manifest.tables.length > 512) refuse();
    const tables = new Set();
    for (const table of manifest.tables) {
        record(table,['name','rows']); text(table.name);
        if (!Number.isSafeInteger(table.rows) || table.rows < 0 || tables.has(table.name)) refuse();
        tables.add(table.name);
    }
    record(manifest.sessionSecret,['present','shape']);
    if (typeof manifest.sessionSecret.present !== 'boolean' || !['hex-64','unexpected',null].includes(manifest.sessionSecret.shape) || (manifest.sessionSecret.present && manifest.sessionSecret.shape === null)) refuse();
    record(manifest.probe,['present','encrypted']);
    if (typeof manifest.probe.present !== 'boolean' || typeof manifest.probe.encrypted !== 'boolean') refuse();
    if (!Array.isArray(manifest.objects) || manifest.objects.length > 2048) refuse();
    const keys = new Set(['app.db','app.db-wal','app.db-shm','app.db-journal']);
    let total = manifest.state.bytes;
    for (const object of manifest.objects) {
        record(object,['key','bytes','sha256','contentType']);
        const key = portableKey(object.key).toLowerCase();
        size(object.bytes); text(object.contentType);
        if (!HASH.test(object.sha256) || keys.has(key)) refuse();
        keys.add(key); total += object.bytes;
    }
    for (const key of keys) {
        const parts = key.split('/'); parts.pop();
        while (parts.length) { if (keys.has(parts.join('/'))) refuse(); parts.pop(); }
    }
    if (total > MAX_TOTAL) refuse();
    return manifest;
}

export function databaseCheck(path, manifest) {
    plainPath(path,'file');
    // A snapshot must be standalone; unmanifested journals/WAL may change reads.
    for (const suffix of ['-wal','-shm','-journal']) {
        try { lstatSync(path + suffix); refuse(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const db = new DatabaseSync(path,{readOnly:true});
    try {
        if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok') refuse();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
            .map(({name}) => ({name, rows:Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"','""')}"`).get().n)}));
        if (JSON.stringify(tables) !== JSON.stringify(manifest.tables)) refuse();
    } finally { db.close(); }
}

export function preflightBackup(path) {
    const manifest = loadManifest(path);
    const backupDir = plainPath(dirname(resolve(path)), 'directory');
    checkedBytes(join(backupDir,manifest.state.file),manifest.state);
    databaseCheck(join(backupDir,manifest.state.file),manifest);
    for (const object of manifest.objects) checkedBytes(join(backupDir,'objects',object.key),object);
    return {manifest,backupDir};
}

export function disjoint(a,b) {
    const nested = (parent, child) => {
        const rel = relative(parent,child);
        return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'));
    };
    if (nested(a,b) || nested(b,a)) refuse();
}
