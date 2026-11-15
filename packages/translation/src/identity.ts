import { localizationScopeSchema, messageUnitSchema, resourceRefSchema, translationContextSchema, type LocalizationScope, type ResourceRef, type TranslationContext } from './contracts.js';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value !== null && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    }
    return JSON.stringify(value);
}
const encoder = new TextEncoder();
const hexBytes = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'));
async function digestCanonical(value: string): Promise<string> {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
    let hash = '';
    for (const byte of bytes) hash += hexBytes[byte]!;
    return hash;
}
function digest(value: unknown): Promise<string> {
    return digestCanonical(canonical(value));
}

function validatedResource(input: ResourceRef): ResourceRef {
    const resource = resourceRefSchema.parse(input);
    if (resource.kind === 'record') resource.key.sort((a, b) => a.column < b.column ? -1 : a.column > b.column ? 1 : 0);
    return resource;
}
/** Unit identity never depends on source wording, URL, DOM order or translation provider. */
export async function translationUnitId(scope: LocalizationScope, input: ResourceRef): Promise<string> {
    const resource = validatedResource(input);
    return digest({ version: 1, scope: localizationScopeSchema.parse(scope), resource });
}

/** Preserve the canonical ID envelope while validating and serializing a shared
 * scope once. Each resource still passes the same strict identity validation. */
export function translationUnitIdForScope(scope: LocalizationScope): (input: ResourceRef) => Promise<string> {
    const { projectId, tenantId } = localizationScopeSchema.parse(scope);
    const suffix = ',"scope":' + JSON.stringify({ projectId, tenantId }) + ',"version":1}';
    return async input => {
        const resource = validatedResource(input);
        let ordered: ResourceRef;
        // Contract keys in canonical order. Record key parts were parsed as
        // column/value objects and sorted by column in validatedResource.
        switch (resource.kind) {
            case 'component': {
                const { blockId, documentId, kind, propertyPath, versionId } = resource;
                ordered = { blockId, documentId, kind, propertyPath, versionId };
                break;
            }
            case 'record': {
                const { collection, connectionId, key, kind, propertyPath } = resource;
                ordered = { collection, connectionId, key, kind, propertyPath };
                break;
            }
            case 'system': {
                const { componentKind, kind, messageId } = resource;
                ordered = { componentKind, kind, messageId };
                break;
            }
        }
        return digestCanonical('{"resource":' + JSON.stringify(ordered) + suffix);
    };
}

const fingerprintFieldsSchema = messageUnitSchema.pick({
    sourceLocale: true, format: true, text: true, segmenterVersion: true, placeholders: true,
}).strict();

function fingerprintDigest(fields: ReturnType<typeof fingerprintFieldsSchema.parse>): Promise<string> {
    const { sourceLocale: locale, format, text, segmenterVersion } = fields;
    return digestCanonical(JSON.stringify({
        format, locale, placeholders: fields.placeholders.slice().sort(), segmenterVersion, text, version: 1,
    }));
}

/** Source changes invalidate work without changing the stable unit ID. */
export async function messageSourceFingerprint(input: unknown): Promise<string> {
    return fingerprintDigest(messageUnitSchema.parse(input));
}

/** Serving already checks identity and scope. Decode only the inputs to the
 * same canonical source fingerprint after those checks. */
export async function messageSourceFingerprintFromFields(input: unknown): Promise<string> {
    return fingerprintDigest(fingerprintFieldsSchema.parse(input));
}
export async function translationContextFingerprint(input: TranslationContext): Promise<string> {
    return digest({ version: 1, context: translationContextSchema.parse(input) });
}
