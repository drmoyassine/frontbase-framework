/**
 * Branding asset persistence (CF-22 P2 Wave 2 — product parity).
 *
 * The product stores favicon/logo uploads on LOCAL DISK (fastapi-backend
 * app/routers/project.py: "independent of user-configured Supabase storage …
 * works in both admin and SSR contexts") — branding must survive broken or
 * absent storage-provider credentials. Edge hosts have no filesystem, so the
 * bytes live in the SAME tenant-scoped KeyValueStore the project settings use
 * (the `settings` table), base64-chunked across rows.
 *
 * Chunking is load-bearing: D1 caps a SQL statement at 100KB (the REST runner
 * also carries the whole statement in one request body), and a 1MB logo is
 * ~1.37MB as base64. Each chunk row stays far under the cap.
 */
import type { DbRunner } from '@frontbase/edge-infra';
import { KeyValueStore } from './store.js';

/** Base64 characters per settings row (~64KB — safely under D1's 100KB statement cap). */
const ASSET_CHUNK_CHARS = 64_000;

export interface StoredProjectAsset {
    contentType: string;
    bytes: Uint8Array;
}

/** Web/Node-portable base64 (chunked spread — String.fromCharCode(...all) overflows the stack at ~100KB). */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const SLICE = 0x8000;
    for (let i = 0; i < bytes.length; i += SLICE) {
        binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
    }
    return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Persist asset bytes under `project_asset:{filename}` (meta: content_type,
 * size, chunk count) plus `project_asset:{filename}#{i}` data rows. Filenames
 * carry random hex, so a name is only ever written by one upload — stale-chunk
 * collisions cannot occur.
 */
export async function saveProjectAsset(
    kv: KeyValueStore,
    filename: string,
    contentType: string,
    bytes: Uint8Array,
    now: string,
): Promise<void> {
    const b64 = bytesToBase64(bytes);
    const chunks = Math.max(1, Math.ceil(b64.length / ASSET_CHUNK_CHARS));
    for (let i = 0; i < chunks; i++) {
        await kv.setJson(`project_asset:${filename}#${i}`, { data_b64: b64.slice(i * ASSET_CHUNK_CHARS, (i + 1) * ASSET_CHUNK_CHARS) }, now);
    }
    await kv.setJson(`project_asset:${filename}`, { content_type: contentType, size: bytes.length, chunks }, now);
}

/** Read back what saveProjectAsset wrote; null when the asset (or any chunk) is missing/corrupt. */
export async function readProjectAsset(
    kv: KeyValueStore,
    filename: string,
): Promise<StoredProjectAsset | null> {
    const meta = await kv.getJson<{ content_type?: string; chunks?: number } | null>(`project_asset:${filename}`, null);
    if (!meta || typeof meta.chunks !== 'number' || meta.chunks < 1) return null;
    let b64 = '';
    for (let i = 0; i < meta.chunks; i++) {
        const chunk = await kv.getJson<{ data_b64?: string } | null>(`project_asset:${filename}#${i}`, null);
        if (!chunk?.data_b64) return null;
        b64 += chunk.data_b64;
    }
    try {
        return { contentType: meta.content_type ?? 'application/octet-stream', bytes: base64ToBytes(b64) };
    } catch {
        return null;
    }
}

/** The console's project settings (KeyValueStore key "project") — branding URLs live here. */
export async function readProjectSettings(runner: DbRunner, tenant: string): Promise<Record<string, unknown>> {
    return await new KeyValueStore(runner, tenant).getJson<Record<string, unknown>>('project', {});
}
