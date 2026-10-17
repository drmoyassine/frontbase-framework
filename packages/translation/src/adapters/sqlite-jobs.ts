import { z } from 'zod';
import { localizationScopeSchema, translationRevisionSchema, type LocalizationScope } from '../contracts.js';
import { validatePlainRevision, type StoredRevision, type JobCommitFence } from '../revisions.js';
import { translationJobIntentSchema, translationJobSchema, jobErrorSchema, type TranslationJob, type TranslationJobIntent,
    type TranslationJobPersistence, type EnqueueResult, type JobError } from '../jobs.js';
import { SqliteTranslationPersistence, type SqliteConnection } from './sqlite.js';

const id = translationRevisionSchema.shape.revisionId;
const counter = z.number().int().nonnegative().safe();
const lease = z.number().int().min(1000).max(300_000);
type Row = Record<string, unknown>;

/** Durable job state and revision completion share one SQLite transaction/clock authority. */
export class SqliteTranslationJobPersistence extends SqliteTranslationPersistence implements TranslationJobPersistence {
    private readonly clock: () => number;
    constructor(connection: SqliteConnection, options: { tablePrefix?: string; clock?: () => number } = {}) {
        super(connection, options); this.clock = options.clock ?? Date.now;
    }
    protected now(): number { return counter.parse(this.clock()); }
    protected transaction<T>(operation: () => T): T {
        this.connection.exec('BEGIN IMMEDIATE');
        try { const result = operation(); this.connection.exec('COMMIT'); return result; }
        catch { this.connection.exec('ROLLBACK'); throw Error('translation_job_store_failed'); }
    }
    override initialize(): void {
        super.initialize();
        this.transaction(() => {
            const db = this.connection, p = this.prefix;
            db.exec(`CREATE TABLE IF NOT EXISTS ${p}job_meta(id INTEGER PRIMARY KEY CHECK(id = 1), schema_version INTEGER NOT NULL)`);
            const meta = db.prepare(`SELECT schema_version FROM ${p}job_meta WHERE id = 1`).get() as Row | undefined;
            if (meta && meta.schema_version !== 1) throw Error('unsupported_translation_job_schema');
            db.exec(`CREATE TABLE IF NOT EXISTS ${p}jobs (
                tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, job_id TEXT NOT NULL, unit_id TEXT NOT NULL,
                locale TEXT NOT NULL, revision_id TEXT NOT NULL, source_version INTEGER NOT NULL, intent_json TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('queued','leased','completed','failed','cancelled')),
                lease_version INTEGER NOT NULL, attempt INTEGER NOT NULL, available_at INTEGER NOT NULL, lease_until INTEGER,
                dispatched INTEGER NOT NULL CHECK(dispatched IN (0,1)), uncertain_attempts INTEGER NOT NULL, last_error TEXT,
                PRIMARY KEY(tenant_id, project_id, job_id), UNIQUE(tenant_id, project_id, unit_id, locale, revision_id),
                FOREIGN KEY(tenant_id, project_id, unit_id, source_version) REFERENCES ${p}source_history(tenant_id, project_id, unit_id, source_version));
                CREATE INDEX IF NOT EXISTS ${p}jobs_ready ON ${p}jobs(tenant_id, project_id, status, available_at, lease_until)`);
            if (!meta) db.prepare(`INSERT INTO ${p}job_meta VALUES(1,1)`).run();
        });
    }
    protected getJob(scope: LocalizationScope, jobId: string): TranslationJob | null {
        const row = this.connection.prepare(`SELECT * FROM ${this.prefix}jobs WHERE tenant_id = ? AND project_id = ? AND job_id = ?`)
            .get(scope.tenantId, scope.projectId, jobId) as Row | undefined;
        return row ? translationJobSchema.parse({ scope: { tenantId: row.tenant_id, projectId: row.project_id }, intent: JSON.parse(String(row.intent_json)),
            status: row.status, leaseVersion: Number(row.lease_version), attempt: Number(row.attempt), availableAt: Number(row.available_at),
            leaseUntil: row.lease_until === null ? null : Number(row.lease_until), dispatched: row.dispatched === 1,
            uncertainAttempts: Number(row.uncertain_attempts), lastError: row.last_error }) : null;
    }
    protected saveJob(jobInput: TranslationJob): void {
        const job = translationJobSchema.parse(jobInput);
        this.connection.prepare(`UPDATE ${this.prefix}jobs SET status = ?, lease_version = ?, attempt = ?, available_at = ?, lease_until = ?, dispatched = ?, uncertain_attempts = ?, last_error = ?
            WHERE tenant_id = ? AND project_id = ? AND job_id = ?`).run(job.status, job.leaseVersion, job.attempt, job.availableAt, job.leaseUntil,
            job.dispatched ? 1 : 0, job.uncertainAttempts, job.lastError, job.scope.tenantId, job.scope.projectId, job.intent.jobId);
    }
    protected live(job: TranslationJob | null, epoch: number): job is TranslationJob {
        return !!job && job.status === 'leased' && job.leaseVersion === epoch && job.leaseUntil !== null && job.leaseUntil > this.now();
    }
    protected inputProblem(job: TranslationJob): 'input-changed' | 'head-changed' | 'manual-protected' | 'unsupported-format' | null {
        const { scope, intent } = job, db = this.connection;
        const unit = db.prepare(`SELECT * FROM ${this.prefix}units WHERE tenant_id = ? AND project_id = ? AND unit_id = ?`)
            .get(scope.tenantId, scope.projectId, intent.unitId) as Row | undefined;
        if (!unit || Number(unit.source_version) !== intent.sourceVersion || unit.source_fingerprint !== intent.sourceFingerprint || unit.context_fingerprint !== intent.contextFingerprint) return 'input-changed';
        const source = this.sourceFromRow(unit);
        if (source.unit.sourceLocale === intent.locale || validatePlainRevision(source.unit, source.unit.text)) return 'unsupported-format';
        const head = db.prepare(`SELECT r.payload_json FROM ${this.prefix}heads h JOIN ${this.prefix}revisions r
            ON r.tenant_id=h.tenant_id AND r.project_id=h.project_id AND r.unit_id=h.unit_id AND r.locale=h.locale AND r.revision_id=h.revision_id
            WHERE h.tenant_id = ? AND h.project_id = ? AND h.unit_id = ? AND h.locale = ?`)
            .get(scope.tenantId, scope.projectId, intent.unitId, intent.locale) as Row | undefined;
        const revision = head ? JSON.parse(String(head.payload_json)) as StoredRevision : null;
        return (revision?.revisionId ?? null) !== intent.expectedHead ? 'head-changed' : revision?.provenance === 'manual' ? 'manual-protected' : null;
    }
    async enqueueJob(scopeInput: LocalizationScope, input: TranslationJobIntent): Promise<EnqueueResult> {
        const scope = localizationScopeSchema.parse(scopeInput), intent = translationJobIntentSchema.parse(input);
        return this.transaction(() => {
            const existing = this.getJob(scope, intent.jobId);
            if (existing) return JSON.stringify(existing.intent) === JSON.stringify(intent) ? 'already-exists' : 'id-conflict';
            const job: TranslationJob = { scope, intent, status: 'queued', leaseVersion: 0, attempt: 0, availableAt: this.now(), leaseUntil: null,
                dispatched: false, uncertainAttempts: 0, lastError: null };
            const problem = this.inputProblem(job);
            if (problem) return problem;
            const keys = [scope.tenantId, scope.projectId, intent.unitId, intent.locale, intent.revisionId];
            if (this.connection.prepare(`SELECT 1 FROM ${this.prefix}revisions WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND locale = ? AND revision_id = ?`).get(...keys)
                || this.connection.prepare(`SELECT 1 FROM ${this.prefix}jobs WHERE tenant_id = ? AND project_id = ? AND unit_id = ? AND locale = ? AND revision_id = ?`).get(...keys)) return 'revision-id-conflict';
            this.connection.prepare(`INSERT INTO ${this.prefix}jobs(tenant_id,project_id,job_id,unit_id,locale,revision_id,source_version,intent_json,status,lease_version,attempt,available_at,lease_until,dispatched,uncertain_attempts,last_error)
                VALUES(?,?,?,?,?,?,?,?,'queued',0,0,?,NULL,0,0,NULL)`).run(scope.tenantId, scope.projectId, intent.jobId, intent.unitId, intent.locale, intent.revisionId, intent.sourceVersion, JSON.stringify(intent), job.availableAt);
            return 'created';
        });
    }
    async readJob(scopeInput: LocalizationScope, jobInput: string): Promise<TranslationJob | null> {
        return this.getJob(localizationScopeSchema.parse(scopeInput), id.parse(jobInput));
    }
    async listReadyJobs(scopeInput: LocalizationScope, limitInput: number): Promise<string[]> {
        const scope = localizationScopeSchema.parse(scopeInput), limit = z.number().int().min(1).max(128).parse(limitInput), now = this.now();
        // Bounded discovery without requiring the caller to remember job IDs after restart. get() uses a JSON aggregate to keep the injected driver minimal.
        const data = this.connection.prepare(`SELECT json_group_array(job_id) AS ids FROM (SELECT job_id FROM ${this.prefix}jobs
            WHERE tenant_id = ? AND project_id = ? AND ((status='queued' AND available_at <= ?) OR (status='leased' AND lease_until <= ?))
            ORDER BY CASE WHEN status='leased' THEN lease_until ELSE available_at END, job_id LIMIT ?)`)
            .get(scope.tenantId, scope.projectId, now, now, limit) as Row;
        return JSON.parse(String(data.ids)) as string[];
    }
    async claimJob(scopeInput: LocalizationScope, jobInput: string, leaseInput: number): Promise<TranslationJob | null> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput), leaseMs = lease.parse(leaseInput);
        return this.transaction(() => {
            const job = this.getJob(scope, jobId), now = this.now();
            if (!job || !['queued', 'leased'].includes(job.status) || (job.status === 'queued' ? job.availableAt > now : job.leaseUntil! > now)) return null;
            if (job.dispatched) job.uncertainAttempts++;
            job.dispatched = false;
            if (job.attempt >= job.intent.maxAttempts) { job.status = 'failed'; job.leaseUntil = null; job.lastError = 'attempt-limit'; this.saveJob(job); return null; }
            job.status = 'leased'; job.leaseVersion++; job.attempt++; job.leaseUntil = counter.parse(now + leaseMs);
            this.saveJob(job); return job;
        });
    }
    async renewJob(scopeInput: LocalizationScope, jobInput: string, epoch: number, leaseInput: number): Promise<boolean> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput), leaseMs = lease.parse(leaseInput); counter.min(1).parse(epoch);
        return this.transaction(() => { const job = this.getJob(scope, jobId); if (!this.live(job, epoch)) return false;
            job.leaseUntil = counter.parse(this.now() + leaseMs); this.saveJob(job); return true; });
    }
    async markJobDispatched(scopeInput: LocalizationScope, jobInput: string, epoch: number): Promise<boolean> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput); counter.min(1).parse(epoch);
        return this.transaction(() => {
            const job = this.getJob(scope, jobId); if (!this.live(job, epoch) || job.dispatched) return false;
            const problem = this.inputProblem(job);
            if (problem) { job.status = 'failed'; job.leaseUntil = null; job.lastError = problem === 'unsupported-format' ? 'invalid-result' : problem === 'manual-protected' ? 'head-changed' : problem; this.saveJob(job); return false; }
            job.dispatched = true; this.saveJob(job); return true;
        });
    }
    async failJob(scopeInput: LocalizationScope, jobInput: string, epoch: number, input: { code: JobError; retryable: boolean; delayMs: number }): Promise<boolean> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput); counter.min(1).parse(epoch);
        const failure = z.object({ code: jobErrorSchema, retryable: z.boolean(), delayMs: z.number().int().min(0).max(300_000) }).strict().parse(input);
        return this.transaction(() => { const job = this.getJob(scope, jobId); if (!this.live(job, epoch)) return false;
            if (job.dispatched) job.uncertainAttempts++; job.dispatched = false; job.leaseUntil = null; job.lastError = failure.code;
            job.status = failure.retryable && job.attempt < job.intent.maxAttempts ? 'queued' : 'failed';
            job.availableAt = counter.parse(this.now() + failure.delayMs); this.saveJob(job); return true; });
    }
    async cancelJob(scopeInput: LocalizationScope, jobInput: string): Promise<boolean> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput);
        return this.transaction(() => { const job = this.getJob(scope, jobId); if (!job || !['queued','leased'].includes(job.status)) return false;
            if (job.dispatched) job.uncertainAttempts++; job.dispatched = false; job.status = 'cancelled'; job.leaseUntil = null; this.saveJob(job); return true; });
    }
    protected override validateJobFence(scope: LocalizationScope, revision: StoredRevision, fence: JobCommitFence): boolean {
        const job = this.getJob(scope, fence.jobId);
        return this.live(job, fence.leaseVersion) && job.dispatched && revision.provenance === 'ai'
            && job.intent.unitId === revision.unitId && job.intent.locale === revision.locale && job.intent.revisionId === revision.revisionId
            && job.intent.sourceVersion === revision.sourceVersion && job.intent.sourceFingerprint === revision.sourceFingerprint
            && job.intent.contextFingerprint === revision.contextFingerprint && job.intent.expectedHead === revision.expectedHead;
    }
    protected override finishJobFence(scope: LocalizationScope, fence: JobCommitFence): void {
        const job = this.getJob(scope, fence.jobId);
        if (!this.live(job, fence.leaseVersion)) throw Error('translation_job_fenced');
        job.status = 'completed'; job.leaseUntil = null; job.dispatched = false; job.lastError = null; this.saveJob(job);
    }
}
