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
    const nodeInputs = node.inputs ?? (node.data as {inputs?:NodeLike['inputs']}|undefined)?.inputs ?? [];
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

async function workflowResponseText(response:Response):Promise<string>{
    const reader=response.body?.getReader();if(!reader)return '';
    const decoder=new TextDecoder();let text='',bytes=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;
        if(bytes>1024*1024){await reader.cancel();throw Error('workflow_http_response_too_large');}
        text+=decoder.decode(chunk.value,{stream:true});}
        return text+decoder.decode();
    }finally{reader.releaseLock();}
}

const httpRequestExecutor = (doFetch:typeof fetch): NodeExecutor => ({
    types: ['http_request'],
    async execute(node, inputs) {
        const get = reader(node as NodeLike, inputs);
        const url = new URL(String(get('url')));
        const method = (get('method') as string) || 'GET';
        const pairs=(value:unknown):[string,string][]=>Array.isArray(value)?value.map(pair=>[String(pair.key),String(pair.value)]):Object.entries((value??{}) as Record<string,unknown>).map(([key,value])=>[key,String(value)]);
        const headers=new Headers(get('sendHeaders')===false?undefined:pairs(get('headers')));
        if(get('sendQuery')===true)for(const[key,value]of pairs(get('queryParameters')))url.searchParams.append(key,value);
        const auth=get('authentication')??'none';
        if(auth==='basicAuth'){const bytes=new TextEncoder().encode(String(get('username')??'')+':'+String(get('password')??''));headers.set('Authorization','Basic '+btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')));}
        else if(auth==='bearerToken')headers.set('Authorization','Bearer '+String(get('bearerToken')??''));
        else if(auth==='headerAuth')headers.set(String(get('headerAuthName')??'Authorization'),String(get('headerAuthValue')??''));
        else if(auth!=='none')throw Error('http_auth_unsupported');
        let body:BodyInit|undefined;const raw=get('body');
        if(get('sendBody')!==false&&method!=='GET'&&method!=='HEAD'){
            const contentType=get('contentType')??'json';
            if(contentType==='json'&&raw!==undefined){headers.set('Content-Type','application/json');body=typeof raw==='string'?raw:JSON.stringify(raw);}
            else if(contentType==='form-data'){const form=new FormData();for(const[key,value]of pairs(get('bodyParameters')))form.append(key,value);body=form;}
            else if(contentType==='x-www-form-urlencoded'){headers.set('Content-Type','application/x-www-form-urlencoded');body=new URLSearchParams(pairs(get('bodyParameters')));}
            else if(contentType==='raw')body=String(raw??'');
            else if(contentType!=='json')throw Error('http_body_unsupported');
        }
        const timeout=Number(get('timeout')??30000);if(!Number.isFinite(timeout)||timeout<=0)throw Error('http_timeout_invalid');
        const response = await doFetch(url,{method,headers,body,signal:AbortSignal.timeout(Math.max(1,Math.min(30000,timeout)))});
        const text=await workflowResponseText(response);
        let data:unknown=text;try{data=JSON.parse(text);}catch{}
        return { status: response.status, ok: response.ok, data,headers:Object.fromEntries(response.headers) };
    },
});

/**
 * agent — one turn against an agent-runtime deployment (DEC-105 v0 contract).
 * POSTs the runtime's exact /turn shape ({agent, contact_id, message,
 * thread_id?} + Bearer key) and maps the snake_case reply fields onto the
 * node output. SDK-free plain fetch, like http_request — so the node runs on
 * BOTH execution paths (edge-core default registry and edge-infra's full one).
 */
const agentExecutor = (doFetch:typeof fetch): NodeExecutor => ({
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
        const response = await doFetch(`${baseUrl}/turn`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify(body),
        });
        const text=await workflowResponseText(response);let data:unknown=text;try{data=JSON.parse(text);}catch{}
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
});

const transformExecutor: NodeExecutor = {
    types: ['transform', 'json_transform'],
    async execute(node, inputs) {
        const get=reader(node as NodeLike,inputs),operation=get('operation');
        if(operation){
            const data=inputs.data??inputs.payload??inputs;
            const name=(key:string)=>{if(!key||key.split('.').some(part=>['__proto__','constructor','prototype'].includes(part)))throw Error('transform_field_invalid');return key;};
            const path=(value:unknown,key:string):unknown=>{let next:any=value;for(const part of name(key).split('.'))next=next&&typeof next==='object'&&Object.hasOwn(next,part)?next[part]:undefined;return next;};
            const resolve=(value:unknown,row:unknown=data):unknown=>{if(typeof value!=='string')return value;const match=value.match(/^\s*\{\{\s*\$input\.(.+?)\s*\}\}\s*$/);return match?path({...inputs,data:row},match[1]!):value;};
            const map=(fn:(row:Record<string,unknown>)=>unknown)=>Array.isArray(data)?data.map(row=>fn(row)):fn(data as Record<string,unknown>);
            const record=(row:unknown):Record<string,unknown>=>{if(!row||typeof row!=='object'||Array.isArray(row))throw Error('transform_object_required');return row as Record<string,unknown>;};
            let output:unknown;
            if(operation==='setFields'){
                const raw=get('fieldsToSet')??{},fields=Array.isArray(raw)?Object.fromEntries(raw.map(pair=>[name(String(pair.key)),pair.value])):record(raw);output=map(row=>{const next={...record(row)};for(const[key,value]of Object.entries(fields))next[name(key)]=resolve(value,row);return next;});
            }else if(operation==='extractField')output=path(data,String(get('extractPath')??''));
            else if(operation==='keepFields'||operation==='removeFields'){
                const keys=String(get(operation==='keepFields'?'fieldsToKeep':'fieldsToRemove')??'').split(',').map(key=>name(key.trim()));
                output=map(row=>Object.fromEntries(Object.entries(record(row)).filter(([key])=>operation==='keepFields'?keys.includes(key):!keys.includes(key))));
            }else if(operation==='renameFields'){
                const raw=get('fieldsToRename')??{},fields=Array.isArray(raw)?Object.fromEntries(raw.map(pair=>[name(String(pair.key)),pair.value])):record(raw);output=map(row=>{const next={...record(row)};for(const[key,value]of Object.entries(fields)){name(key);const target=name(String(value));if(Object.hasOwn(next,key)){next[target]=next[key];delete next[key];}}return next;});
            }else throw Error('transform_operation_unsupported');
            return {data:output,count:Array.isArray(output)?output.length:1};
        }
        const expr = get('expression');
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
export function defaultExecutorRegistry(options:{fetchImpl?:typeof fetch}={}): ExecutorRegistry {
    const doFetch=options.fetchImpl??globalThis.fetch.bind(globalThis);
    return new ExecutorRegistry()
        .register(triggerExecutor)
        .register(emailTriggerExecutor)
        .register(httpRequestExecutor(doFetch))
        .register(agentExecutor(doFetch))
        .register(transformExecutor)
        .register(conditionExecutor)
        .register(logExecutor)
        .register(setVariableExecutor)
        .register(httpResponseExecutor)
        .register(delayExecutor);
}
