/**
 * AI / MCP / email / queue NodeExecutors — the node types edge-core left as
 * `executor_not_registered` (the control-flow ones ship in edge-core; these need
 * external SDKs and live in this server-only package). Ported from the product's
 * routes/openai.ts (Vercel AI SDK), routes/mcp.ts (@modelcontextprotocol/sdk).
 *
 * They are registered into an ExecutorRegistry the host passes to executeWorkflow.
 * RULE 1: this module is server-only — the AI SDK, MCP SDK, and any API keys
 * never enter a browser bundle.
 */
import type { ExecutorRegistry, NodeExecutor, NodeExecutorContext } from '@frontbase/edge-core/workflow';
import { defaultExecutorRegistry } from '@frontbase/edge-core/workflow';

type NodeLike = { id: string; type: string; inputs?: Array<{ name: string; value?: unknown }> | null };

function input(node: NodeLike, name: string, fallback?: unknown): unknown {
    const found = (node.inputs ?? []).find((i) => i.name === name);
    return found?.value !== undefined ? found.value : fallback;
}

/** ai.chat executor — calls a chat model via the Vercel AI SDK (`ai` package).
 *  The model/provider is resolved from the node inputs (e.g. model id + provider). */
export const aiChatExecutor: NodeExecutor = {
    types: ['ai.chat', 'ai_completion', 'llm'],
    async execute(node, _inputs, _ctx) {
        const { generateText } = await import('ai');
        const prompt = String(input(node as NodeLike, 'prompt', ''));
        const modelId = String(input(node as NodeLike, 'model', 'gpt-4o-mini'));
        const provider = await resolveModelProvider(modelId);
        const result = await generateText({ model: provider, prompt });
        return { text: result.text, usage: result.usage };
    },
};

/** mcp.call executor — invokes a tool on an MCP server (@modelcontextprotocol/sdk). */
export const mcpCallExecutor: NodeExecutor = {
    types: ['mcp.call', 'mcp_tool'],
    async execute(node, _inputs) {
        const serverUrl = String(input(node as NodeLike, 'serverUrl', ''));
        const tool = String(input(node as NodeLike, 'tool', ''));
        const args = input(node as NodeLike, 'args', {}) as Record<string, unknown>;
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
        const transport = new SSEClientTransport(new URL(serverUrl));
        const client = new Client({ name: 'frontbase-workflow', version: '1.0' }, { capabilities: {} });
        await client.connect(transport);
        try {
            const result = await client.callTool({ name: tool, arguments: args });
            return { result };
        } finally {
            await client.close();
        }
    },
};

/** email executor — a thin fetch to a transactional email API (no heavy SDK). */
export const emailExecutor: NodeExecutor = {
    types: ['email', 'send_email'],
    async execute(node, _inputs) {
        const to = String(input(node as NodeLike, 'to', ''));
        const subject = String(input(node as NodeLike, 'subject', ''));
        const body = String(input(node as NodeLike, 'body', ''));
        const endpoint = String(input(node as NodeLike, 'endpoint', ''));
        // The host provides an email endpoint + API key via env; never embed keys here.
        if (!endpoint) return { sent: false, reason: 'no_email_endpoint' };
        const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, subject, body }) });
        return { sent: res.ok, status: res.status };
    },
};

/** queue.trigger executor — enqueues a workflow via the durable WorkflowProvider. */
export const queueTriggerExecutor: NodeExecutor = {
    types: ['queue_trigger', 'enqueue'],
    async execute(node, _inputs, ctx) {
        const targetWorkflow = String(input(node as NodeLike, 'workflowId', ''));
        // The host injects an enqueue function via ctx parameters (server-side only).
        const enqueue = (ctx as NodeExecutorContext & { enqueue?: (id: string, p: unknown) => Promise<void> }).enqueue;
        if (enqueue) await enqueue(targetWorkflow, input(node as NodeLike, 'payload', {}));
        return { enqueued: targetWorkflow };
    },
};

/**
 * The full edge executor registry: edge-core's built-in control-flow executors
 * PLUS the AI/MCP/email/queue ones defined here. Hosts pass this to executeWorkflow.
 */
export function fullExecutorRegistry(): ExecutorRegistry {
    return defaultExecutorRegistry()
        .register(aiChatExecutor)
        .register(mcpCallExecutor)
        .register(emailExecutor)
        .register(queueTriggerExecutor);
}

/** Resolve a Vercel-AI-SDK model from a `provider/model` id. SDKs are optional;
 *  missing providers throw a clear error at runtime (not build time). */
async function resolveModelProvider(modelId: string): Promise<unknown> {
    const [providerName, name] = modelId.split('/');
    const modelName = name ?? providerName ?? '';
    switch (providerName) {
        case 'openai': { const m = await import('@ai-sdk/openai'); return m.openai(modelName); }
        case 'anthropic': { const m = await import('@ai-sdk/anthropic'); return m.anthropic(modelName); }
        case 'google': { const m = await import('@ai-sdk/google'); return m.google(modelName); }
        default: throw new Error(`unknown_ai_provider:${providerName}`);
    }
}
