import type { DbRunner } from '@frontbase/edge-infra';
import { appliedVersions, migrateUp } from '../db/migrations.js';
import { SitePublicationStore } from './site-publication-store.js';
import { SitePublicationManifestStore } from './site-publication-manifest.js';
import { SitePublicationReviewStore } from './site-publication-review-store.js';
import { MenusSnapshotStore } from './menus-snapshot.js';
import { readHomepageRelease, publishedHomepageLocales } from './translation-homepage.js';

/** Operator-level state backup (task 11). Scope: the application state DB on the SQLite-family
 *  certified paths (file:, libsql/Turso, D1) — the publication plane is the `settings` table
 *  plus `compat_pages`/`compat_page_versions` and the identity tables, so a consistent restore
 *  is a point-in-time copy of every migrated table with EXACT raw `settings.value` bytes (most
 *  stores CAS on the raw serialized value). NOT covered by design: the tenant-owned external
 *  Supabase (translations schema, editorial bodies, fb_live_* views), Supabase auth/storage
 *  objects, and provider-managed recovery — see docs/backup-restore.md. */

export interface StateBackup {
    format: 'frontbase.state-backup';
    version: 1;
    createdAt: string;
    /** Applied migration versions at export time. Restore refuses backups newer than the
     *  running code and runs migrateUp to absorb older ones. */
    migrations: number[];
    /** False when the runner could not hold a read transaction (D1-REST has none): every
     *  consumer must treat such a backup as possibly torn — the integrity walk is what
     *  proves it, never this flag. */
    consistent: boolean;
    tables: Record<string, Record<string, unknown>[]>;
    counts: Record<string, number>;
    /** Ciphertext accounting per known secret column; recomputed live after restore and
     *  compared, so silent row loss is detectable even though ciphertext is opaque. */
    encCounts: Record<string, number>;
    secretProvenance: {
        /** Whether SESSION_SECRET was visible in the exporting process. The VALUE is never
         *  recorded; restore-blocking rule: env-set exports must restore under the SAME env
         *  value, boot-generated exports must restore with NO overriding env var. */
        envSecretPresent: boolean;
        bootSecretRowPresent: boolean;
        encTotal: number;
    };
}

/** Secret columns encrypted with the session-key-derived cipher (`enc:` prefix). Kept in step
 *  with db/secret-cipher.ts call sites; settings is counted only for the app-user-session keys
 *  because arbitrary settings values legitimately contain user data. */
const ENC_COLUMNS: { table: string; column: string; where?: string }[] = [
    { table: 'variables', column: 'value', where: 'is_secret=1' },
    { table: 'datasources', column: 'config' },
    { table: 'edge_resources', column: 'config' },
    { table: 'storage_buckets', column: 'config' },
    { table: 'edge_api_key_secrets', column: 'ciphertext' },
    { table: 'settings', column: 'value', where: "substr(key,1,17)='app_user_session:'" },
];

type Row = Record<string, unknown>;
const plain = (value: unknown): value is null | string | number | boolean =>
    value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** Read-consistent full-table export. Fails closed on values JSON cannot carry round-trip
 *  (BLOB/bigint-out-of-range) instead of silently corrupting a backup. */
export async function exportStateBackup(db: DbRunner, now: string, envSecretPresent = false): Promise<StateBackup> {
    const migrations = await appliedVersions(db);
    if (!migrations.length) throw Error('backup_requires_migrated_state');
    const names = (await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
        .map((row) => String(row.name)).filter((name) => name !== '_migrations');
    let consistent = true;
    try { await db.exec('BEGIN'); } catch { consistent = false; }
    try {
        const tables: Record<string, Row[]> = {};
        for (const name of names) {
            const rows = await db.query(`SELECT * FROM "${name}" ORDER BY rowid`);
            tables[name] = rows.map((row) => Object.fromEntries(Object.entries(row).map(([column, value]) => {
                if (typeof value === 'bigint') { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('backup_unsupported_value_type'); value = Number(value); }
                if (!plain(value)) throw Error('backup_unsupported_value_type');
                return [column, value];
            })));
        }
        const encCounts: Record<string, number> = {};
        let encTotal = 0;
        for (const { table, column, where } of ENC_COLUMNS) {
            if (!tables[table]) continue;
            const sql = `SELECT COUNT(*) AS n FROM "${table}" WHERE substr("${column}",1,4)='enc:'${where ? ` AND ${where}` : ''}`;
            const n = Number((await db.query(sql))[0]?.n ?? 0);
            encCounts[`${table}.${column}${where ? `(${where})` : ''}`] = n;
            encTotal += n;
        }
        const bootSecretRowPresent = Number((await db.query("SELECT COUNT(*) AS n FROM settings WHERE tenant_slug='_system' AND key='boot.session_secret'"))[0]?.n ?? 0) > 0;
        if (consistent) await db.exec('COMMIT');
        return { format: 'frontbase.state-backup', version: 1, createdAt: now, migrations, consistent, tables, counts: Object.fromEntries(names.map((name) => [name, tables[name]!.length])), encCounts, secretProvenance: { envSecretPresent, bootSecretRowPresent, encTotal } };
    } catch (error) {
        if (consistent) try { await db.exec('ROLLBACK'); } catch { /* the read already failed; nothing to preserve */ }
        throw error;
    }
}

/** Restore into a FRESH database only — the isolated-target boundary mirrors cloud-ops: never
 *  over a live state DB. Transactional targets only, so a failed restore rolls back instead of
 *  stranding a half-loaded state plane (D1-REST cannot transact; its documented path is a
 *  platform export/import followed by `verifyStateIntegrity`). */
export async function restoreStateBackup(db: DbRunner, backup: StateBackup, now: string, options: { confirmEmptyTarget: boolean }): Promise<{ report: IntegrityReport }> {
    if (!backup || backup.format !== 'frontbase.state-backup' || backup.version !== 1) throw Error('restore_backup_unrecognized');
    if (!options?.confirmEmptyTarget) throw Error('restore_target_not_confirmed');
    const existing = Number((await db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))[0]?.n ?? 0);
    if (existing > 0) throw Error('restore_target_not_empty');
    await migrateUp(db, () => now);
    const head = await appliedVersions(db);
    const headSet = new Set(head);
    // One refusal covers both skew directions: a backup from a NEWER codebase carries versions
    // the running head never had, and so does a divergent branch — both are refused here, while
    // OLDER backups are absorbed by migrateUp above (schema rollback is restore-from-backup,
    // never a down-migration walk).
    if (!backup.migrations.length || backup.migrations.some((version) => !headSet.has(version))) throw Error('restore_backup_foreign_schema');
    let transactional = true;
    try { await db.exec('BEGIN'); } catch { transactional = false; }
    if (!transactional) throw Error('restore_target_not_transactional');
    try {
        for (const name of Object.keys(backup.tables).sort()) {
            const rows = backup.tables[name]!;
            if (!rows.length) continue;
            const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
            for (const row of rows) {
                // OR REPLACE, not plain INSERT: migrations may seed rows on the fresh target
                // (setup_state's idempotent default), and the BACKUP state must win over seed
                // defaults. On a truly fresh target nothing else can collide.
                await db.exec(`INSERT OR REPLACE INTO "${name}" (${columns.map((column) => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
                    columns.map((column) => row[column] ?? null));
            }
        }
        await db.exec('COMMIT');
    } catch (error) {
        try { await db.exec('ROLLBACK'); } catch { /* target is fresh; the failure rethrows below */ }
        throw error;
    }
    return { report: await verifyStateIntegrity(db, backup) };
}

export interface IntegrityReport { ok: boolean; checks: { id: string; ok: boolean; detail: string }[] }

const check = (report: IntegrityReport, id: string, ok: boolean, detail: string) => { report.checks.push({ id, ok, detail }); if (!ok) report.ok = false; };
/** Collect every menu snapshot hash referenced by a publication artifact's page layouts. */
function menuHashes(node: unknown, found: Set<string>): void {
    if (Array.isArray(node)) { for (const child of node) menuHashes(child, found); return; }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const holder = (record.appMenus !== undefined ? record : record.root) as Record<string, unknown> | undefined;
    const reference = holder && typeof holder === 'object' ? holder.appMenus as Record<string, unknown> | undefined : undefined;
    if (reference && typeof reference.hash === 'string') found.add(reference.hash);
    for (const value of Object.values(record)) menuHashes(value, found);
}

/** Application-enforced integrity walk (no SQL foreign keys exist — the stores enforce, so the
 *  walk reuses the stores' own verification). Runs against any migrated DB; with `expected`,
 *  also reconciles ciphertext accounting and provenance against the export. */
export async function verifyStateIntegrity(db: DbRunner, expected?: StateBackup): Promise<IntegrityReport> {
    const report: IntegrityReport = { ok: true, checks: [] };
    const versions = await appliedVersions(db);
    check(report, 'schema-migrated', versions.length > 0, versions.length ? `migrations ${versions[0]!}..${versions[versions.length - 1]!}` : 'no migrations applied');
    if (expected) {
        const head = versions[versions.length - 1] ?? 0;
        check(report, 'schema-newer-than-backup', !expected.migrations.some((version) => version > head), expected.migrations.length ? `backup head ${expected.migrations[expected.migrations.length - 1]!}` : 'backup had no migrations');
    }
    const tenants = (await db.query('SELECT DISTINCT tenant_slug FROM settings ORDER BY tenant_slug')).map((row) => String(row.tenant_slug));
    const tableTenants = (await db.query('SELECT DISTINCT tenant_slug FROM compat_pages ORDER BY tenant_slug')).map((row) => String(row.tenant_slug));
    const allTenants = [...new Set([...tenants, ...tableTenants])];
    check(report, 'tenants-present', allTenants.length > 0, allTenants.length ? allTenants.join(',') : 'no tenant rows');
    for (const tenant of allTenants) {
        let pointer: { hash: string } | null = null;
        let artifact: { schemaVersion?: number } | null = null;
        try {
            const active = await new SitePublicationStore(db, tenant).activeVersion();
            // A tenant with settings rows but no active publication (e.g. the '_system'
            // provenance tenant) is intact, not corrupt.
            if (!active) { check(report, `${tenant}:publication-active`, true, 'no publication'); continue; }
            pointer = { hash: active.pointer.hash };
            artifact = active.artifact as { schemaVersion?: number };
        } catch (error) { check(report, `${tenant}:publication-active`, false, error instanceof Error ? error.message : 'unreadable'); }
        if (!pointer) continue;
        check(report, `${tenant}:publication-active`, true, pointer.hash);
        try {
            if (artifact!.schemaVersion === 2) {
                const manifest = await new SitePublicationManifestStore(db, tenant).get(pointer.hash);
                if (!manifest) throw Error('publication_manifest_unavailable');
                await new SitePublicationManifestStore(db, tenant).verify(manifest);
                check(report, `${tenant}:publication-chunks`, true, `manifest hash re-verified; ${manifest.chunks.length} chunks cross-checked`);
                const approvals = manifest.approvals ?? [];
                let missing = 0;
                for (const approval of approvals) {
                    const row = await db.query("SELECT COUNT(*) AS n FROM settings WHERE tenant_slug=? AND key LIKE ? ESCAPE '\\'", [tenant, `editorial\\_approval:v1:${approval.id}:%`]);
                    if (Number(row[0]?.n ?? 0) === 0) missing++;
                }
                check(report, `${tenant}:editorial-approvals`, missing === 0, missing === 0 ? `${approvals.length} present` : `${missing} missing`);
            } else check(report, `${tenant}:publication-chunks`, true, 'legacy artifact (store-level read only)');
        } catch (error) { check(report, `${tenant}:publication-chunks`, false, error instanceof Error ? error.message : 'unreadable'); }
        try { const review = await new SitePublicationReviewStore(db, tenant).get(pointer.hash); check(report, `${tenant}:publication-review`, !!review, review ? 'approved' : 'missing'); }
        catch (error) { check(report, `${tenant}:publication-review`, false, error instanceof Error ? error.message : 'unreadable'); }
        try {
            const raw = await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?', [tenant, `site_publication:manifest:v2:${pointer.hash}`]);
            const hashes = new Set<string>();
            if (raw.length) menuHashes(JSON.parse(String(raw[0]!.value)), hashes);
            const menus = new MenusSnapshotStore(db, tenant);
            let missing = 0;
            for (const hash of hashes) if (!await menus.get(hash)) missing++;
            check(report, `${tenant}:menu-snapshots`, missing === 0, missing === 0 ? `${hashes.size} present` : `${missing} missing`);
        } catch (error) { check(report, `${tenant}:menu-snapshots`, false, error instanceof Error ? error.message : 'unreadable'); }
        try {
            const published = await publishedHomepageLocales(db, tenant);
            let missing = 0;
            for (const item of published) if (!await readHomepageRelease(db, tenant, item.pointer.hash)) missing++;
            check(report, `${tenant}:locale-releases`, missing === 0, missing === 0 ? (published.length ? `${published.length} present` : 'none published') : `${missing} missing`);
        } catch (error) { check(report, `${tenant}:locale-releases`, false, error instanceof Error ? error.message : 'unreadable'); }
    }
    try {
        const assets = await db.query("SELECT key, value FROM settings WHERE key LIKE 'project\\_%' ESCAPE '\\' AND key NOT LIKE '%#%'");
        let broken = 0;
        for (const row of assets) {
            const meta = JSON.parse(String(row.value)) as { chunks?: number };
            for (let index = 0; index < (meta.chunks ?? 0); index++) {
                const part = await db.query('SELECT COUNT(*) AS n FROM settings WHERE key=?', [`${row.key}#${index}`]);
                if (Number(part[0]?.n ?? 0) === 0) broken++;
            }
        }
        check(report, 'asset-chunks', broken === 0, broken === 0 ? `${assets.length} assets intact` : `${broken} chunk rows missing`);
    } catch (error) { check(report, 'asset-chunks', false, error instanceof Error ? error.message : 'unreadable'); }
    const encCounts: Record<string, number> = {};
    let encTotal = 0;
    for (const { table, column, where } of ENC_COLUMNS) {
        const exists = await db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?", [table]);
        if (!Number(exists[0]?.n ?? 0)) continue;
        const sql = `SELECT COUNT(*) AS n FROM "${table}" WHERE substr("${column}",1,4)='enc:'${where ? ` AND ${where}` : ''}`;
        const n = Number((await db.query(sql))[0]?.n ?? 0);
        encCounts[`${table}.${column}${where ? `(${where})` : ''}`] = n;
        encTotal += n;
    }
    if (expected) {
        const drift = Object.keys(expected.encCounts).filter((key) => (encCounts[key] ?? 0) !== expected.encCounts[key]);
        check(report, 'secret-ciphertext-accounting', drift.length === 0 && encTotal === expected.secretProvenance.encTotal, drift.length === 0 ? `${encTotal} ciphertext rows match` : `drift: ${drift.join(',')}`);
        const bootSecretRowPresent = Number((await db.query("SELECT COUNT(*) AS n FROM settings WHERE tenant_slug='_system' AND key='boot.session_secret'"))[0]?.n ?? 0) > 0;
        check(report, 'secret-provenance', bootSecretRowPresent === expected.secretProvenance.bootSecretRowPresent, `boot secret row ${bootSecretRowPresent ? 'present' : 'absent'} (restore rule: env-set exports need the SAME SESSION_SECRET value, boot-generated exports need NO overriding env var)`);
    } else {
        check(report, 'secret-ciphertext-accounting', true, `${encTotal} ciphertext rows (no export to reconcile)`);
    }
    return report;
}
