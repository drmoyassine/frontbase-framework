import { supabasePostgrestHeaders, type SupabaseOpts } from '@frontbase/edge-infra/supabase-http';
import { resolveSupabase } from './providers/supabase.js';
import { checkedExternalUrl, guardedExternalFetch, type CompatFetch } from './external-http.js';

const limit = 8 * 1024 * 1024;
const failure = (error: string) => ({ success: false, message: 'Connection test failed', error, suggestion: null });

/** Read-only protocol/schema probe; no rows, SQL, RPC execution or automatic fallback. */
export async function testPostgrestConnection(config: Record<string, unknown>, transport: CompatFetch) {
    let response: Response | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
        const resolved = resolveSupabase(config);
        if (!resolved.serviceKey) return failure('An API key is required.');
        const base = checkedExternalUrl(String(resolved.url ?? ''));
        if (base.search || base.hash) return failure('Use an HTTPS API base URL without query parameters or a fragment.');
        const options: SupabaseOpts = { url: base.href.replace(/\/$/, ''), serviceKey: String(resolved.serviceKey), schema: String(resolved.schema ?? 'public'), ...(resolved.jwt ? { jwt: String(resolved.jwt) } : {}) };
        const endpoint = resolved.restUrl ? options.url : `${options.url}/rest/v1/`;
        response = await guardedExternalFetch(transport, endpoint, { method: 'GET', headers: { ...supabasePostgrestHeaders(options), Accept: 'application/openapi+json' }, signal: controller.signal });
        if (response.status === 401) return failure('The API rejected the credentials. Check the saved key and token.');
        if (response.status === 403) return failure('The credential does not have permission to access this API or schema.');
        if (response.status === 404) return failure('The REST endpoint was not found. Check the base URL and endpoint format.');
        if (!response.body || Number(response.headers.get('content-length') ?? 0) > limit) return failure('The API metadata response is unavailable or too large.');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        try {
            while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) return failure('The API metadata response is too large.'); chunks.push(value); }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (document?.code === 'PGRST106') return failure('The selected schema is not exposed by PostgREST.');
        if (!response.ok) return failure('The API could not complete the schema check.');
        if ((document?.swagger !== '2.0' && !/^3\./.test(String(document?.openapi ?? ''))) || !document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) return failure('The endpoint did not return PostgREST API metadata. Enable OpenAPI metadata to use this check.');
        return { success: true, message: 'HTTP connection and schema check passed', tables: [], suggestion: 'This read-only check does not execute SQL or verify application-specific RPC capabilities.' };
    } catch {
        return failure(controller.signal.aborted ? 'The API connection timed out.' : 'The API could not be checked. Verify the HTTPS endpoint, schema and provider availability.');
    } finally { clearTimeout(timer); await response?.body?.cancel().catch(() => {}); }
}
