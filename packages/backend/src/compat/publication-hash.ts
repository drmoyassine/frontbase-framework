import { stableStringify } from '@frontbase/compiler/manifest';
export async function publicationHash(value: unknown): Promise<string> {
    return publicationBytesHash(new TextEncoder().encode(stableStringify(value)));
}
export async function publicationBytesHash(value: Uint8Array<ArrayBuffer>): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', value))].map(v => v.toString(16).padStart(2, '0')).join('');
}
