import { z } from 'zod';

/** Data-only localization contracts. Generation, authorization and storage are separate seams. */
const id = z.string().min(1).max(160).refine(value => !/[\u0000-\u001f]/.test(value), 'Invalid identifier');
const name = z.string().min(1).max(160).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), 'Reserved name');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const localeSchema = z.string().min(2).max(63).transform((value, ctx) => {
    try {
        const [canonical] = Intl.getCanonicalLocales(value);
        if (canonical) return canonical;
    } catch { /* invalid BCP 47 identifier */ }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid language identifier' });
    return z.NEVER;
});
export const localizationScopeSchema = z.object({ tenantId: id, projectId: id }).strict();
const propertyPath = z.array(name).min(1).max(24);
const recordKey = z.array(z.object({ column: name, value: z.union([z.string().max(4000), z.number().finite(), z.boolean()]) }).strict())
    .min(1).max(16).refine(parts => new Set(parts.map(part => part.column)).size === parts.length, 'Duplicate key column');
export const resourceRefSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('component'), documentId: id, blockId: id, versionId: id.default('default'), propertyPath }).strict(),
    z.object({ kind: z.literal('record'), connectionId: id, collection: id, key: recordKey, propertyPath }).strict(),
    z.object({ kind: z.literal('system'), componentKind: id, messageId: id }).strict(),
]);
export const translationStorageSchema = z.object({
    datasourceId: id,
    namespace: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/).optional(),
    tablePrefix: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/).default('fb_i18n_'),
}).strict();
/** Concrete storage selection: references existing encrypted credentials, never contains secrets.
 * Endpoint format is explicit; changing content bindings never silently retargets translations.
 * Only the installed translations protocol is supported by the current HTTP adapter.
 */
export const translationStorageConfigurationSchema = z.object({
    version: z.literal(1), datasourceId: id,
    endpoint: z.enum(['supabase', 'postgrest']), namespace: z.literal('translations'),
}).strict();
export const translationStorageSettingsSchema = z.object({
    revision: z.number().int().nonnegative().safe(),
    projectId: id.nullable(),
    configuration: translationStorageConfigurationSchema.nullable(),
}).strict().refine(value => value.configuration === null || value.projectId !== null, 'Project identity required');
export const translationStorageOptionsSchema = translationStorageSettingsSchema.innerType().extend({
    contentDatasourceId: id.nullable(),
    datasources: z.array(z.object({ id, name: z.string().max(1000), kind: z.string().max(100), supported: z.boolean() }).strict()).max(10000),
}).strict().refine(value => value.configuration === null || value.projectId !== null, 'Project identity required');
export const translationStorageSaveSchema = z.object({
    expectedRevision: z.number().int().nonnegative().safe(),
    configuration: translationStorageConfigurationSchema.nullable(),
}).strict();
export type TranslationStorageConfiguration = z.infer<typeof translationStorageConfigurationSchema>;
export type TranslationStorageSettings = z.infer<typeof translationStorageSettingsSchema>;

export const languageConfigurationSchema = z.object({
    version: z.literal(1), scope: localizationScopeSchema, sourceLocale: localeSchema,
    locales: z.array(z.object({ code: localeSchema, direction: z.enum(['ltr', 'rtl']), enabled: z.boolean() }).strict()).min(1).max(128),
    storage: translationStorageSchema,
    missingPolicy: z.enum(['source-fallback', 'unavailable']),
    outdatedPolicy: z.enum(['retain-published', 'source-fallback', 'unavailable']),
}).strict().superRefine((value, ctx) => {
    const codes = value.locales.map(locale => locale.code);
    if (new Set(codes).size !== codes.length) ctx.addIssue({ code: 'custom', message: 'Duplicate locale' });
    if (!value.locales.some(locale => locale.code === value.sourceLocale && locale.enabled)) {
        ctx.addIssue({ code: 'custom', message: 'Source language must be enabled' });
    }
});

/** Rich text will have its own bounded tree contract; it must never enter this as executable HTML. */
export const messageUnitSchema = z.object({
    version: z.literal(1), scope: localizationScopeSchema, resource: resourceRefSchema,
    sourceLocale: localeSchema, format: z.enum(['plain', 'icu-v1', 'mf2']),
    text: z.string().max(100_000), segmenterVersion: z.number().int().min(1).max(1000),
    placeholders: z.array(name).max(128).refine(values => new Set(values).size === values.length, 'Duplicate placeholder'),
}).strict();
export const translationRevisionSchema = z.object({
    version: z.literal(1), scope: localizationScopeSchema, unitId: hash, revisionId: id,
    locale: localeSchema, sourceFingerprint: hash, text: z.string().max(100_000),
    provenance: z.enum(['ai', 'manual', 'import']), expectedHead: id.nullable(),
}).strict();
export const publishedTranslationRefSchema = z.object({
    version: z.literal(1), scope: localizationScopeSchema, locale: localeSchema,
    releaseId: id, sequence: z.number().int().nonnegative(), digest: hash,
}).strict();

export type LocalizationScope = z.infer<typeof localizationScopeSchema>;
export type ResourceRef = z.infer<typeof resourceRefSchema>;
export type MessageUnit = z.infer<typeof messageUnitSchema>;
export type LanguageConfiguration = z.infer<typeof languageConfigurationSchema>;

/** Explicitly selected hints only; never an unbounded record dump or credentials container. */
export const translationContextSchema = z.object({
    version: z.literal(1), role: z.string().max(200).optional(), resourceLabel: z.string().max(200).optional(),
    guidance: z.string().max(4000).optional(), neighbors: z.array(z.string().max(1000)).max(8).optional(),
    glossary: z.array(z.object({ locale: localeSchema, source: z.string().min(1).max(200), target: z.string().max(200) }).strict()).max(64).optional(),
}).strict();
export type TranslationContext = z.infer<typeof translationContextSchema>;
/** SHA256 of the canonical context fingerprint envelope; asserted independently by tests. */
export const EMPTY_TRANSLATION_CONTEXT_FINGERPRINT = 'd0c24e75893242d3b787aa91928389ae64658726003f4cc98ba7020a7d9f1f67';

/** The runtime decision stays behind this request-scoped, data-only boundary. */
export interface MessageResolver {
    format(input: { locale: string; format: MessageUnit['format']; text: string; values: Readonly<Record<string, string | number | boolean | Date>> }): string;
}
