import { z } from 'zod';
import { localizationScopeSchema, type LocalizationScope } from '../contracts.js';
import { allowanceSchema, attemptSchema, attemptKeySchema, type AttemptKey, type TranslationAllowance,
    type TranslationAttempt, type TranslationAccountingPersistence } from '../accounting.js';
import { PostgrestTranslationJobPersistence, type TranslationRpcTransport } from './postgrest.js';

export type TranslationAccountingRpcOperation = 'capabilities' | 'create-allowance' | 'read-allowance' | 'reserve' | 'read-attempt' | 'dispatch' | 'settle' | 'release';
export interface TranslationAccountingRpcTransport {
    call(operation: TranslationAccountingRpcOperation, scope: LocalizationScope, input: Record<string, unknown>): Promise<unknown>;
}
const reserveSchema = attemptSchema.omit({ state: true, chargedUnits: true });
function response<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
    const checked = schema.safeParse(value);
    if (!checked.success) throw Error('translation_accounting_response_invalid');
    return checked.data;
}
function sameScope(left: LocalizationScope, right: LocalizationScope): void {
    if (left.tenantId !== right.tenantId || left.projectId !== right.projectId) throw Error('translation_accounting_scope_mismatch');
}
/** Accounting is an explicit additive capability; the legacy v1 adapter remains independently usable. */
export class PostgrestTranslationAccountingPersistence extends PostgrestTranslationJobPersistence implements TranslationAccountingPersistence {
    private ready = false;
    constructor(jobs: TranslationRpcTransport, private readonly accounting: TranslationAccountingRpcTransport) { super(jobs); }
    override async initialize(): Promise<void> {
        this.ready = false;
        try { await super.initialize(); }
        catch { throw Error('translation_accounting_rpc_failed'); }
        response(z.object({ protocol: z.literal('frontbase-translation-accounting'), version: z.literal(1), jobProtocolVersion: z.literal(1) }).strict(),
            await this.call('capabilities', { tenantId: '__setup__', projectId: '__setup__' }, {}, true));
        this.ready = true;
    }
    private async call(operation: TranslationAccountingRpcOperation, scope: LocalizationScope, input: Record<string, unknown>, setup = false): Promise<unknown> {
        if (!this.ready && !setup) throw Error('translation_accounting_uninitialized');
        const owner = localizationScopeSchema.parse(scope);
        try { return await this.accounting.call(operation, owner, input); }
        catch { throw Error('translation_accounting_rpc_failed'); }
    }
    async createAllowance(input: TranslationAllowance): Promise<'created' | 'already-exists' | 'conflict'> {
        const value = allowanceSchema.parse(input);
        return response(z.enum(['created', 'already-exists', 'conflict']), await this.call('create-allowance', value.scope, { allowance: value }));
    }
    async readAllowance(scopeInput: LocalizationScope, idInput: string): Promise<TranslationAllowance | null> {
        const scope = localizationScopeSchema.parse(scopeInput), allowanceId = allowanceSchema.shape.allowanceId.parse(idInput);
        const value = response(allowanceSchema.nullable(), await this.call('read-allowance', scope, { allowanceId }));
        if (value) { sameScope(value.scope, scope); if (value.allowanceId !== allowanceId) throw Error('translation_accounting_key_mismatch'); }
        return value;
    }
    async readAttempt(input: AttemptKey): Promise<TranslationAttempt | null> {
        const key = attemptKeySchema.parse(input), { scope, ...identity } = key;
        const value = response(attemptSchema.nullable(), await this.call('read-attempt', scope, identity));
        if (value) {
            sameScope(value.scope, scope);
            if (value.jobId !== key.jobId || value.leaseVersion !== key.leaseVersion) throw Error('translation_accounting_key_mismatch');
            if ((value.state === 'settled' && (value.chargedUnits === null || value.chargedUnits > value.reservedUnits))
                || (['reserved', 'dispatched', 'uncertain'].includes(value.state) && value.chargedUnits !== null)
                || (value.state === 'released' && value.chargedUnits !== 0)) throw Error('translation_accounting_state_mismatch');
        }
        return value;
    }
    async reserveAttempt(input: AttemptKey & { allowanceId: string; policyHash: string; reservedUnits: number }): Promise<boolean> {
        const { scope, ...reservation } = reserveSchema.parse(input);
        return response(z.boolean(), await this.call('reserve', scope, reservation));
    }
    private async transition(operation: 'dispatch' | 'release' | 'settle', input: AttemptKey, extra: Record<string, unknown> = {}): Promise<boolean> {
        const { scope, ...key } = attemptKeySchema.parse(input);
        return response(z.boolean(), await this.call(operation, scope, { ...key, ...extra }));
    }
    dispatchAttempt(key: AttemptKey): Promise<boolean> { return this.transition('dispatch', key); }
    releaseAttempt(key: AttemptKey): Promise<boolean> { return this.transition('release', key); }
    settleAttempt(key: AttemptKey, chargedUnits: number | null): Promise<boolean> {
        return this.transition('settle', key, { chargedUnits: attemptSchema.shape.chargedUnits.parse(chargedUnits) });
    }
}
