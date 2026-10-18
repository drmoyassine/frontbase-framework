/** Server-only, injected HTTP text invocation. No implicit SDK/env credentials or retries. */
import type { ServiceFetch } from './cache/types.js';

export interface TextInvocation {
    model: string;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    maxOutputTokens: number;
    signal?: AbortSignal;
}
export interface TextResult {
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
}
export type TextInvoker = (input: TextInvocation) => Promise<TextResult>;
export class AIInvocationError extends Error {
    constructor(readonly code: 'configuration' | 'input' | 'transport' | 'response' | 'incomplete' | 'timeout') { super(`ai_${code}`); }
}
const bounded = (n: unknown, max: number): n is number => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
/** Host MUST supply its guarded fetch. This low-level adapter does not resolve accounts. */
export function httpTextInvoker(config: { baseUrl: string; apiKey: string; protocol?: 'openai' | 'openrouter' }, fetchImpl: ServiceFetch): TextInvoker {
    let endpoint: string;
    try {
        const url = new URL(config.baseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !config.apiKey || /[\r\n]/.test(config.apiKey)) throw Error();
        endpoint = url.href.replace(/\/$/, '') + '/chat/completions';
    } catch { throw new AIInvocationError('configuration'); }
    return async input => {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(input.model) || !bounded(input.maxOutputTokens, 16384) || input.maxOutputTokens < 1
            || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 8
            || input.messages.some(m => !['system', 'user'].includes(m.role) || typeof m.content !== 'string')) throw new AIInvocationError('input');
        const openrouter = config.protocol === 'openrouter';
        const free = input.model.endsWith(':free') || input.model === 'openrouter/free';
        const body = JSON.stringify({ model: input.model, messages: input.messages,
            ...(openrouter ? { max_tokens: input.maxOutputTokens, provider: { allow_fallbacks: false, require_parameters: true,
                data_collection: 'deny', ...(free ? { max_price: { prompt: 0, completion: 0, request: 0 } } : {}) } }
                : { max_completion_tokens: input.maxOutputTokens, store: false }), stream: false });
        if (new TextEncoder().encode(body).byteLength > 131072) throw new AIInvocationError('input');
        const controller = new AbortController();
        const abort = () => controller.abort();
        input.signal?.addEventListener('abort', abort, { once: true });
        if (input.signal?.aborted) abort();
        const timer = setTimeout(abort, 20000);
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            controller.signal.throwIfAborted();
            const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'manual', signal: controller.signal,
                headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' }, body });
            if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new AIInvocationError('response'); }
            const declared = response.headers.get('content-length');
            if (declared && Number(declared) > 524288) { await response.body?.cancel().catch(() => {}); throw new AIInvocationError('response'); }
            reader = response.body?.getReader();
            if (!reader) throw new AIInvocationError('response');
            let raw = '', size = 0; const decoder = new TextDecoder('utf-8', { fatal: true });
            while (true) {
                const chunk = await reader.read(); controller.signal.throwIfAborted();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 524288) throw new AIInvocationError('response');
                raw += decoder.decode(chunk.value, { stream: true });
            }
            raw += decoder.decode();
            const data = JSON.parse(raw), choice = data?.choices?.[0];
            if (!Array.isArray(data?.choices) || data.choices.length !== 1 || choice?.finish_reason !== 'stop'
                || choice?.message?.refusal || choice?.message?.tool_calls || choice?.message?.function_call) throw new AIInvocationError('incomplete');
            const text = choice?.message?.content;
            if (typeof text !== 'string' || !text.length || text.length > 100000) throw new AIInvocationError('response');
            const usage = data.usage;
            if (usage != null && (!bounded(usage.prompt_tokens, Number.MAX_SAFE_INTEGER) || !bounded(usage.completion_tokens, input.maxOutputTokens))) throw new AIInvocationError('response');
            return { text, ...(usage == null ? {} : { usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } }) };
        } catch (error) {
            if (controller.signal.aborted) throw new AIInvocationError('timeout');
            throw error instanceof AIInvocationError ? error : new AIInvocationError('transport');
        } finally {
            clearTimeout(timer); input.signal?.removeEventListener('abort', abort);
            await reader?.cancel().catch(() => {});
        }
    };
}
