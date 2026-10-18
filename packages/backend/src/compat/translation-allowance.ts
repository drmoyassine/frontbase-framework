/** Server-only request allowance. No monetary estimate, public handler or automatic reallocation. */
import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';
import { TranslationJobRunner, translationAttemptAccounting, translationJobIntentSchema, translationGenerationConfigurationSchema,
    localizationScopeSchema, type TranslationJob, type SourceRecord, type TranslationAIProvider } from '@frontbase/edge-core/localization';
import { configuredTranslationAccountingStorage, configuredTranslationStorageIdentity, type TranslationStorageHost } from './translation-storage.js';
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
        return saved?.policyHash === record.policyHash && JSON.stringify(await currentPin(host, runner, tenant)) === JSON.stringify(record.plan.pin);
    } catch { return false; }
}
/** Called only after an administrator reviews exact immutable job intents. Does not enqueue or invoke AI.
 * Host checkpoint precedes remote ledger creation. A crash/retarget retains it and blocks fresh allocation.
 * Repeating the identical review repairs the same remote allowance; no overwrite/reset/close API exists yet.
 */
export async function prepareTranslationAllowance(host: Host, runner: DbRunner, tenant: string, input: Review, now: string) {
    try {
        const review = translationAllowanceReviewSchema.parse(input), pin = await currentPin(host, runner, tenant);
        for (const job of review.jobs) {
            if (job.providerId !== pin.generation.accountId || job.promptVersion !== pin.generation.promptVersion
                || !pin.generation.targetLocales.includes(job.locale) || job.maxAttempts !== 1) throw Error();
        }
        const plan = planSchema.parse({ version: 1, review, pin }), record = { plan, policyHash: await policyHash(plan) };
        await runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [tenant, KEY, JSON.stringify(record), now]);
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
