import { translationRevisionSchema, EMPTY_TRANSLATION_CONTEXT_FINGERPRINT, type LocalizationScope } from '../contracts.js';
import { parsePersistenceChange, parsePersistenceKey, sourceRecordSchema, storedRevisionSchema,
    type TranslationPersistence, type TranslationSnapshot, type PersistenceChange, type StoredRevision, type CasResult, type SourceRecord, type JobCommitFence } from '../revisions.js';

type Value = string | number | null;
/** Inject a dedicated synchronous SQLite connection. No Node/D1/provider SDK dependency is imported. */
export interface SqliteConnection {
    exec(sql: string): unknown;
    prepare(sql: string): { get(...values: Value[]): unknown; run(...values: Value[]): unknown };
}
type Row = Record<string, unknown>;
const row = (value: unknown): Row | undefined => value as Row | undefined;

/** Persistent reference adapter. Not a compatibility claim for async D1/Turso or PostgreSQL transports. */
export class SqliteTranslationPersistence implements TranslationPersistence {
    protected readonly prefix: string;
    constructor(protected readonly connection: SqliteConnection, options: { tablePrefix?: string } = {}) {
        this.prefix = options.tablePrefix ?? 'fb_i18n_';
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(this.prefix)) throw Error('invalid_translation_table_prefix');
    }
    /** Explicit initialization; never silently changes an existing schema version. Dedicated connection required. */
    initialize(): void {
        const p = this.prefix, db = this.connection;
        db.exec('PRAGMA foreign_keys = ON');
        if (Number(row(db.prepare('PRAGMA foreign_keys').get())?.foreign_keys) !== 1) throw Error('translation_foreign_keys_required');
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec(`CREATE TABLE IF NOT EXISTS ${p}meta (id INTEGER PRIMARY KEY CHECK(id = 1), schema_version INTEGER NOT NULL)`);
            const meta = row(db.prepare(`SELECT schema_version FROM ${p}meta WHERE id = 1`).get());
            if (meta && meta.schema_version !== 1 && meta.schema_version !== 2) throw Error('unsupported_translation_schema');
            db.exec(`CREATE TABLE IF NOT EXISTS ${p}units (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, unit_id TEXT NOT NULL,
                version INTEGER NOT NULL CHECK(version > 0), source_version INTEGER NOT NULL CHECK(source_version > 0),
                source_json TEXT NOT NULL, source_fingerprint TEXT NOT NULL, context_json TEXT NOT NULL, context_fingerprint TEXT NOT NULL,
                PRIMARY KEY(tenant_id, project_id, unit_id));
                CREATE TABLE IF NOT EXISTS ${p}revisions (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, unit_id TEXT NOT NULL, locale TEXT NOT NULL, revision_id TEXT NOT NULL,
                payload_json TEXT NOT NULL, PRIMARY KEY(tenant_id, project_id, unit_id, locale, revision_id),
                FOREIGN KEY(tenant_id, project_id, unit_id) REFERENCES ${p}units(tenant_id, project_id, unit_id));
                CREATE TABLE IF NOT EXISTS ${p}heads (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, unit_id TEXT NOT NULL, locale TEXT NOT NULL, revision_id TEXT NOT NULL,
                PRIMARY KEY(tenant_id, project_id, unit_id, locale),
                FOREIGN KEY(tenant_id, project_id, unit_id, locale, revision_id) REFERENCES ${p}revisions(tenant_id, project_id, unit_id, locale, revision_id));`);
            if (meta?.schema_version === 1) {
                db.exec(`ALTER TABLE ${p}units ADD COLUMN context_json TEXT NOT NULL DEFAULT '{"version":1}';
                    ALTER TABLE ${p}units ADD COLUMN context_fingerprint TEXT NOT NULL DEFAULT '${EMPTY_TRANSLATION_CONTEXT_FINGERPRINT}'`);
            }
            db.exec(`CREATE TABLE IF NOT EXISTS ${p}source_history (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, unit_id TEXT NOT NULL, source_version INTEGER NOT NULL,
                source_json TEXT NOT NULL, source_fingerprint TEXT NOT NULL, context_json TEXT NOT NULL, context_fingerprint TEXT NOT NULL,
                PRIMARY KEY(tenant_id, project_id, unit_id, source_version),
                FOREIGN KEY(tenant_id, project_id, unit_id) REFERENCES ${p}units(tenant_id, project_id, unit_id))`);
            if (meta?.schema_version === 1) {
                // Only the registered current version is recoverable; never invent missing historical wording.
                db.exec(`INSERT INTO ${p}source_history SELECT tenant_id, project_id, unit_id, source_version, source_json, source_fingerprint, context_json, context_fingerprint FROM ${p}units`);
            }
            db.prepare(`INSERT INTO ${p}meta(id, schema_version) VALUES(1, 2) ON CONFLICT(id) DO UPDATE SET schema_version = 2`).run();
            db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
    }

    async read(scopeInput: LocalizationScope, unitInput: string, localeInput?: string): Promise<TranslationSnapshot> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput), p = this.prefix;
        // One SQLite statement provides a consistent source/head read across other connections.
        const data = row(this.connection.prepare(`SELECT u.version, u.source_json, u.source_version, u.source_fingerprint, u.context_json, u.context_fingerprint, r.payload_json
            FROM ${p}units u LEFT JOIN ${p}heads h ON h.tenant_id = u.tenant_id AND h.project_id = u.project_id AND h.unit_id = u.unit_id AND h.locale = ?
            LEFT JOIN ${p}revisions r ON r.tenant_id = h.tenant_id AND r.project_id = h.project_id AND r.unit_id = h.unit_id AND r.locale = h.locale AND r.revision_id = h.revision_id
            WHERE u.tenant_id = ? AND u.project_id = ? AND u.unit_id = ?`).get(locale ?? null, scope.tenantId, scope.projectId, unitId));
        if (!data) return { version: 0, source: null, head: null };
        return { version: Number(data.version), source: this.sourceFromRow(data),
            head: data.payload_json === null ? null : storedRevisionSchema.parse(JSON.parse(String(data.payload_json))) };
    }

    protected sourceFromRow(data: Row): SourceRecord {
        return sourceRecordSchema.parse({ unit: JSON.parse(String(data.source_json)), sourceVersion: Number(data.source_version), fingerprint: data.source_fingerprint,
            context: JSON.parse(String(data.context_json)), contextFingerprint: data.context_fingerprint });
    }
    async readSourceVersion(scopeInput: LocalizationScope, unitInput: string, version: number): Promise<SourceRecord | null> {
        const { scope, unitId } = parsePersistenceKey(scopeInput, unitInput);
        if (!Number.isSafeInteger(version) || version < 1) throw Error('invalid_translation_source_version');
        const data = row(this.connection.prepare(`SELECT * FROM ${this.prefix}source_history WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND source_version = ?`)
            .get(scope.tenantId, scope.projectId, unitId, version));
        return data ? this.sourceFromRow(data) : null;
    }

    /** Hooks run synchronously inside the same transaction as target revision/head changes. */
    protected validateJobFence(_scope: LocalizationScope, _revision: StoredRevision, _fence: JobCommitFence): boolean { return false; }
    protected finishJobFence(_scope: LocalizationScope, _fence: JobCommitFence): void { throw Error('translation_job_adapter_required'); }

    async readRevision(scopeInput: LocalizationScope, unitInput: string, localeInput: string, revisionInput: string): Promise<StoredRevision | null> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput), revisionId = translationRevisionSchema.shape.revisionId.parse(revisionInput);
        const data = row(this.connection.prepare(`SELECT payload_json FROM ${this.prefix}revisions WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND locale = ? AND revision_id = ?`)
            .get(scope.tenantId, scope.projectId, unitId, locale!, revisionId));
        return data ? storedRevisionSchema.parse(JSON.parse(String(data.payload_json))) : null;
    }

    async listRevisions(scopeInput: LocalizationScope, unitInput: string, localeInput: string, limitInput: number): Promise<StoredRevision[]> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput);
        if (!Number.isSafeInteger(limitInput) || limitInput < 1) throw Error('invalid_translation_history_limit');
        const limit = Math.min(limitInput, 100), statement = this.connection
            .prepare(`SELECT payload_json FROM ${this.prefix}revisions WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND locale = ? ORDER BY rowid DESC LIMIT 1 OFFSET ?`);
        const revisions: StoredRevision[] = [];
        for (let offset = 0; offset < limit; offset++) {
            const data = row(statement.get(scope.tenantId, scope.projectId, unitId, locale!, offset));
            if (!data) break;
            revisions.push(storedRevisionSchema.parse(JSON.parse(String(data.payload_json))));
        }
        return revisions;
    }

    async findApprovedHead(scopeInput: LocalizationScope, localeInput: string, fingerprintInput: string, excludeInput: string): Promise<{ unitId: string; revision: StoredRevision } | null> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, excludeInput, localeInput);
        const fingerprint = translationRevisionSchema.shape.unitId.parse(fingerprintInput);
        // The revision payload records the fingerprint it was translated from, so the match never
        // depends on the unit's current source. Heads join pins each candidate to its unit's live head.
        const data = row(this.connection.prepare(`SELECT r.unit_id, r.payload_json FROM ${this.prefix}revisions r
            JOIN ${this.prefix}heads h ON h.tenant_id = r.tenant_id AND h.project_id = r.project_id AND h.unit_id = r.unit_id AND h.locale = r.locale AND h.revision_id = r.revision_id
            WHERE r.tenant_id = ? AND r.project_id = ? AND r.locale = ? AND r.unit_id <> ? AND json_extract(r.payload_json, '$.sourceFingerprint') = ?
            ORDER BY r.rowid DESC LIMIT 1`).get(scope.tenantId, scope.projectId, locale!, unitId, fingerprint));
        return data ? { unitId: String(data.unit_id), revision: storedRevisionSchema.parse(JSON.parse(String(data.payload_json))) } : null;
    }

    async compareAndSwap(scopeInput: LocalizationScope, unitInput: string, versionInput: number, input: PersistenceChange): Promise<CasResult> {
        const { scope, unitId, expectedVersion, change } = parsePersistenceChange(scopeInput, unitInput, versionInput, input);
        const keys = [scope.tenantId, scope.projectId, unitId], db = this.connection, p = this.prefix;
        db.exec('BEGIN IMMEDIATE');
        try {
            const current = row(db.prepare(`SELECT version, source_version FROM ${p}units WHERE tenant_id = ? AND project_id = ? AND unit_id = ?`).get(...keys));
            const currentVersion = current ? Number(current.version) : 0;
            if (currentVersion !== expectedVersion) { db.exec('ROLLBACK'); return 'conflict'; }
            if (change.kind === 'revision' && change.jobFence && !this.validateJobFence(scope, change.revision, change.jobFence)) { db.exec('ROLLBACK'); return 'job-fenced'; }
            if (change.kind === 'source') {
                const source = change.source;
                if (source.sourceVersion !== (current ? Number(current.source_version) : 0) + 1) throw Error('invalid_translation_source_version');
                const payload = [source.sourceVersion, JSON.stringify(source.unit), source.fingerprint, JSON.stringify(source.context), source.contextFingerprint];
                if (!current) db.prepare(`INSERT INTO ${p}units(tenant_id, project_id, unit_id, version, source_version, source_json, source_fingerprint, context_json, context_fingerprint) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(...keys, 1, ...payload);
                else db.prepare(`UPDATE ${p}units SET version = ?, source_version = ?, source_json = ?, source_fingerprint = ?, context_json = ?, context_fingerprint = ? WHERE tenant_id = ? AND project_id = ? AND unit_id = ?`)
                    .run(expectedVersion + 1, ...payload, ...keys);
                db.prepare(`INSERT INTO ${p}source_history(tenant_id, project_id, unit_id, source_version, source_json, source_fingerprint, context_json, context_fingerprint) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
                    .run(...keys, ...payload);
            } else {
                if (!current) { db.exec('ROLLBACK'); return 'conflict'; }
                const revision = change.revision, identity = [...keys, revision.locale, revision.revisionId];
                if (db.prepare(`SELECT 1 FROM ${p}revisions WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND locale = ? AND revision_id = ?`).get(...identity)) {
                    db.exec('ROLLBACK'); return 'revision-id-conflict';
                }
                db.prepare(`INSERT INTO ${p}revisions(tenant_id, project_id, unit_id, locale, revision_id, payload_json) VALUES(?, ?, ?, ?, ?, ?)`)
                    .run(...identity, JSON.stringify(revision));
                db.prepare(`INSERT INTO ${p}heads(tenant_id, project_id, unit_id, locale, revision_id) VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(tenant_id, project_id, unit_id, locale) DO UPDATE SET revision_id = excluded.revision_id`).run(...identity);
                db.prepare(`UPDATE ${p}units SET version = ? WHERE tenant_id = ? AND project_id = ? AND unit_id = ?`).run(expectedVersion + 1, ...keys);
                if (change.jobFence) this.finishJobFence(scope, change.jobFence);
            }
            db.exec('COMMIT'); return 'committed';
        } catch { db.exec('ROLLBACK'); throw Error('translation_store_write_failed'); }
    }
}
