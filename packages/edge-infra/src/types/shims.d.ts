/**
 * Ambient shims for credential-gated / optional server-only SDKs. edge-infra is
 * server-only (RULE 1); these modules are imported dynamically only when their
 * feature is selected. Declaring them here lets the package type-check without
 * forcing every consumer to install every cloud/AI SDK. Runtime import resolves
 * the real module when the dep is present.
 */

// Cloudflare D1/KV runtime types (available in the Workers runtime; shimming for
// standalone Node type-checking of server code that targets Workers).
interface KVNamespace {
    get(key: string, options?: { type?: 'text' | 'json' }): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

declare module '@neondatabase/serverless' {
    export class Pool {
        constructor(cfg: { connectionString: string });
        query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
        end(): Promise<void>;
    }
}

declare module 'ai' {
    export interface GenerateTextResult { text: string; usage: { promptTokens: number; completionTokens: number }; }
    export function generateText(opts: { model: unknown; prompt: string }): Promise<GenerateTextResult>;
}

declare module '@modelcontextprotocol/sdk/client/index.js' {
    export class Client {
        constructor(info: { name: string; version: string }, opts: { capabilities: Record<string, unknown> });
        connect(transport: unknown): Promise<void>;
        callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<{ result: unknown }>;
        close(): Promise<void>;
    }
}
declare module '@modelcontextprotocol/sdk/client/sse.js' {
    export class SSEClientTransport {
        constructor(url: URL);
    }
}

declare module '@ai-sdk/openai' { export const openai: (model: string) => unknown; }
declare module '@ai-sdk/anthropic' { export const anthropic: (model: string) => unknown; }
declare module '@ai-sdk/google' { export const google: (model: string) => unknown; }

declare module '@upstash/qstash' {
    export class Client {
        constructor(opts: { token: string });
    }
}
