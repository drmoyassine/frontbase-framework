import { translationModelCatalogSchema } from '@frontbase/edge-core/localization/batches';
import { resolveGenerationAccount, type GenerationHost } from './translation-generation.js';
import { guardedExternalFetch } from './external-http.js';

/** Read-only discovery on the same owned account seam as invocation. No generation or settings writes. */
export async function translationModels(host: GenerationHost, tenant: string, accountId: string) {
    const account = await resolveGenerationAccount(host, tenant, accountId);
    const url = account.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/models?output_modalities=text' : 'https://api.openai.com/v1/models';
    const response = await guardedExternalFetch(host.externalFetch, url, { headers: { authorization: `Bearer ${account.apiKey}` }, signal: AbortSignal.timeout(10_000) });
    const reader = response.body?.getReader();
    try {
        if (!response.ok || !reader || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw Error();
        const decoder = new TextDecoder('utf-8', { fatal: true }); let raw = '', size = 0;
        while (true) { const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength; if (size > 8 * 1024 * 1024) throw Error(); raw += decoder.decode(chunk.value, { stream: true }); }
        raw += decoder.decode(); const value = JSON.parse(raw);
        if (!Array.isArray(value?.data) || value.data.length > 5000) throw Error();
        const models = new Map<string, { id: string; name: string; free: boolean }>();
        for (const row of value.data) {
            if (typeof row?.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(row.id)) continue;
            if (account.provider === 'openrouter' && (!Array.isArray(row.architecture?.input_modalities) || !row.architecture.input_modalities.includes('text')
                || !Array.isArray(row.architecture?.output_modalities) || !row.architecture.output_modalities.includes('text'))) continue;
            const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0,200) : row.id;
            models.set(row.id, { id: row.id, name, free: row.id.endsWith(':free') || row.id === 'openrouter/free' });
        }
        return translationModelCatalogSchema.parse({ accountId, models: [...models.values()].sort((a,b) => Number(b.free)-Number(a.free) || a.name.localeCompare(b.name)) });
    } finally { await reader?.cancel().catch(() => {}); }
}
