import { z } from 'zod';
import { localizationScopeSchema, type LocalizationScope } from './contracts.js';
import { revisionIntentSchema, sourceRecordSchema, TranslationLifecycle, validatePlainRevision, type SourceRecord, type TranslationPersistence } from './revisions.js';
import { translationUnitId, messageSourceFingerprint, translationContextFingerprint } from './identity.js';
import type { TranslationAttemptAccounting } from './accounting.js';

const counter = z.number().int().nonnegative().safe();
const id = revisionIntentSchema.shape.revisionId;
export const translationJobIntentSchema = revisionIntentSchema.omit({ text: true }).extend({
    jobId: id, providerId: id, promptVersion: id, maxAttempts: z.number().int().min(1).max(8).default(3),
});
export const jobErrorSchema = z.enum(['denied', 'provider-error', 'provider-timeout', 'invalid-result', 'input-changed', 'head-changed', 'job-fenced',
    'write-conflict', 'attempt-limit', 'provider-unavailable', 'source-history-missing']);
export const translationJobSchema = z.object({ scope: localizationScopeSchema, intent: translationJobIntentSchema,
    status: z.enum(['queued', 'leased', 'completed', 'failed', 'cancelled']), leaseVersion: counter, attempt: counter,
    availableAt: counter, leaseUntil: counter.nullable(), dispatched: z.boolean(), uncertainAttempts: counter, lastError: jobErrorSchema.nullable(),
}).strict();
export const translationProviderResultSchema = z.object({ text: z.string().max(100_000),
    usage: z.object({ inputTokens: counter, outputTokens: counter }).strict().optional() }).strict();
export type TranslationJobIntent = z.input<typeof translationJobIntentSchema>;
export type TranslationJob = z.infer<typeof translationJobSchema>;
export type JobError = z.infer<typeof jobErrorSchema>;
export type EnqueueResult = 'created' | 'already-exists' | 'id-conflict' | 'input-changed' | 'head-changed' | 'manual-protected' | 'unsupported-format' | 'revision-id-conflict';
/** Each transition uses the adapter's trusted clock and persisted lease epoch, never visitor timestamps. */
export interface TranslationJobPersistence extends TranslationPersistence {
    enqueueJob(scope: LocalizationScope, intent: TranslationJobIntent): Promise<EnqueueResult>;
    readJob(scope: LocalizationScope, jobId: string): Promise<TranslationJob | null>;
    listReadyJobs(scope: LocalizationScope, limit: number): Promise<string[]>;
    claimJob(scope: LocalizationScope, jobId: string, leaseMs: number): Promise<TranslationJob | null>;
    renewJob(scope: LocalizationScope, jobId: string, leaseVersion: number, leaseMs: number): Promise<boolean>;
    markJobDispatched(scope: LocalizationScope, jobId: string, leaseVersion: number): Promise<boolean>;
    failJob(scope: LocalizationScope, jobId: string, leaseVersion: number, input: { code: JobError; retryable: boolean; delayMs: number }): Promise<boolean>;
    cancelJob(scope: LocalizationScope, jobId: string): Promise<boolean>;
}
export interface TranslationAIProvider {
    readonly id: string;
    generate(input: { source: SourceRecord; targetLocale: string; promptVersion: string; idempotencyKey: string },
        options: { signal: AbortSignal }): Promise<unknown>;
}
/** Providers may expose only safe classifications. Arbitrary exception details never enter job records. */
export class TranslationProviderError extends Error {
    constructor(readonly retryable: boolean) { super('translation_provider_error'); }
}
export interface TranslationRunnerOptions {
    /** Mandatory host policy: selected content/AI transmission and any budget reservation are host-owned. */
    authorize(job: TranslationJob, source: SourceRecord): Promise<boolean>;
    leaseMs?: number;
    providerTimeoutMs?: number;
    accounting?: TranslationAttemptAccounting;
}

export class TranslationJobRunner {
    private readonly leaseMs: number;
    private readonly timeoutMs: number;
    constructor(private readonly store: TranslationJobPersistence, private readonly provider: TranslationAIProvider, private readonly options: TranslationRunnerOptions) {
        this.leaseMs = z.number().int().min(1000).max(300_000).parse(options.leaseMs ?? 60_000);
        this.timeoutMs = z.number().int().min(1).max(this.leaseMs - 1).parse(options.providerTimeoutMs ?? Math.min(20_000, this.leaseMs - 1));
        if (typeof options.authorize !== 'function') throw Error('translation_generation_policy_required');
        id.parse(provider.id);
    }
    /** A scheduler calls this bounded operation; persisted discovery/leases provide recovery, not a JS timer. */
    async runOnce(scopeInput: LocalizationScope, jobInput: string): Promise<TranslationJob | null> {
        const scope = localizationScopeSchema.parse(scopeInput), jobId = id.parse(jobInput);
        const claimed = await this.store.claimJob(scope, jobId, this.leaseMs);
        if (!claimed) return this.store.readJob(scope, jobId);
        const job = translationJobSchema.parse(claimed), intent = job.intent;
        if (job.scope.tenantId !== scope.tenantId || job.scope.projectId !== scope.projectId || intent.jobId !== jobId) throw Error('translation_job_scope_mismatch');
        const fail = async (code: JobError, retryable = false) => {
            await this.store.failJob(scope, jobId, job.leaseVersion, { code, retryable, delayMs: Math.min(30_000, 1000 * 2 ** (job.attempt - 1)) });
            return this.store.readJob(scope, jobId);
        };
        const sourceInput = await this.store.readSourceVersion(scope, intent.unitId, intent.sourceVersion);
        if (!sourceInput) return fail('source-history-missing');
        const source = sourceRecordSchema.parse(sourceInput);
        if (source.unit.scope.tenantId !== scope.tenantId || source.unit.scope.projectId !== scope.projectId
            || source.sourceVersion !== intent.sourceVersion || source.fingerprint !== intent.sourceFingerprint || source.contextFingerprint !== intent.contextFingerprint
            || await translationUnitId(scope, source.unit.resource) !== intent.unitId || await messageSourceFingerprint(source.unit) !== source.fingerprint
            || await translationContextFingerprint(source.context) !== source.contextFingerprint) return fail('source-history-missing');
        if (validatePlainRevision(source.unit, source.unit.text)) return fail('invalid-result');
        if (this.provider.id !== intent.providerId) return fail('provider-unavailable');
        let allowed = false;
        try { allowed = await this.options.authorize(job, source) === true; } catch { /* safe denial; no callback details persisted */ }
        if (!allowed) return fail('denied');
        const accounting = this.options.accounting;
        if (accounting) {
            try { if (!await accounting.reserve(job)) return fail('denied'); }
            catch { return fail('denied'); }
        }
        // Persist before calling a provider; a crash after this point has uncertain external billing/delivery.
        try {
            if (!await (accounting ? accounting.dispatch(job) : this.store.markJobDispatched(scope, jobId, job.leaseVersion))) {
                if (accounting) await accounting.release(job);
                return this.store.readJob(scope, jobId);
            }
        } catch { return fail('denied'); }
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        let response: unknown;
        try {
            const idempotencyKey = await translationUnitId(scope, { kind: 'system', componentKind: 'TranslationJob', messageId: jobId });
            response = await Promise.race([
                this.provider.generate({ source, targetLocale: intent.locale, promptVersion: intent.promptVersion, idempotencyKey }, { signal: controller.signal }),
                new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Error('translation_timeout')); }, this.timeoutMs); }),
            ]);
        } catch (error) {
            if (accounting) { try { await accounting.settle(job); } catch { /* persisted dispatch remains conservatively held */ } }
            return fail(timedOut ? 'provider-timeout' : 'provider-error', !accounting && (timedOut || !(error instanceof TranslationProviderError) || error.retryable));
        } finally { if (timer !== undefined) clearTimeout(timer); }
        const parsed = translationProviderResultSchema.safeParse(response);
        if (accounting) {
            try { if (!await accounting.settle(job, parsed.success ? parsed.data.usage : undefined)) return fail('denied'); }
            catch { return fail('denied'); }
        }
        if (!parsed.success) return fail('invalid-result');
        const { jobId: ignoredJob, providerId: ignoredProvider, promptVersion: ignoredPrompt, maxAttempts: ignoredAttempts, ...revision } = intent;
        const lifecycle = new TranslationLifecycle(this.store);
        // Retry a local CAS collision with the same response, never a second provider call.
        for (let attempt = 0; attempt < 2; attempt++) {
            const result = await lifecycle.writeJobResult(scope, { ...revision, text: parsed.data.text }, { jobId, leaseVersion: job.leaseVersion });
            if (result.status === 'committed') return this.store.readJob(scope, jobId);
            if (result.status === 'rejected' && result.reason === 'concurrent-write') continue;
            if (result.status === 'rejected' && result.reason === 'job-fenced') return this.store.readJob(scope, jobId);
            return fail(result.status === 'rejected' && ['head', 'manual-protected', 'revision-id-conflict'].includes(result.reason) ? 'head-changed'
                : result.status === 'rejected' && ['source-version', 'source-fingerprint', 'context-fingerprint'].includes(result.reason) ? 'input-changed' : 'invalid-result');
        }
        return fail('write-conflict');
    }
}
