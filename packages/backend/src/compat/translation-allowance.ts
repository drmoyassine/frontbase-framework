/** Server-only request allowance. No monetary estimate, public handler or automatic reallocation. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { TranslationJobRunner, translationAttemptAccounting, translationJobIntentSchema, translationGenerationConfigurationSchema,
    localizationScopeSchema, type TranslationJob, type SourceRecord, type TranslationAIProvider } from '@frontbase/edge-core/localization';
import { configuredTranslationAccountingStorage, configuredTranslationStorageIdentity, resolveTranslationAccountingStorage, type TranslationStorageHost } from './translation-storage.js';
import { TranslationGenerationStore, resolveGenerationInvoker, translationAIProvider, translationMessages, type GenerationHost } from './translation-generation.js';

const KEY = 'translation_allowance:v1';
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/);
export const translationAllowanceReviewSchema = z.object({
    allowanceId: id, unit: z.literal('provider-request'), maxRequests: z.number().int().min(1).max(1000),
    maxConcurrent: z.number().int().min(1).max(8), maxMessageBytes: z.number().int().min(1).max(65536),
    jobs: z.array(translationJobIntentSchema).min(1).max(100),
}).strict().superRefine((value, ctx) => {
    if (new Set(value.jobs.map(job => job.jobId)).size !== value.jobs.length)
        ctx.addIssue({ code: 'custom', message: 'Jobs must be unique' });
});
const identitySchema = z.object({ scope: localizationScopeSchema, configurationRevision: z.number().int().positive().safe(),
    destination: z.object({ datasourceId: z.string(), accountId: z.string().nullable(), endpoint: z.enum(['supabase', 'postgrest']), url: z.string().url() }).strict(),
}).strict();
const pinSchema = z.object({ storage: identitySchema, generationRevision: z.number().int().positive().safe(), generation: translationGenerationConfigurationSchema }).strict();
const planSchema = z.object({ version: z.literal(1), review: translationAllowanceReviewSchema, pin: pinSchema }).strict();
const recordSchema = z.object({ plan: planSchema, policyHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type Host = TranslationStorageHost & GenerationHost;
type Review = z.input<typeof translationAllowanceReviewSchema>;
type Record = z.infer<typeof recordSchema>;
const hashSchema = recordSchema.shape.policyHash;
const totalsSchema = z.object({ consumedRequests: z.number().int().min(0).max(1000), retainedUnknownRequests: z.number().int().min(0).max(1000),
    releasedRequests: z.number().int().min(0).max(1000) }).strict();
const lifecycleSchema = z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('closing'), policyHash: hashSchema, stage: z.enum(['cancel', 'reconcile', 'review']),
        cursor: z.number().int().min(0).max(100), totals: totalsSchema }).strict(),
    z.object({ phase: z.literal('closed'), policyHash: hashSchema, totals: totalsSchema, closedAt: z.string().datetime() }).strict(),
]);
const lifecycleKey = (hash: string) => 'translation_allowance_lifecycle:v1:' + hashSchema.parse(hash);
const archiveKey = (allowanceId: string) => 'translation_allowance_archive:v1:' + id.parse(allowanceId);
async function readValue(runner: DbRunner, tenant: string, key: string): Promise<string | null> {
    const rows = await runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, key]);
    return rows.length ? String(rows[0]!.value) : null;
}
async function lifecycle(runner: DbRunner, tenant: string, hash: string) {
    const raw = await readValue(runner, tenant, lifecycleKey(hash));
    if (raw === null) return null; // Existing immutable host checkpoints start active.
    const value = lifecycleSchema.parse(JSON.parse(raw));
    if (value.policyHash !== hash) throw Error();
    return value;
}
// Schema parsing fixes field order; no raw credentials or source text is included in the digest.
async function policyHash(plan: z.infer<typeof planSchema>) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(planSchema.parse(plan))));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function currentPin(host: Host, runner: DbRunner, tenant: string) {
    const generation = await new TranslationGenerationStore(runner, tenant).get();
    if (!generation.configuration) throw Error('translation_allowance_unavailable');
    await resolveGenerationInvoker(host, tenant, generation.configuration.accountId); // ownership/status/current key; no AI call
    return pinSchema.parse({ storage: await configuredTranslationStorageIdentity(host, runner, tenant),
        generationRevision: generation.revision, generation: generation.configuration });
}
async function readRecord(runner: DbRunner, tenant: string): Promise<Record | null> {
    const rows = await runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [tenant, KEY]);
    if (!rows.length) return null;
    const value = recordSchema.parse(JSON.parse(String(rows[0]!.value)));
    if (value.plan.pin.storage.scope.tenantId !== tenant || value.policyHash !== await policyHash(value.plan)) throw Error();
    return value;
}
async function unchanged(host: Host, runner: DbRunner, tenant: string, record: Record): Promise<boolean> {
    try {
        const saved = await readRecord(runner, tenant);
        return saved?.policyHash === record.policyHash && await lifecycle(runner, tenant, record.policyHash) === null
            && JSON.stringify(await currentPin(host, runner, tenant)) === JSON.stringify(record.plan.pin);
    } catch { return false; }
}
/** Called only after an administrator reviews exact immutable job intents. Does not enqueue or invoke AI.
 * Host checkpoint precedes remote ledger creation. A crash/retarget retains it and blocks fresh allocation.
 * Repeating the identical active review repairs the same remote allowance. Replacement requires a closed predecessor.
 */
export async function prepareTranslationAllowance(host: Host, runner: DbRunner, tenant: string, input: Review, now: string) {
    try {
        const review = translationAllowanceReviewSchema.parse(input), pin = await currentPin(host, runner, tenant);
        for (const job of review.jobs) {
            if (job.providerId !== pin.generation.accountId || job.promptVersion !== pin.generation.promptVersion
                || !pin.generation.targetLocales.includes(job.locale) || job.maxAttempts !== 1) throw Error();
        }
        const plan = planSchema.parse({ version: 1, review, pin }), record = { plan, policyHash: await policyHash(plan) };
        if (await readValue(runner, tenant, archiveKey(review.allowanceId)) !== null) throw Error();
        await runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [tenant, KEY, JSON.stringify(record), now]);
        const prior = await readRecord(runner, tenant);
        if (prior && prior.policyHash !== record.policyHash) {
            if ((await lifecycle(runner, tenant, prior.policyHash))?.phase !== 'closed'
                || prior.plan.review.allowanceId === review.allowanceId) throw Error();
            const priorRaw = await readValue(runner, tenant, KEY);
            if (priorRaw === null || recordSchema.parse(JSON.parse(priorRaw)).policyHash !== prior.policyHash) throw Error();
            // Archive before CAS. Losing contenders cannot erase history or create an extra remote allowance.
            const archive = archiveKey(prior.plan.review.allowanceId);
            await runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
                [tenant, archive, JSON.stringify(prior), now]);
            if (await readValue(runner, tenant, archive) !== JSON.stringify(prior)) throw Error();
            await runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',
                [JSON.stringify(record), now, tenant, KEY, priorRaw]);
        }
        const saved = await readRecord(runner, tenant);
        if (!saved || saved.policyHash !== record.policyHash || !await unchanged(host, runner, tenant, saved)) throw Error();
        const session = await configuredTranslationAccountingStorage(host, runner, tenant);
        if (JSON.stringify(session.scope) !== JSON.stringify(pin.storage.scope) || session.configurationRevision !== pin.storage.configurationRevision) throw Error();
        const result = await session.persistence.createAllowance({ scope: session.scope, allowanceId: review.allowanceId, policyHash: record.policyHash,
            limitUnits: review.maxRequests, maxRequests: review.maxRequests, maxConcurrent: review.maxConcurrent });
        if (result === 'conflict' || !await unchanged(host, runner, tenant, saved)) throw Error();
        return { allowanceId: review.allowanceId, policyHash: record.policyHash, unit: review.unit };
    } catch { throw Error('translation_allowance_unavailable'); }
}
/** Freeze first; reconcile only through the original still-owned connection. No current AI account required.
 * Counting unknown dispatches as consumed is an explicit conservative acknowledgment, never a refund or proof of completion.
 */
export async function closeTranslationAllowance(host: Host, runner: DbRunner, tenant: string, input: {
    policyHash: string; unknownDisposition?: 'hold' | 'count-as-consumed'; maxJobs?: number;
}, now: string) {
    try {
        const choice = z.object({ policyHash: hashSchema, unknownDisposition: z.enum(['hold', 'count-as-consumed']).default('hold'),
            maxJobs: z.number().int().min(1).max(4).default(4) }).strict().parse(input);
        z.string().datetime().parse(now);
        const record = await readRecord(runner, tenant);
        if (!record || record.policyHash !== choice.policyHash) throw Error();
        const key = lifecycleKey(record.policyHash), closing = { phase: 'closing' as const, policyHash: record.policyHash,
            stage: 'cancel' as const, cursor: 0, totals: { consumedRequests: 0, retainedUnknownRequests: 0, releasedRequests: 0 } };
        await runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [tenant, key, JSON.stringify(closing), now]);
        const priorRaw = await readValue(runner, tenant, key);
        const prior = await lifecycle(runner, tenant, record.policyHash);
        if (prior?.phase === 'closed') return prior;
        if (prior?.phase !== 'closing' || priorRaw === null) throw Error();
        const { review, pin } = record.plan, destination = pin.storage.destination;
        const session = await resolveTranslationAccountingStorage(host, tenant,
            { version: 1, datasourceId: destination.datasourceId, endpoint: destination.endpoint, namespace: 'translations' }, pin.storage.scope.projectId);
        if (JSON.stringify(session.destination) !== JSON.stringify(destination) || JSON.stringify(session.scope) !== JSON.stringify(pin.storage.scope)) throw Error();
        const allowance = await session.persistence.readAllowance(session.scope, review.allowanceId);
        if (!allowance || allowance.policyHash !== record.policyHash || allowance.limitUnits !== review.maxRequests
            || allowance.maxRequests !== review.maxRequests || allowance.maxConcurrent !== review.maxConcurrent) throw Error();
        const matching = (job: TranslationJob) => job.scope.tenantId === tenant && job.scope.projectId === pin.storage.scope.projectId
            && job.attempt <= 1 && job.leaseVersion <= 1 && job.attempt === job.leaseVersion
            && review.jobs.some(expected => JSON.stringify(expected) === JSON.stringify(translationJobIntentSchema.parse(job.intent)));
        if (prior.cursor > review.jobs.length || prior.totals.consumedRequests + prior.totals.retainedUnknownRequests > review.maxRequests
            || (prior.stage === 'review' && prior.cursor !== review.jobs.length)
            || (prior.stage === 'cancel' && Object.values(prior.totals).some(value => value !== 0))) throw Error();
        const progress = structuredClone(prior);
        let processed = 0;
        // All jobs are fenced before release. At most four job steps per call, across both passes.
        while (progress.stage === 'cancel' && progress.cursor < review.jobs.length && processed < choice.maxJobs) {
            const intent = review.jobs[progress.cursor]!;
            const job = await session.persistence.readJob(session.scope, intent.jobId);
            if (job && !matching(job)) throw Error();
            await session.persistence.cancelJob(session.scope, intent.jobId);
            const fenced = await session.persistence.readJob(session.scope, intent.jobId);
            if (fenced && (!matching(fenced) || ['queued', 'leased'].includes(fenced.status))) throw Error();
            progress.cursor++; processed++;
        }
        if (progress.stage === 'cancel' && progress.cursor === review.jobs.length) { progress.stage = 'reconcile'; progress.cursor = 0; }
        const totals = progress.totals;
        while (progress.stage === 'reconcile' && progress.cursor < review.jobs.length && processed < choice.maxJobs) {
            const intent = review.jobs[progress.cursor]!;
            const job = await session.persistence.readJob(session.scope, intent.jobId);
            if (job && !matching(job)) throw Error();
            if (job && ['queued', 'leased'].includes(job.status)) {
                // A delayed enqueue arrived after the cancellation pass. Re-fence; never bypass it.
                progress.stage = 'cancel'; progress.cursor = 0;
                totals.consumedRequests = 0; totals.retainedUnknownRequests = 0; totals.releasedRequests = 0;
                break;
            }
            const attemptKey = { scope: session.scope, jobId: intent.jobId, leaseVersion: 1 };
            let attempt = await session.persistence.readAttempt(attemptKey);
            if (!attempt) {
                if (job && (job.dispatched || job.uncertainAttempts > 0 || job.status === 'completed')) throw Error();
            } else {
                if (!job || attempt.allowanceId !== review.allowanceId || attempt.policyHash !== record.policyHash || attempt.reservedUnits !== 1) throw Error();
                if (attempt.state === 'reserved') {
                    if (job.dispatched || job.uncertainAttempts > 0 || job.status === 'completed') throw Error();
                    await session.persistence.releaseAttempt(attemptKey);
                    attempt = await session.persistence.readAttempt(attemptKey);
                    if (!attempt || attempt.allowanceId !== review.allowanceId || attempt.policyHash !== record.policyHash || attempt.reservedUnits !== 1) throw Error();
                }
                if (attempt.state === 'released') {
                    if (job.dispatched || job.uncertainAttempts > 0 || job.status === 'completed') throw Error();
                    totals.releasedRequests++;
                } else if (attempt.state === 'settled' && attempt.chargedUnits === 1) totals.consumedRequests++;
                else if (['dispatched', 'uncertain'].includes(attempt.state)) totals.retainedUnknownRequests++;
                else throw Error();
            }
            progress.cursor++; processed++;
        }
        if (progress.stage === 'reconcile' && progress.cursor === review.jobs.length) progress.stage = 'review';
        if (totals.consumedRequests + totals.retainedUnknownRequests > review.maxRequests) throw Error();
        let next: z.infer<typeof lifecycleSchema> = progress;
        if (progress.stage === 'review' && (!totals.retainedUnknownRequests || choice.unknownDisposition === 'count-as-consumed')) {
            totals.consumedRequests += totals.retainedUnknownRequests;
            next = lifecycleSchema.parse({ phase: 'closed', policyHash: record.policyHash, totals, closedAt: now });
        }
        await runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',
            [JSON.stringify(next), now, tenant, key, priorRaw]);
        const saved = await lifecycle(runner, tenant, record.policyHash);
        if (!saved) throw Error();
        return saved;
    } catch { throw Error('translation_allowance_reconciliation_unavailable'); }
}
/** Mandatory accounting composition for future reviewed-batch handlers. No compatibility/unaccounted fallback. */
export async function configuredTranslationAllowanceRunner(host: Host, runner: DbRunner, tenant: string) {
    try {
        const record = await readRecord(runner, tenant);
        if (!record || !await unchanged(host, runner, tenant, record)) throw Error();
        const { review, pin } = record.plan, session = await configuredTranslationAccountingStorage(host, runner, tenant);
        if (JSON.stringify(session.scope) !== JSON.stringify(pin.storage.scope) || session.configurationRevision !== pin.storage.configurationRevision) throw Error();
        const allowance = await session.persistence.readAllowance(session.scope, review.allowanceId);
        if (!allowance || allowance.policyHash !== record.policyHash || allowance.limitUnits !== review.maxRequests
            || allowance.maxRequests !== review.maxRequests || allowance.maxConcurrent !== review.maxConcurrent) throw Error();
        const guard = () => unchanged(host, runner, tenant, record);
        const accounting = translationAttemptAccounting(session.persistence, { scope: session.scope, allowanceId: review.allowanceId,
            policyHash: record.policyHash, reservedUnits: 1, charge: () => 1 });
        const permitted = (job: TranslationJob, source: SourceRecord) => {
            const expected = review.jobs.find(item => item.jobId === job.intent.jobId);
            return job.scope.tenantId === tenant && job.scope.projectId === pin.storage.scope.projectId && expected !== undefined
                && JSON.stringify(translationJobIntentSchema.parse(job.intent)) === JSON.stringify(expected)
                && new TextEncoder().encode(JSON.stringify(translationMessages(source, job.intent.locale))).byteLength <= review.maxMessageBytes;
        };
        const bound = translationAIProvider(host, tenant, pin.generation);
        const provider: TranslationAIProvider = { id: bound.id, async generate(input, options) {
            if (!await guard() || new TextEncoder().encode(JSON.stringify(translationMessages(input.source, input.targetLocale))).byteLength > review.maxMessageBytes) throw Error('translation_allowance_unavailable');
            return bound.generate(input, options);
        } };
        const jobs = new TranslationJobRunner(session.persistence, provider, { authorize: async (job, source) => permitted(job, source) && await guard(), accounting: {
                reserve: async job => await guard() && accounting.reserve(job), dispatch: async job => await guard() && accounting.dispatch(job),
                // Settlement/release always go to the original pinned ledger, even after a retarget.
                settle: (job, usage) => accounting.settle(job, usage), release: job => accounting.release(job),
        } });
        return { scope: { ...session.scope }, allowanceId: review.allowanceId, policyHash: record.policyHash,
            runOnce: (jobId: string) => jobs.runOnce(session.scope, jobId) };
    } catch { throw Error('translation_allowance_unavailable'); }
}
