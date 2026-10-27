import { z } from 'zod';
import { localizationScopeSchema, type LocalizationScope } from './contracts.js';
import type { TranslationJob } from './jobs.js';

const units = z.number().int().min(0).max(1_000_000_000_000);
const id = z.string().min(1).max(160).refine(v => !/[\u0000-\u001f]/.test(v));
export const allowanceSchema = z.object({ scope: localizationScopeSchema, allowanceId: id,
    policyHash: z.string().regex(/^[a-f0-9]{64}$/), limitUnits: units,
    maxRequests: z.number().int().min(1).max(1_000_000), maxConcurrent: z.number().int().min(1).max(128),
}).strict();
export const attemptKeySchema = z.object({ scope: localizationScopeSchema, jobId: id, leaseVersion: z.number().int().positive().safe() }).strict();
export const attemptSchema = attemptKeySchema.extend({ allowanceId: id, policyHash: allowanceSchema.shape.policyHash,
    reservedUnits: units.refine(n => n > 0), state: z.enum(['reserved', 'dispatched', 'settled', 'uncertain', 'released']), chargedUnits: units.nullable(),
}).strict();
export type TranslationAllowance = z.infer<typeof allowanceSchema>;
export type AttemptKey = z.infer<typeof attemptKeySchema>;
export type TranslationAttempt = z.infer<typeof attemptSchema>;
export interface TranslationAccountingPersistence {
    createAllowance(input: TranslationAllowance): Promise<'created' | 'already-exists' | 'conflict'>;
    readAllowance(scope: LocalizationScope, allowanceId: string): Promise<TranslationAllowance | null>;
    reserveAttempt(input: AttemptKey & { allowanceId: string; policyHash: string; reservedUnits: number }): Promise<boolean>;
    /** Atomically marks BOTH the attempt and existing job dispatched after checking its live lease. */
    dispatchAttempt(key: AttemptKey): Promise<boolean>;
    /** No release after dispatch: unknown usage remains fully reserved and blocks retry. */
    settleAttempt(key: AttemptKey, chargedUnits: number | null): Promise<boolean>;
    releaseAttempt(key: AttemptKey): Promise<boolean>;
    readAttempt(key: AttemptKey): Promise<TranslationAttempt | null>;
}
/** Generic runner seam. Existing lifecycle remains authoritative for source/head/lease fencing. */
export interface TranslationAttemptAccounting {
    reserve(job: TranslationJob): Promise<boolean>;
    dispatch(job: TranslationJob): Promise<boolean>;
    settle(job: TranslationJob, usage?: { inputTokens: number; outputTokens: number }): Promise<boolean>;
    release(job: TranslationJob): Promise<boolean>;
}
/** Hosts pin conservative reservation units/policy before enqueue. No implicit price/token estimate. */
export function translationAttemptAccounting(store: TranslationAccountingPersistence, policy: {
    scope: LocalizationScope; allowanceId: string; policyHash: string; reservedUnits: number;
    charge(usage: { inputTokens: number; outputTokens: number }): number | null;
}): TranslationAttemptAccounting {
    const bound = attemptSchema.omit({ jobId: true, leaseVersion: true, state: true, chargedUnits: true }).parse(policy && {
        scope: policy.scope, allowanceId: policy.allowanceId, policyHash: policy.policyHash, reservedUnits: policy.reservedUnits });
    const key = (job: TranslationJob): AttemptKey => {
        if (job.scope.tenantId !== bound.scope.tenantId || job.scope.projectId !== bound.scope.projectId) throw Error('translation_accounting_scope');
        return attemptKeySchema.parse({ scope: bound.scope, jobId: job.intent.jobId, leaseVersion: job.leaseVersion });
    };
    return {
        reserve: job => store.reserveAttempt({ ...bound, ...key(job) }), dispatch: job => store.dispatchAttempt(key(job)),
        release: job => store.releaseAttempt(key(job)), settle: async (job, usage) => {
            let amount: number | null = null;
            if (usage) { try { const value = policy.charge(usage); if (value !== null && units.safeParse(value).success && value <= bound.reservedUnits) amount = value; } catch { /* unknown charge retains the reservation */ } }
            return store.settleAttempt(key(job), amount);
        },
    };
}
