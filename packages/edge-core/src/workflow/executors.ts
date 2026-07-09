/**
 * Built-in node executors — the deterministic, SDK-free control-flow nodes.
 * Ported from engine/node-executors.ts (the AI/MCP/email/queue nodes are
 * excluded — they belong to @frontbase/edge-infra, M2.1).
 *
 * Types covered: trigger, http_request, transform/json_transform,
 * condition/if, log, set_variable, http_response, delay/wait.
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
 * The edge-core built-in registry: control-flow nodes only. AI (`ai.chat`),
 * MCP (`mcp.call`), email, and queue nodes are registered by edge-infra;
 * unregistered types throw `executor_not_registered` at runtime.
 */
export function defaultExecutorRegistry(): ExecutorRegistry {
    return new ExecutorRegistry()
        .register(triggerExecutor)
        .register(httpRequestExecutor)
        .register(transformExecutor)
        .register(conditionExecutor)
        .register(logExecutor)
        .register(setVariableExecutor)
        .register(httpResponseExecutor)
        .register(delayExecutor);
}
