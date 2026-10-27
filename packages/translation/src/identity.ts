import { localizationScopeSchema, messageUnitSchema, resourceRefSchema, translationContextSchema, type LocalizationScope, type ResourceRef, type TranslationContext } from './contracts.js';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    }
    return JSON.stringify(value);
}
async function digest(value: unknown): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Unit identity never depends on source wording, URL, DOM order or translation provider. */
export async function translationUnitId(scope: LocalizationScope, input: ResourceRef): Promise<string> {
    const resource = resourceRefSchema.parse(input);
    if (resource.kind === 'record') resource.key.sort((a, b) => a.column < b.column ? -1 : a.column > b.column ? 1 : 0);
    return digest({ version: 1, scope: localizationScopeSchema.parse(scope), resource });
}
/** Source changes invalidate work without changing the stable unit ID. */
export async function messageSourceFingerprint(input: unknown): Promise<string> {
    const unit = messageUnitSchema.parse(input);
    return digest({ version: 1, locale: unit.sourceLocale, format: unit.format, text: unit.text,
        segmenterVersion: unit.segmenterVersion, placeholders: unit.placeholders.slice().sort() });
}
export async function translationContextFingerprint(input: TranslationContext): Promise<string> {
    return digest({ version: 1, context: translationContextSchema.parse(input) });
}
