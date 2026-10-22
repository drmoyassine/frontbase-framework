/**
 * CF-22 P2 Wave 2 — the `actions` tag (24 ops): the workflow Builder surface.
 * Drafts CRUD + publish + versions + executions, all reusing Phase2Store's
 * automations tables (migration v3: workflows + workflow_executions). A "draft" is
 * a workflow row; publish snapshots the current nodes/edges as a new version;
 * test creates an execution row. Community "publish" marks the workflow active
 * (the worker IS the engine). Responses conform to the vendored ActionDraft /
 * PublishResult / Execution shapes. RULE 2: tenant from `c.get('tenant')`.
 *
 * Route ordering: static segments (bulk-delete, execution-stats, execution/:id,
 * executions, executions/detail/:id, executions/export) registered before the
 * param routes (drafts/:id, executions/:id) so Hono matches them first.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { isSystemEngine } from './edge-shapes.js';
import {authoringGraph,snapshotWorkflow,workflowVersions,workflowVersion,runAuthoringWorkflow,authoringExecution,WorkflowCapabilityError} from '../workflow-authoring.js';
import {requireRole} from '../../auth/roles.js';
import type {CompatFetch} from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/**
 * Validates UUID format (matches Python's uuid.UUID() validation behavior).
 * Returns true for valid UUIDs, false otherwise.
 */
function isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

const asJson = (v: unknown): string => typeof v === 'string' ? v : JSON.stringify(v ?? []);

function pythonJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) =>
            `${JSON.stringify(key)}: ${pythonJson(record[key])}`).join(', ')}}`;
    }
    return JSON.stringify(value);
}

/**
 * A stored workflow row -> WorkflowDraftResponse (required: name, id, created_at,
 * updated_at). Nodes/edges are stored as JSON strings; the contract types them as
 * arrays, so they are parsed rather than passed through.
 */
function asDraft(row: Record<string, unknown>, contentHash: string | null = null): Record<string, unknown> {
    const parse = (v: unknown): unknown[] => {
        try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; }
        catch { return []; }
    };
    // content_hash: use explicit param if provided (PATCH computes fresh), otherwise fall back to row value, default null
    const hash = contentHash ?? (row.content_hash ?? null);
    // Product field order: name, description, trigger_type, trigger_config, nodes, edges, settings, id, is_published, is_active, published_version, deployed_engines, content_hash, created_at, updated_at, created_by
    const base: Record<string, unknown> = {
        name: String(row.name ?? ''),
        description: null,
        trigger_type: String(row.trigger_type ?? 'manual'),
        trigger_config: null,
        nodes: parse(row.nodes),
        edges: parse(row.edges),
        settings: {},
        id: String(row.id),
        is_published: Boolean(row.is_published),
        is_active: Boolean(row.is_active),
        published_version: row.is_published ? Number(row.version ?? 1) : null,
        deployed_engines: {},
        content_hash: hash,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? row.created_at ?? ''),
        created_by: null,
    };
    return base;
}

export function registerActionsRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string,externalFetch:CompatFetch=async()=>{throw Error('workflow_transport_unavailable');}): void {
    app.use('/api/actions/*',requireRole('owner','admin','tenant_admin','master_admin','master_admin_root'));
    const unsupported=()=>({detail:'This workflow capability is unsupported in this preview',code:'workflow_capability_unsupported'});
    const execute=async(store:Phase2Store,tenant:string,row:Record<string,unknown>,body:unknown,nodeId?:string)=>{
        const parameters=(body as {parameters?:unknown})?.parameters??{};
        if(!parameters||typeof parameters!=='object'||Array.isArray(parameters)||JSON.stringify(parameters).length>64000)throw Error('workflow_input_invalid');
        return runAuthoringWorkflow(store,tenant,row,parameters as Record<string,unknown>,now,nodeId,externalFetch);
    };
    // ---- drafts CRUD ----
    // GET /api/actions/drafts
    app.get('/api/actions/drafts', async (c) => {
        // WorkflowDraftListResponse: {drafts: WorkflowDraftResponse[], total}.
        const drafts = (await phase2For(c.get('tenant')).listWorkflows()).map((row) => asDraft(row));
        return c.json({ drafts, total: drafts.length });
    });
    // POST /api/actions/drafts
    app.post('/api/actions/drafts', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; nodes?: unknown; edges?: unknown; is_active?: boolean };
        const name = b.name ?? 'Workflow';
        const store = phase2For(c.get('tenant'));
        // Check for duplicate workflow name (product returns 400 for duplicates)
        const existing = await store.listWorkflows();
        if (existing.some((row) => String(row.name ?? '') === name)) {
            return c.json({ detail: `A workflow with the name '${name}' already exists` }, 400);
        }
        const id = crypto.randomUUID();
        await store.upsertWorkflow({ id, name, nodes: asJson(b.nodes), edges: asJson(b.edges), isActive: b.is_active ?? true }, now());
        return c.json(asDraft(await store.getWorkflow(id) ?? { id, name, created_at: now(), updated_at: now() }), 201);
    });

    // Static sibling (bulk-delete) MUST come before /drafts/:draft_id.
    // POST /api/actions/drafts/bulk-delete
    app.post('/api/actions/drafts/bulk-delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = phase2For(c.get('tenant'));
        let n = 0;
        for (const id of b.ids ?? []) { await store.deleteWorkflow(id); n++; }
        return c.json({ deleted: n });
    });

    // GET /api/actions/drafts/{draft_id}
    app.get('/api/actions/drafts/:draft_id', async (c) => {
        const w = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        return w ? c.json(asDraft(w)) : c.json({ detail: 'Draft not found' }, 404);
    });
    // DELETE /api/actions/drafts/{draft_id}
    app.delete('/api/actions/drafts/:draft_id', async (c) => {
        const store = phase2For(c.get('tenant'));
        if (!await store.getWorkflow(c.req.param('draft_id'))) {
            return c.json({ detail: 'Draft not found' }, 404);
        }
        await store.deleteWorkflow(c.req.param('draft_id'));
        return c.body(null, 204, { 'Content-Type': 'application/json' });
    });
    // PATCH /api/actions/drafts/{draft_id}
    app.patch('/api/actions/drafts/:draft_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; nodes?: unknown; edges?: unknown; is_active?: boolean };
        const existing = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ detail: 'Draft not found' }, 404);
        const store = phase2For(c.get('tenant'));
        await store.upsertWorkflow({
            id: c.req.param('draft_id'),
            name: b.name ?? String(existing.name),
            nodes: b.nodes !== undefined ? asJson(b.nodes) : String(existing.nodes),
            edges: b.edges !== undefined ? asJson(b.edges) : String(existing.edges),
            isActive: b.is_active ?? Boolean(existing.is_active),
        }, now());
        const updated = await store.getWorkflow(c.req.param('draft_id')) ?? existing;
        const hashInput = pythonJson({
            edges: JSON.parse(String(updated.edges ?? '[]')),
            name: String(updated.name ?? ''),
            nodes: JSON.parse(String(updated.nodes ?? '[]')),
            settings: {},
            trigger_config: {},
            trigger_type: String(updated.trigger_type ?? 'manual'),
        });
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
        const contentHash = Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 16);
        return c.json(asDraft(updated, contentHash));
    });
    // PATCH /api/actions/drafts/{draft_id}/active
    app.patch('/api/actions/drafts/:draft_id/active', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { is_active?: boolean };
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ detail: 'Draft not found' }, 404);
        await store.toggleWorkflow(c.req.param('draft_id'), b.is_active ?? false, now());
        return c.json({ id: c.req.param('draft_id'), is_active: b.is_active ?? false });
    });

    // ---- publish / rollback / test ----
    // POST /api/actions/drafts/{draft_id}/publish
    app.post('/api/actions/drafts/:draft_id/publish', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        try{authoringGraph(existing);await snapshotWorkflow(store,existing,now(),'Local publication',String((c.get('principal').user as {id?:string}).id??''));if(!await store.publishWorkflowIfVersion(String(existing.id),Number(existing.version),now()))return c.json({detail:'Draft changed during publication'},409);return c.json({success:true,message:'Published to the local engine',workflow_id:existing.id,version:Number(existing.version)});}
        catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow graph is invalid'},error instanceof WorkflowCapabilityError?501:422);}
    });
    // POST /api/actions/drafts/{draft_id}/publish/{engine_id}/
    app.post('/api/actions/drafts/:draft_id/publish/:engine_id/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        const engineId = c.req.param('engine_id');
        // The system edge is the worker itself — always a valid local target. Any
        // other id must resolve to a stored engine.
        if (!isSystemEngine(engineId)) {
            const engine = await store.getEdgeResource(engineId);
            if (!engine || engine.kind !== 'engine') {
                return c.json({ detail: `Engine not found: ${engineId}` }, 404);
            }
            return c.json(unsupported(),501);
        }
        try{authoringGraph(existing);await snapshotWorkflow(store,existing,now(),'Local publication',String((c.get('principal').user as {id?:string}).id??''));}catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow graph is invalid'},error instanceof WorkflowCapabilityError?501:422);}
        if(!await store.publishWorkflowIfVersion(c.req.param('draft_id'),Number(existing.version),now()))return c.json({detail:'Draft changed during publication'},409);
        return c.json({ success: true, message: 'Published to the local engine', workflow_id: c.req.param('draft_id'), version: Number(existing.version ?? 1) });
    });
    // POST /api/actions/drafts/{draft_id}/publish-batch/
    app.post('/api/actions/drafts/:draft_id/publish-batch/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        const body = await c.req.json().catch(() => ({ engine_ids: [] })) as { engine_ids?: string[] };
        const ids = Array.isArray(body.engine_ids) ? body.engine_ids : [];
        if(ids.some(id=>!isSystemEngine(id)))return c.json(unsupported(),501);
        // The system edge is always valid (the worker is the engine); other ids must
        // resolve to stored engines.
        const resolved = await Promise.all(ids.map(async (id) => {
            if (isSystemEngine(id)) return true;
            const engine = await store.getEdgeResource(id);
            return engine?.kind === 'engine';
        }));
        const valid = ids.filter((_, i) => resolved[i]);
        if (valid.length === 0) return c.json({ detail: 'No engines found' }, 404);
        try{authoringGraph(existing);await snapshotWorkflow(store,existing,now(),'Local publication',String((c.get('principal').user as {id?:string}).id??''));}catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow graph is invalid'},error instanceof WorkflowCapabilityError?501:422);}
        if(!await store.publishWorkflowIfVersion(c.req.param('draft_id'),Number(existing.version),now()))return c.json({detail:'Draft changed during publication'},409);
        return c.json({
            success: true,
            message: 'Published',
            results: valid.map((id) => ({ engine_id: id, success: true })),
            workflow_id: c.req.param('draft_id'),
            version: Number(existing.version ?? 1),
        });
    });
    // POST /api/actions/drafts/{draft_id}/publish/{engine_id}/toggle
    app.post('/api/actions/drafts/:draft_id/publish/:engine_id/toggle', async (c) => {
        const draftId = c.req.param('draft_id');
        const engineId = c.req.param('engine_id');
        const store = phase2For(c.get('tenant'));

        // Validate draft_id UUID format (product parity: 400 for invalid format)
        if (!isValidUUID(draftId)) {
            return c.json({ detail: 'Invalid draft ID format' }, 400);
        }

        const existing = await store.getWorkflow(draftId);
        if (!existing) return c.json({ detail: 'Workflow draft not found' }, 404);
        if(!isSystemEngine(engineId)){
        const engine = await store.getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            // Product parity: return 404 for deployment target not found (matches product resource not found behavior)
            return c.json({ detail: 'Deployment target not found' }, 404);
        }
        return c.json(unsupported(),501);
        }
        const next = !Boolean(existing.is_active);
        await store.toggleWorkflow(draftId, next, now());
        return c.json({ success: true, message: next ? 'Workflow activated' : 'Workflow deactivated', is_active: next });
    });
    // POST /api/actions/drafts/{draft_id}/rollback/  (community: no version store per workflow → graceful)
    app.post('/api/actions/drafts/:draft_id/rollback/', async (c) => {
        const workflow = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!workflow) return c.json({ detail: 'Workflow draft not found' }, 404);
        const store=phase2For(c.get('tenant')),body=await c.req.json().catch(()=>({})) as {version_id?:string};
        const version=await workflowVersion(store,String(workflow.id),body.version_id??'');if(!version)return c.json({detail:'Target version not found'},404);
        const prior=await snapshotWorkflow(store,workflow,now(),'Before rollback',String((c.get('principal').user as {id?:string}).id??''));
        if(!await store.restoreWorkflowIfVersion(String(workflow.id),Number(workflow.version),version,now()))return c.json({detail:'Draft changed during rollback'},409);
        return c.json({success:true,message:'Restored draft; activation remains paused',data:{preRollbackVersionId:prior.id,restoredVersionNumber:version.versionNumber}});
    });
    // POST /api/actions/drafts/{draft_id}/test  (create an execution row)
    app.post('/api/actions/drafts/:draft_id/test', async (c) => {
        const store = phase2For(c.get('tenant'));
        const workflow=await store.getWorkflow(c.req.param('draft_id'));
        if (!workflow) {
            return c.json({ detail: 'Draft not found' }, 404);
        }
        try{return c.json(await execute(store,c.get('tenant'),workflow,await c.req.json().catch(()=>({}))));}catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow graph or input is invalid'},error instanceof WorkflowCapabilityError?501:422);}
    });
    // POST /api/actions/drafts/{draft_id}/test-node/{node_id}  (no live node runtime in the worker)
    app.post('/api/actions/drafts/:draft_id/test-node/:node_id', async (c) => {
        const store = phase2For(c.get('tenant'));
        const workflow=await store.getWorkflow(c.req.param('draft_id'));
        if (!workflow) {
            return c.json({ detail: 'Draft not found' }, 404);
        }
        try{return c.json(await execute(store,c.get('tenant'),workflow,await c.req.json().catch(()=>({})),c.req.param('node_id')));}catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow node or input is invalid'},error instanceof WorkflowCapabilityError?501:422);}
    });

    // ---- versions (community: workflow.version field; no separate version table) ----
    // GET /api/actions/drafts/{draft_id}/versions/
    app.get('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const w = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!w) return c.json({detail:'Workflow draft not found'},404);
        return c.json({ success: true, data: await workflowVersions(phase2For(c.get('tenant')),String(w.id)), message: null, error: null });
    });
    // POST /api/actions/drafts/{draft_id}/versions/  (upsert increments version)
    app.post('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const w = await store.getWorkflow(c.req.param('draft_id'));
        if (!w) return c.json({ detail: 'Workflow draft not found' }, 404);
        const body = await c.req.json().catch(()=>({})) as { label?: string | null };
        if(body.label!=null&&(typeof body.label!=='string'||body.label.length>200))return c.json({detail:'Invalid version label'},422);
        try{return c.json({success:true,data:await snapshotWorkflow(store,w,now(),body.label??null,String((c.get('principal').user as {id?:string}).id??'')),message:null,error:null});}
        catch(error){return c.json(error instanceof WorkflowCapabilityError?unsupported():{detail:'Workflow graph is invalid'},error instanceof WorkflowCapabilityError?501:422);}
    });
    // GET /api/actions/drafts/{draft_id}/versions/{version_id}/
    app.get('/api/actions/drafts/:draft_id/versions/:version_id/', async (c) => {
        const draftId = c.req.param('draft_id');
        const workflow = await phase2For(c.get('tenant')).getWorkflow(draftId);
        const version=workflow?await workflowVersion(phase2For(c.get('tenant')),draftId,c.req.param('version_id')):null;
        if (!version) {
            return c.json({ detail: 'Version not found' }, 404);
        }
        return c.json({
            success: true,
            data: version,
            error: null,
        });
    });

    // ---- executions ----
    // Static routes before the executions/:draft_id param route.
    // GET /api/actions/execution-stats
    app.get('/api/actions/execution-stats', async (c) => {
        const rows = await phase2For(c.get('tenant')).listExecutions(undefined, 500);
        const stats=new Map<string,{workflowId:string;totalRuns:number;successfulRuns:number;failedRuns:number}>();
        for(const row of rows){const id=String(row.workflow_id),s=stats.get(id)??{workflowId:id,totalRuns:0,successfulRuns:0,failedRuns:0};s.totalRuns++;if(row.status==='completed')s.successfulRuns++;if(row.status==='error')s.failedRuns++;stats.set(id,s);}
        return c.json({stats:[...stats.values()],windowLimit:500});
    });
    // GET /api/actions/execution/{execution_id}  (singular "execution")
    app.get('/api/actions/execution/:execution_id', async (c) => {
        const store=phase2For(c.get('tenant')),row=await store.getExecution(c.req.param('execution_id'));return row?c.json(await authoringExecution(store,row)):c.json({detail:'Execution not found'},404);
    });
    // GET /api/actions/executions
    app.get('/api/actions/executions', async (c) => {
        const store=phase2For(c.get('tenant')),limit=Math.max(1,Math.min(500,Number(c.req.query('limit'))||50));
        const rows=(await store.listExecutions(undefined,500)).filter(row=>(!c.req.query('status')||row.status===c.req.query('status'))&&(!c.req.query('trigger_type')||row.trigger===c.req.query('trigger_type')));
        if(c.req.query('engine_name')&&c.req.query('engine_name')!=='Local Edge')return c.json({executions:[],total:0,windowLimit:500});
        return c.json({executions:await Promise.all(rows.slice(0,limit).map(row=>authoringExecution(store,row))),total:rows.length,windowLimit:500});
    });
    // GET /api/actions/executions/detail/{execution_id}
    app.get('/api/actions/executions/detail/:execution_id', async (c) => {
        const store=phase2For(c.get('tenant')),row=await store.getExecution(c.req.param('execution_id'));return row?c.json(await authoringExecution(store,row)):c.json({detail:'Execution not found'},404);
    });
    // GET /api/actions/executions/export  (CSV header-only — community has no export pipeline)
    app.get('/api/actions/executions/export', async (c) => {
        const store=phase2For(c.get('tenant')),rows=await store.listExecutions(undefined,500);
        const cell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
        const lines=['Execution ID,Workflow Name,Workflow ID,Trigger,Status,Edge Name,Started,Ended,Error'];
        for(const row of rows){const entry=await authoringExecution(store,row);lines.push([entry.id,entry.workflowName,entry.workflowId,entry.triggerType,entry.status,'Local Edge',entry.startedAt,entry.endedAt,entry.error].map(cell).join(','));}
        return c.body(lines.join('\r\n')+'\r\n',200,{'Content-Type':'text/csv','Cache-Control':'no-store'});
    });
    // GET /api/actions/executions/{draft_id}  (param route LAST among executions/*)
    app.get('/api/actions/executions/:draft_id', async (c) => {const store=phase2For(c.get('tenant')),rows=await store.listExecutions(c.req.param('draft_id'),Math.max(1,Math.min(500,Number(c.req.query('limit'))||50)));return c.json({executions:await Promise.all(rows.map(row=>authoringExecution(store,row))),total:rows.length});});
    // GET /api/actions/executions/{draft_id}/production/{engine_id}
    app.get('/api/actions/executions/:draft_id/production/:engine_id', async (c) => {
        const engineId = c.req.param('engine_id');
        if(!isSystemEngine(engineId)){
        const engine = await phase2For(c.get('tenant')).getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: `Engine not found: ${engineId}` }, 404);
        }
        return c.json(unsupported(),501);
        }
        const rows = await phase2For(c.get('tenant')).listExecutions(c.req.param('draft_id'));
        return c.json({ executions: await Promise.all(rows.map(row=>authoringExecution(phase2For(c.get('tenant')),row))), total: rows.length, engine_id: engineId });
    });
    app.post('/api/actions/executions/:execution_id/cancel',async c=>{if(!await phase2For(c.get('tenant')).getExecution(c.req.param('execution_id')))return c.json({detail:'Execution not found'},404);return c.json({detail:'Running-work cancellation is unsupported; no cancellation was performed',code:'workflow_cancellation_unsupported'},501);});
}
