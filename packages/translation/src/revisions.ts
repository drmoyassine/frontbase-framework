import { z } from 'zod';
import { localizationScopeSchema, messageUnitSchema, translationRevisionSchema, localeSchema, translationContextSchema, EMPTY_TRANSLATION_CONTEXT_FINGERPRINT,
    type LocalizationScope, type MessageUnit, type TranslationContext } from './contracts.js';
import { translationUnitId, messageSourceFingerprint, translationContextFingerprint } from './identity.js';

const counter = z.number().int().nonnegative().safe();
const hash = translationRevisionSchema.shape.unitId;
const contextFingerprint = hash.default(EMPTY_TRANSLATION_CONTEXT_FINGERPRINT);
export const sourceRecordSchema = z.object({ unit: messageUnitSchema, sourceVersion: counter.min(1), fingerprint: hash,
    context: translationContextSchema.default({ version: 1 }), contextFingerprint }).strict();
export const storedRevisionSchema = translationRevisionSchema.extend({ sourceVersion: counter.min(1), contextFingerprint });
export const revisionIntentSchema = translationRevisionSchema.omit({ scope: true, provenance: true }).extend({ sourceVersion: counter.min(1), contextFingerprint });
export const jobCommitFenceSchema = z.object({ jobId: translationRevisionSchema.shape.revisionId, leaseVersion: counter.min(1) }).strict();
export type JobCommitFence = z.infer<typeof jobCommitFenceSchema>;
export const translationSnapshotSchema = z.object({ version: counter, source: sourceRecordSchema.nullable(), head: storedRevisionSchema.nullable() }).strict();
export const persistenceChangeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('source'), source: sourceRecordSchema }).strict(),
    z.object({ kind: z.literal('revision'), revision: storedRevisionSchema, jobFence: jobCommitFenceSchema.optional() }).strict(),
]);
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type StoredRevision = z.infer<typeof storedRevisionSchema>;
export type RevisionIntent = z.input<typeof revisionIntentSchema>;
export type TranslationSnapshot = z.infer<typeof translationSnapshotSchema>;
export type PersistenceChange = z.infer<typeof persistenceChangeSchema>;
export type CasResult = 'committed' | 'conflict' | 'revision-id-conflict' | 'job-fenced';

/** Trusted low-level adapter port, never a visitor API. CAS must atomically append history and advance the head/version. */
export interface TranslationPersistence {
    read(scope: LocalizationScope, unitId: string, locale?: string): Promise<TranslationSnapshot>;
    readRevision(scope: LocalizationScope, unitId: string, locale: string, revisionId: string): Promise<StoredRevision | null>;
    /** Bounded newest-first history for one unit/locale in storage order (revisionId is not monotonic). */
    listRevisions(scope: LocalizationScope, unitId: string, locale: string, limit: number): Promise<StoredRevision[]>;
    /** Translation-memory lookup: newest approved head (storage order) in scope for the locale whose
     *  recorded sourceFingerprint equals the query, from a different unit. Exact by construction —
     *  the match is the head revision's own recorded fingerprint, never current unit state. */
    findApprovedHead(scope: LocalizationScope, locale: string, sourceFingerprint: string, excludeUnitId: string): Promise<{ unitId: string; revision: StoredRevision } | null>;
    readSourceVersion(scope: LocalizationScope, unitId: string, version: number): Promise<SourceRecord | null>;
    compareAndSwap(scope: LocalizationScope, unitId: string, expectedVersion: number, change: PersistenceChange): Promise<CasResult>;
}
export type RevisionRejection = 'missing-source' | 'source-version' | 'source-fingerprint' | 'context-fingerprint' | 'head' | 'manual-protected' | 'source-locale' | 'invalid-tokens' | 'unsupported-format' | 'concurrent-write' | 'revision-id-conflict' | 'job-fenced';
export type RevisionResult = { status: 'committed' | 'already-committed'; revisionId: string } | { status: 'rejected'; reason: RevisionRejection };
export type SourceResult = { status: 'created' | 'updated' | 'unchanged'; unitId: string; sourceVersion: number; sourceFingerprint: string; contextFingerprint: string }
    | { status: 'conflict'; reason: 'source-version' | 'concurrent-write' };

function sameScope(left: LocalizationScope, right: LocalizationScope): boolean {
    return left.tenantId === right.tenantId && left.projectId === right.projectId;
}
function checkedSnapshot(input: unknown, scope: LocalizationScope, unitId: string, locale?: string): TranslationSnapshot {
    const snapshot = translationSnapshotSchema.parse(input);
    if ((!snapshot.source && (snapshot.version !== 0 || snapshot.head)) || (snapshot.source && snapshot.version < 1)
        || (snapshot.source && !sameScope(snapshot.source.unit.scope, scope))
        || (snapshot.head && (!sameScope(snapshot.head.scope, scope) || snapshot.head.unitId !== unitId || snapshot.head.locale !== locale))) {
        throw Error('translation_store_invariant');
    }
    return snapshot;
}
function tokenName(token: string): string {
    const width = token.startsWith('{{') || token.startsWith('{$') ? 2 : 1;
    return token.slice(width, -width).trim();
}
function tokens(text: string): string[] | null {
    const found: string[] = [];
    // Single-brace `{name}` tokens are the chrome-pattern grammar (localization patterns);
    // their parity is enforced exactly like double-brace bindings so a translation can never
    // silently drop a placeholder.
    const remaining = text.replace(/\{\{[^{}]*\}\}|\{\$[^{}]*\}|\{[A-Za-z_][A-Za-z0-9_]*\}/gu, token => {
        const name = tokenName(token);
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) found.push('!invalid');
        else found.push(token.slice(0, token.startsWith('{{') || token.startsWith('{$') ? 2 : 1) + name);
        return '';
    });
    return /\{\{|\}\}|\{\$|\{[A-Za-z_]/.test(remaining) || found.includes('!invalid') ? null : found.sort();
}
/** Initial validator intentionally does not claim ICU/MF2 support while runtime selection is open. */
export function validatePlainRevision(unit: MessageUnit, text: string): 'invalid-tokens' | 'unsupported-format' | null {
    if (unit.format !== 'plain') return 'unsupported-format';
    const source = tokens(unit.text), target = tokens(text);
    if (!source || !target || JSON.stringify(source) !== JSON.stringify(target)) return 'invalid-tokens';
    if (unit.placeholders.some(name => !source.some(token => token.slice(token.startsWith('{{') || token.startsWith('{$') ? 2 : 1) === name))) return 'invalid-tokens';
    return null;
}

/** Host authenticates/authorizes each method and supplies trusted scope. No mutable global tenant/locale or AI calls. */
export class TranslationLifecycle {
    constructor(private readonly persistence: TranslationPersistence) {}

    async syncSource(scopeInput: LocalizationScope, unitInput: MessageUnit, expectedSourceVersion: number | null, contextInput?: TranslationContext): Promise<SourceResult> {
        const scope = localizationScopeSchema.parse(scopeInput), unit = messageUnitSchema.parse(unitInput);
        counter.min(1).nullable().parse(expectedSourceVersion);
        if (!sameScope(scope, unit.scope)) throw Error('translation_scope_mismatch');
        const unitId = await translationUnitId(scope, unit.resource), fingerprint = await messageSourceFingerprint(unit);
        const snapshot = checkedSnapshot(await this.persistence.read(scope, unitId), scope, unitId);
        const context = translationContextSchema.parse(contextInput ?? snapshot.source?.context ?? { version: 1 });
        const contextHash = await translationContextFingerprint(context);
        if ((snapshot.source?.sourceVersion ?? null) !== expectedSourceVersion) return { status: 'conflict', reason: 'source-version' };
        const version = snapshot.source?.sourceVersion ?? 0;
        if (snapshot.source?.fingerprint === fingerprint && snapshot.source.contextFingerprint === contextHash) return { status: 'unchanged', unitId, sourceVersion: version, sourceFingerprint: fingerprint, contextFingerprint: contextHash };
        const sourceVersion = counter.min(1).parse(version + 1);
        const result = await this.persistence.compareAndSwap(scope, unitId, snapshot.version, { kind: 'source', source: { unit, sourceVersion, fingerprint, context, contextFingerprint: contextHash } });
        return result === 'committed' ? { status: version ? 'updated' : 'created', unitId, sourceVersion, sourceFingerprint: fingerprint, contextFingerprint: contextHash }
            : { status: 'conflict', reason: 'concurrent-write' };
    }

    writeManual(scope: LocalizationScope, intent: RevisionIntent): Promise<RevisionResult> { return this.write(scope, intent, 'manual'); }
    writeGenerated(scope: LocalizationScope, intent: RevisionIntent): Promise<RevisionResult> { return this.write(scope, intent, 'ai'); }
    writeImported(scope: LocalizationScope, intent: RevisionIntent): Promise<RevisionResult> { return this.write(scope, intent, 'import'); }
    writeJobResult(scope: LocalizationScope, intent: RevisionIntent, fence: JobCommitFence): Promise<RevisionResult> {
        return this.write(scope, intent, 'ai', jobCommitFenceSchema.parse(fence));
    }

    private async write(scopeInput: LocalizationScope, input: RevisionIntent, provenance: StoredRevision['provenance'], jobFence?: JobCommitFence): Promise<RevisionResult> {
        const scope = localizationScopeSchema.parse(scopeInput), request = revisionIntentSchema.parse(input);
        const revision = storedRevisionSchema.parse({ ...request, scope, provenance });
        const replay = async (): Promise<RevisionResult | null> => {
            const existing = await this.persistence.readRevision(scope, request.unitId, request.locale, request.revisionId);
            if (!existing) return null;
            const checked = storedRevisionSchema.parse(existing);
            if (!sameScope(checked.scope, scope) || checked.unitId !== request.unitId || checked.locale !== request.locale || checked.revisionId !== request.revisionId) throw Error('translation_store_invariant');
            return JSON.stringify(checked) === JSON.stringify(revision) ? { status: 'already-committed', revisionId: request.revisionId }
                : { status: 'rejected', reason: 'revision-id-conflict' };
        };
        const prior = jobFence ? null : await replay();
        if (prior) return prior; // Retry acknowledges immutable history; it never restores an old head.
        const snapshot = checkedSnapshot(await this.persistence.read(scope, request.unitId, request.locale), scope, request.unitId, request.locale);
        if (!snapshot.source) return { status: 'rejected', reason: 'missing-source' };
        if (snapshot.source.sourceVersion !== request.sourceVersion) return { status: 'rejected', reason: 'source-version' };
        if (snapshot.source.fingerprint !== request.sourceFingerprint) return { status: 'rejected', reason: 'source-fingerprint' };
        if (snapshot.source.contextFingerprint !== request.contextFingerprint) return { status: 'rejected', reason: 'context-fingerprint' };
        if (snapshot.source.unit.sourceLocale === request.locale) return { status: 'rejected', reason: 'source-locale' };
        if ((snapshot.head?.revisionId ?? null) !== request.expectedHead) return { status: 'rejected', reason: 'head' };
        if (snapshot.head?.provenance === 'manual' && provenance !== 'manual') return { status: 'rejected', reason: 'manual-protected' };
        const invalid = validatePlainRevision(snapshot.source.unit, request.text);
        if (invalid) return { status: 'rejected', reason: invalid };
        const result = await this.persistence.compareAndSwap(scope, request.unitId, snapshot.version, { kind: 'revision', revision, ...(jobFence ? { jobFence } : {}) });
        if (result === 'committed') return { status: 'committed', revisionId: request.revisionId };
        if (result === 'job-fenced') return { status: 'rejected', reason: 'job-fenced' };
        return (jobFence ? null : await replay()) ?? { status: 'rejected', reason: result === 'revision-id-conflict' ? 'revision-id-conflict' : 'concurrent-write' };
    }
}

/** Shared adapter-side input validation, including independent scope binding. */
export function parsePersistenceChange(scopeInput: LocalizationScope, unitInput: string, versionInput: number, input: PersistenceChange) {
    const scope = localizationScopeSchema.parse(scopeInput), unitId = hash.parse(unitInput), expectedVersion = counter.parse(versionInput);
    const change = persistenceChangeSchema.parse(input);
    const owner = change.kind === 'source' ? change.source.unit.scope : change.revision.scope;
    if (!sameScope(owner, scope) || (change.kind === 'revision' && change.revision.unitId !== unitId)) throw Error('translation_scope_mismatch');
    counter.min(1).parse(expectedVersion + 1);
    return { scope, unitId, expectedVersion, change };
}

export function parsePersistenceKey(scopeInput: LocalizationScope, unitInput: string, localeInput?: string) {
    return { scope: localizationScopeSchema.parse(scopeInput), unitId: hash.parse(unitInput), locale: localeInput === undefined ? undefined : localeSchema.parse(localeInput) };
}
