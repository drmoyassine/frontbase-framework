/**
 * Built-in node executors — the deterministic, SDK-free control-flow nodes.
 * Ported from engine/node-executors.ts (the AI/MCP/email/queue nodes are
 * excluded — they belong to @frontbase/edge-infra, M2.1).
 *
 * Types covered: trigger, email_trigger, http_request, agent,
 * transform/json_transform, condition/if, log, set_variable,
 * http_response, delay/wait.
 */
import { safeEval } from './expr.js';
import { ExecutorRegistry, type NodeExecutor, type NodeExecutorContext } from './providers.js';

interface NodeLike {
    id: string;
    type: string;
    inputs?: Array<{ name: string; value?: unknown }> | null;
    data?: unknown;
}

/** Read a node input by name, falling back to the resolved edge inputs. */
function reader(node: NodeLike, inputs: Record<string, unknown>) {
    const nodeInputs = node.inputs || [];
    return (name: string): unknown => {
        const inp = nodeInputs.find((i) => i.name === name);
        return inp?.value !== undefined ? inp.value : inputs[name];
    };
}

const triggerExecutor: NodeExecutor = {
    types: ['trigger', 'manual_trigger'],
    async execute(_node, inputs) {
        // Trigger nodes pass workflow parameters straight through.
        return { ...inputs };
    },
};

/**
 * Normalizes an inbound email run payload (DEC-105 InboundEmail shape:
 * {providerMessageId, from, to, subject, text, html, receivedAt, ...}) into
 * the flat fields downstream nodes read. Filters stay in the trigger node's
 * inputs — the runtime applies them at dispatch, not here.
 */
const emailTriggerExecutor: NodeExecutor = {
    types: ['email_trigger'],
    async execute(_node, inputs) {
        const str = (v: unknown): string => (typeof v === 'string' ? v : '');
        const to = Array.isArray(inputs.to) ? inputs.to.map(String).join(', ') : str(inputs.to);
        const text = str(inputs.text);
        const html = str(inputs.html);
        return {
            from: str(inputs.from),
            to,
            subject: str(inputs.subject) || '(no subject)',
            body: html || text,
            text,
            html,
            providerMessageId: inputs.providerMessageId,
            conversationId: inputs.conversationId,
            receivedAt: inputs.receivedAt ?? new Date().toISOString(),
            data: inputs,
        };
    },
};

const httpRequestExecutor: NodeExecutor = {
    types: ['http_request'],
    async execute(node, inputs) {
        const get = reader(node as NodeLike, inputs);
        const url = get('url') as string;
        const method = (get('method') as string) || 'GET';
        const headers = (get('headers') as Record<string, string>) || {};
        const body = get('body');
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => response.text());
        return { status: response.status, ok: response.ok, data };
    },
};

/**
 * agent — one turn against an agent-runtime deployment (DEC-105 v0 contract).
 * POSTs the runtime's exact /turn shape ({agent, contact_id, message,
 * thread_id?} + Bearer key) and maps the snake_case reply fields onto the
 * node output. SDK-free plain fetch, like http_request — so the node runs on
 * BOTH execution paths (edge-core default registry and edge-infra's full one).
 */
const agentExecutor: NodeExecutor = {
    types: ['agent'],
    async execute(node, inputs) {
        const get = reader(node as NodeLike, inputs);
        const baseUrl = String(get('baseUrl') ?? '').replace(/\/+$/, '');
        const apiKey = String(get('apiKey') ?? '');
        const threadId = String(get('threadId') ?? '').trim();
        const body: Record<string, unknown> = {
            agent: String(get('agentSlug') ?? ''),
            contact_id: Number(get('contactId')),
            message: String(get('message') ?? ''),
        };
        if (threadId) body.thread_id = threadId;
        const response = await fetch(`${baseUrl}/turn`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => response.text());
        const payload = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
        return {
            status: response.status,
            ok: response.ok,
            turnId: payload.turn_id,
            threadId: payload.thread_id,
            turnStatus: payload.status,
            reply: payload.reply,
            replay: payload.replay === true,
            error: payload.error,
            data,
        };
    },
};

const transformExecutor: NodeExecutor = {
    types: ['transform', 'json_transform'],
    async execute(node, inputs) {
        const expr = reader(node as NodeLike, inputs)('expression');
        if (typeof expr === 'string') {
            try { return { result: safeEval(expr, inputs) }; }
            catch { return { result: inputs, error: 'Transform expression failed' }; }
        }
        return { result: inputs };
    },
};

const conditionExecutor: NodeExecutor = {
    types: ['condition', 'if'],
    async execute(node, inputs) {
        const condition = reader(node as NodeLike, inputs)('condition');
        let result = false;
        if (typeof condition === 'string') {
            try { result = !!safeEval(condition, inputs); } catch { result = false; }
        }
        return { result, branch: result ? 'true' : 'false', data: inputs };
    },
};

const logExecutor: NodeExecutor = {
    types: ['log', 'console'],
    async execute(node, inputs) {
        console.log(`[Node ${node.id}]:`, inputs);
        return { logged: true, data: inputs };
    },
};

const setVariableExecutor: NodeExecutor = {
    types: ['set_variable', 'setVariable'],
    async execute(node, inputs, ctx: NodeExecutorContext) {
        const get = reader(node as NodeLike, inputs);
        const scope = (get('scope') as string) || 'local';
        const key = get('key') as string;
        const rawValue = get('value');
        let value = rawValue;
        if (typeof rawValue === 'string') {
            try { value = safeEval(rawValue, inputs); } catch { value = rawValue; }
        }
        ctx.variableMutations.push({ scope, key, value });
        return { scope, key, value };
    },
};

const httpResponseExecutor: NodeExecutor = {
    types: ['http_response'],
    async execute(node, inputs) {
        const get = reader(node as NodeLike, inputs);
        return {
            statusCode: get('statusCode') || 200,
            body: get('body') ?? inputs,
            headers: get('headers'),
            contentType: get('contentType') || 'application/json',
        };
    },
};

const delayExecutor: NodeExecutor = {
    types: ['delay', 'wait'],
    async execute(node, inputs) {
        const ms = Number(reader(node as NodeLike, inputs)('ms')) || 0;
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        return { delayed: ms, data: inputs };
    },
};

/**
 * The edge-core built-in registry: control-flow nodes, the agent turn node,
 * and the email trigger normalizer. AI (`ai.chat`), MCP (`mcp.call`), send
 * email, and queue nodes are registered by edge-infra; unregistered types
 * throw `executor_not_registered` at runtime.
 */
export function defaultExecutorRegistry(): ExecutorRegistry {
    return new ExecutorRegistry()
        .register(triggerExecutor)
        .register(emailTriggerExecutor)
        .register(httpRequestExecutor)
        .register(agentExecutor)
        .register(transformExecutor)
        .register(conditionExecutor)
        .register(logExecutor)
        .register(setVariableExecutor)
        .register(httpResponseExecutor)
        .register(delayExecutor);
}
