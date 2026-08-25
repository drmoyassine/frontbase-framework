/**
 * Embedding for the RAG pipeline — OpenAI-compatible `/embeddings` over an
 * injected fetch (product parity in wire shape; the product's Workers AI /
 * Ollama providers are covered by the same wire via `base_url` — any
 * OpenAI-compatible endpoint, self-hosted or cloud, works).
 *
 * Divergences from the product (documented, docs/system-services.md):
 *  - configured via FRONTBASE_EMBEDDING env JSON, not the product's CLOUDFLARE_ or
 *    OLLAMA_ variables;
 *  - every request goes through guardedExternalFetch — HTTPS-only, private-IP
 *    blocked. A local Ollama/LM Studio on http://localhost is therefore NOT
 *    reachable (by design, same trust class as every other outbound provider
 *    call); expose it over a public HTTPS hostname instead.
 *  - the API key never appears in logs or error messages — failures surface the
 *    HTTP status only.
 */
import type { ServiceFetch } from '@frontbase/edge-infra';
import type { ServiceEnvConfig } from '../system-services.js';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_EMBEDDING_BASE = 'https://api.openai.com/v1';

export interface EmbeddingConfig {
    baseUrl: string;
    apiKey?: string;
    model: string;
}

export type Embed = (text: string) => Promise<number[]>;

/** Normalize the env-declared embedding config. Null when FRONTBASE_EMBEDDING
 *  is absent, not 'openai'-shaped, or carries neither an api_key nor a
 *  base_url override (nothing to talk to). */
export function parseEmbeddingConfig(config: ServiceEnvConfig | undefined): EmbeddingConfig | null {
    if (!config?.provider || config.provider === 'none') return null;
    if (config.provider !== 'openai') return null;
    const apiKey = config.apiKey ?? config.token;
    const baseUrl = (config.baseUrl ?? config.url ?? DEFAULT_EMBEDDING_BASE).replace(/\/+$/, '');
    if (!apiKey && baseUrl === DEFAULT_EMBEDDING_BASE) return null; // keyless default endpoint = misconfiguration
    return { baseUrl, ...(apiKey ? { apiKey } : {}), model: config.model ?? DEFAULT_EMBEDDING_MODEL };
}

/** Build the embed function over an injected (guarded) fetch. */
export function openaiEmbedding(config: EmbeddingConfig, fetchImpl: ServiceFetch): Embed {
    return async (text: string): Promise<number[]> => {
        const resp = await fetchImpl(`${config.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
                'content-type': 'application/json',
            },
            body: JSON.stringify({ model: config.model, input: text }),
        });
        if (!resp.ok) throw new Error(`embedding_failed_${resp.status}`);
        const data = await resp.json().catch(() => null) as { data?: Array<{ embedding?: unknown }> } | null;
        const vector = data?.data?.[0]?.embedding;
        if (!Array.isArray(vector)) throw new Error('embedding_failed_no_vector');
        return vector.map(Number);
    };
}

/** Resolve the embed function from the env config, or null when RAG has no
 *  embedding to run with (routes answer "not configured", never crash). */
export function embeddingFromEnv(
    config: ServiceEnvConfig | undefined,
    fetchImpl: ServiceFetch,
    log: (msg: string) => void = () => {},
): Embed | null {
    const parsed = parseEmbeddingConfig(config);
    if (!parsed) {
        if (config?.provider && config.provider !== 'none') {
            log(`[rag] embedding provider '${config.provider}' not supported in v1 — RAG disabled`);
        }
        return null;
    }
    return openaiEmbedding(parsed, fetchImpl);
}
