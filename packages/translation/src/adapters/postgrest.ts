import { z } from 'zod';
import { localizationScopeSchema, translationRevisionSchema, type LocalizationScope } from '../contracts.js';
import { parsePersistenceKey, parsePersistenceChange, translationSnapshotSchema, sourceRecordSchema, storedRevisionSchema,
    type TranslationSnapshot, type SourceRecord, type StoredRevision, type PersistenceChange, type CasResult } from '../revisions.js';
import { translationJobSchema, translationJobIntentSchema, jobErrorSchema,
    type TranslationJobPersistence, type TranslationJob, type TranslationJobIntent, type EnqueueResult, type JobError } from '../jobs.js';

export type TranslationRpcOperation = 'capabilities' | 'read' | 'read-revision' | 'list-revisions' | 'find-approved-head' | 'read-source' | 'cas' | 'enqueue' | 'read-job'
    | 'ready-jobs' | 'claim' | 'renew' | 'dispatch' | 'fail' | 'cancel';
/** Host-injected authenticated HTTP client. No SQL, socket or credential lookup in the engine. */
export interface TranslationRpcTransport {
    call(operation: TranslationRpcOperation, scope: LocalizationScope, input: Record<string, unknown>): Promise<unknown>;
}
const id = translationRevisionSchema.shape.revisionId;
const positive = z.number().int().positive().safe();
const lease = z.number().int().min(1000).max(300_000);
function owner(actual: LocalizationScope, expected: LocalizationScope): void {
    if (actual.tenantId !== expected.tenantId || actual.projectId !== expected.projectId) throw Error('translation_rpc_scope_mismatch');
}

/** Each mutation is one atomic domain RPC. SQL installation is an explicit administrative operation. */
export class PostgrestTranslationJobPersistence implements TranslationJobPersistence {
    constructor(private readonly transport: TranslationRpcTransport) {}
    private async request(operation: TranslationRpcOperation, scope: LocalizationScope, input: Record<string, unknown>): Promise<unknown> {
        try { return await this.transport.call(operation, localizationScopeSchema.parse(scope), input); }
        catch { throw Error('translation_rpc_failed'); }
    }
    async initialize(): Promise<void> {
        z.object({ protocol: z.literal('frontbase-translation-postgrest'), version: z.literal(1) }).strict()
            .parse(await this.request('capabilities', { tenantId: '__setup__', projectId: '__setup__' }, {}));
    }
    async read(scopeInput: LocalizationScope, unitInput: string, localeInput?: string): Promise<TranslationSnapshot> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput);
        const value = translationSnapshotSchema.parse(await this.request('read', scope, { unitId, locale: locale ?? null }));
        if (value.source) owner(value.source.unit.scope, scope);
        if (value.head) { owner(value.head.scope, scope); if (value.head.unitId !== unitId || value.head.locale !== locale) throw Error('translation_rpc_key_mismatch'); }
        return value;
    }
    async readSourceVersion(scopeInput: LocalizationScope, unitInput: string, version: number): Promise<SourceRecord | null> {
        const { scope, unitId } = parsePersistenceKey(scopeInput, unitInput);
        const value = sourceRecordSchema.nullable().parse(await this.request('read-source', scope, { unitId, version: positive.parse(version) }));
        if (value) { owner(value.unit.scope, scope); if (value.sourceVersion !== version) throw Error('translation_rpc_key_mismatch'); }
        return value;
    }
    async readRevision(scopeInput: LocalizationScope, unitInput: string, localeInput: string, revisionInput: string): Promise<StoredRevision | null> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput), revisionId = id.parse(revisionInput);
        const value = storedRevisionSchema.nullable().parse(await this.request('read-revision', scope, { unitId, locale, revisionId }));
        if (value) { owner(value.scope, scope); if (value.unitId !== unitId || value.locale !== locale || value.revisionId !== revisionId) throw Error('translation_rpc_key_mismatch'); }
        return value;
    }
    async listRevisions(scopeInput: LocalizationScope, unitInput: string, localeInput: string, limit: number): Promise<StoredRevision[]> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, unitInput, localeInput);
        const value = z.array(storedRevisionSchema).max(100)
            .parse(await this.request('list-revisions', scope, { unitId, locale, limit: z.number().int().min(1).max(100).parse(limit) }));
        for (const revision of value) { owner(revision.scope, scope); if (revision.unitId !== unitId || revision.locale !== locale) throw Error('translation_rpc_key_mismatch'); }
        return value;
    }
    async findApprovedHead(scopeInput: LocalizationScope, localeInput: string, fingerprintInput: string, excludeInput: string): Promise<{ unitId: string; revision: StoredRevision } | null> {
        const { scope, unitId, locale } = parsePersistenceKey(scopeInput, excludeInput, localeInput);
        const value = z.object({ unitId: id, revision: storedRevisionSchema }).strict().nullable()
            .parse(await this.request('find-approved-head', scope, { locale, fingerprint: id.parse(fingerprintInput), excludeUnitId: unitId }));
        if (value) { owner(value.revision.scope, scope); if (value.revision.unitId !== value.unitId || value.revision.locale !== locale || value.unitId === unitId) throw Error('translation_rpc_key_mismatch'); }
        return value;
    }
    async compareAndSwap(scope: LocalizationScope, unitId: string, version: number, change: PersistenceChange): Promise<CasResult> {
        const checked = parsePersistenceChange(scope, unitId, version, change);
        return z.enum(['committed', 'conflict', 'revision-id-conflict', 'job-fenced'])
            .parse(await this.request('cas', checked.scope, { unitId: checked.unitId, expectedVersion: checked.expectedVersion, change: checked.change }));
    }
    async enqueueJob(scopeInput: LocalizationScope, input: TranslationJobIntent): Promise<EnqueueResult> {
        return z.enum(['created', 'already-exists', 'id-conflict', 'input-changed', 'head-changed', 'manual-protected', 'unsupported-format', 'revision-id-conflict'])
            .parse(await this.request('enqueue', localizationScopeSchema.parse(scopeInput), { intent: translationJobIntentSchema.parse(input) }));
    }
    private job(value: unknown, scope: LocalizationScope, jobId: string): TranslationJob | null {
        const job = translationJobSchema.nullable().parse(value);
        if (job) { owner(job.scope, scope); if (job.intent.jobId !== jobId) throw Error('translation_rpc_key_mismatch'); }
        return job;
    }
    async readJob(scopeInput: LocalizationScope, jobInput: string): Promise<TranslationJob | null> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput);
        return this.job(await this.request('read-job', scope, { jobId }), scope, jobId);
    }
    async listReadyJobs(scope: LocalizationScope, limit: number): Promise<string[]> {
        return z.array(id).max(128).parse(await this.request('ready-jobs', scope, { limit: z.number().int().min(1).max(128).parse(limit) }));
    }
    async claimJob(scopeInput: LocalizationScope, jobInput: string, leaseMs: number): Promise<TranslationJob | null> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput);
        return this.job(await this.request('claim', scope, { jobId, leaseMs: lease.parse(leaseMs) }), scope, jobId);
    }
    async renewJob(scope: LocalizationScope, jobId: string, leaseVersion: number, leaseMs: number): Promise<boolean> {
        return z.boolean().parse(await this.request('renew', scope, { jobId: id.parse(jobId), leaseVersion: positive.parse(leaseVersion), leaseMs: lease.parse(leaseMs) }));
    }
    async markJobDispatched(scope: LocalizationScope, jobId: string, leaseVersion: number): Promise<boolean> {
        return z.boolean().parse(await this.request('dispatch', scope, { jobId: id.parse(jobId), leaseVersion: positive.parse(leaseVersion) }));
    }
    async failJob(scope: LocalizationScope, jobId: string, leaseVersion: number, input: { code: JobError; retryable: boolean; delayMs: number }): Promise<boolean> {
        const failure = z.object({ code: jobErrorSchema, retryable: z.boolean(), delayMs: z.number().int().min(0).max(300_000) }).strict().parse(input);
        return z.boolean().parse(await this.request('fail', scope, { jobId: id.parse(jobId), leaseVersion: positive.parse(leaseVersion), ...failure }));
    }
    async cancelJob(scope: LocalizationScope, jobId: string): Promise<boolean> {
        return z.boolean().parse(await this.request('cancel', scope, { jobId: id.parse(jobId) }));
    }
}
