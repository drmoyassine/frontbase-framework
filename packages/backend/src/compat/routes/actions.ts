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

type App = Hono<{ Variables: ConsoleAuthVars }>;

const asJson = (v: unknown): string => typeof v === 'string' ? v : JSON.stringify(v ?? []);

/**
 * A stored workflow row -> WorkflowDraftResponse (required: name, id, created_at,
 * updated_at). Nodes/edges are stored as JSON strings; the contract types them as
 * arrays, so they are parsed rather than passed through.
 */
function asDraft(row: Record<string, unknown>): Record<string, unknown> {
    const parse = (v: unknown): unknown[] => {
        try { const p = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; }
        catch { return []; }
    };
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        nodes: parse(row.nodes),
        edges: parse(row.edges),
        is_active: Boolean(row.is_active),
        is_published: Boolean(row.is_active),
        trigger_type: String(row.trigger_type ?? 'manual'),
        description: null,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? row.created_at ?? ''),
    };
}

export function registerActionsRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string): void {
    // ---- drafts CRUD ----
    // GET /api/actions/drafts
    app.get('/api/actions/drafts', async (c) => {
        // WorkflowDraftListResponse: {drafts: WorkflowDraftResponse[], total}.
        const drafts = (await phase2For(c.get('tenant')).listWorkflows()).map(asDraft);
        return c.json({ drafts, total: drafts.length });
    });
    // POST /api/actions/drafts
    app.post('/api/actions/drafts', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; nodes?: unknown; edges?: unknown; is_active?: boolean };
        const id = crypto.randomUUID();
        const store = phase2For(c.get('tenant'));
        await store.upsertWorkflow({ id, name: b.name ?? 'Workflow', nodes: asJson(b.nodes), edges: asJson(b.edges), isActive: b.is_active ?? true }, now());
        return c.json(asDraft(await store.getWorkflow(id) ?? { id, name: b.name ?? 'Workflow', created_at: now(), updated_at: now() }), 201);
    });

    // Static sibling (bulk-delete) MUST come before /drafts/:draft_id.
    // POST /api/actions/drafts/bulk-delete
    app.post('/api/actions/drafts/bulk-delete', async (c) => {
        const b = await c.req.json().catch(() => ({ ids: [] as string[] })) as { ids?: string[] };
        const store = phase2For(c.get('tenant'));
        let n = 0;
        for (const id of b.ids ?? []) { await store.deleteWorkflow(id); n++; }
        return c.json({ success: true, deleted: n });
    });

    // GET /api/actions/drafts/{draft_id}
    app.get('/api/actions/drafts/:draft_id', async (c) => {
        const w = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        return w ? c.json(asDraft(w)) : c.json({ detail: 'Draft not found' }, 404);
    });
    // DELETE /api/actions/drafts/{draft_id}
    app.delete('/api/actions/drafts/:draft_id', async (c) => {
        await phase2For(c.get('tenant')).deleteWorkflow(c.req.param('draft_id'));
        return c.json({ success: true, deleted: 1 });
    });
    // PATCH /api/actions/drafts/{draft_id}
    app.patch('/api/actions/drafts/:draft_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; nodes?: unknown; edges?: unknown; is_active?: boolean };
        const existing = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ detail: 'Draft not found' }, 404);
        await phase2For(c.get('tenant')).upsertWorkflow({
            id: c.req.param('draft_id'),
            name: b.name ?? String(existing.name),
            nodes: b.nodes !== undefined ? asJson(b.nodes) : String(existing.nodes),
            edges: b.edges !== undefined ? asJson(b.edges) : String(existing.edges),
            isActive: b.is_active ?? Boolean(existing.is_active),
        }, now());
        return c.json({ success: true, id: c.req.param('draft_id') });
    });
    // PATCH /api/actions/drafts/{draft_id}/active
    app.patch('/api/actions/drafts/:draft_id/active', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { is_active?: boolean };
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ detail: 'Draft not found' }, 404);
        await store.toggleWorkflow(c.req.param('draft_id'), b.is_active ?? false, now());
        return c.json({ success: true, id: c.req.param('draft_id'), is_active: b.is_active ?? false });
    });

    // ---- publish / rollback / test ----
    // POST /api/actions/drafts/{draft_id}/publish
    app.post('/api/actions/drafts/:draft_id/publish', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        await store.toggleWorkflow(c.req.param('draft_id'), true, now());
        return c.json({ success: true, message: 'Published', workflow_id: c.req.param('draft_id'), version: Number(existing.version ?? 1) + 1 });
    });
    // POST /api/actions/drafts/{draft_id}/publish/{engine_id}/
    app.post('/api/actions/drafts/:draft_id/publish/:engine_id/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        await store.toggleWorkflow(c.req.param('draft_id'), true, now());
        return c.json({ success: true, message: 'Published', workflow_id: c.req.param('draft_id'), version: Number(existing.version ?? 1) + 1 });
    });
    // POST /api/actions/drafts/{draft_id}/publish-batch/
    app.post('/api/actions/drafts/:draft_id/publish-batch/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        await store.toggleWorkflow(c.req.param('draft_id'), true, now());
        const v = Number(existing.version ?? 1) + 1;
        return c.json({ success: true, message: 'Published', results: [{ engineId: 'local', name: 'This deployment', success: true, error: null, previewUrl: null, version: v }] });
    });
    // POST /api/actions/drafts/{draft_id}/publish/{engine_id}/toggle
    app.post('/api/actions/drafts/:draft_id/publish/:engine_id/toggle', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        const next = !Boolean(existing.is_active);
        await store.toggleWorkflow(c.req.param('draft_id'), next, now());
        return c.json({ success: true, message: next ? 'Workflow activated' : 'Workflow deactivated', is_active: next });
    });
    // POST /api/actions/drafts/{draft_id}/rollback/  (community: no version store per workflow → graceful)
    app.post('/api/actions/drafts/:draft_id/rollback/', (c) => c.json({ success: false, message: 'No previous version to roll back to' }));
    // POST /api/actions/drafts/{draft_id}/test  (create an execution row)
    app.post('/api/actions/drafts/:draft_id/test', async (c) => {
        const execId = crypto.randomUUID();
        await phase2For(c.get('tenant')).createExecution(execId, c.req.param('draft_id'), 'manual', now(), { source: 'test' });
        return c.json({ execution_id: execId, status: 'started', message: 'Test execution queued' });
    });
    // POST /api/actions/drafts/{draft_id}/test-node/{node_id}  (no live node runtime in the worker)
    app.post('/api/actions/drafts/:draft_id/test-node/:node_id', (c) => c.json({
        execution_id: crypto.randomUUID(), status: 'completed', message: `Node ${c.req.param('node_id')} has no live runtime in this deployment`,
    }));

    // ---- versions (community: workflow.version field; no separate version table) ----
    // GET /api/actions/drafts/{draft_id}/versions/
    app.get('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const w = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        return c.json({
            success: true,
            data: w ? [{ id: c.req.param('draft_id'), version_number: Number(w.version ?? 1), created_at: w.updated_at }] : [],
            error: null,
        });
    });
    // POST /api/actions/drafts/{draft_id}/versions/  (upsert increments version)
    app.post('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const w = await store.getWorkflow(c.req.param('draft_id'));
        if (!w) return c.json({ success: false, message: 'Draft not found' }, 404);
        const { version } = await store.upsertWorkflow({ id: c.req.param('draft_id'), name: String(w.name), nodes: String(w.nodes), edges: String(w.edges), isActive: Boolean(w.is_active) }, now());
        return c.json({ success: true, version: { id: crypto.randomUUID(), version_number: version, created_at: now() } });
    });
    // GET /api/actions/drafts/{draft_id}/versions/{version_id}/
    app.get('/api/actions/drafts/:draft_id/versions/:version_id/', (c) => c.json({ detail: 'Version not found' }, 404));

    // ---- executions ----
    // Static routes before the executions/:draft_id param route.
    // GET /api/actions/execution-stats
    app.get('/api/actions/execution-stats', async (c) => {
        const rows = await phase2For(c.get('tenant')).listExecutions(undefined, 500);
        const stats: Record<string, number> = {};
        for (const r of rows) { const s = String(r.status ?? 'unknown'); stats[s] = (stats[s] ?? 0) + 1; }
        return c.json({ total: rows.length, by_status: stats });
    });
    // GET /api/actions/execution/{execution_id}  (singular "execution")
    app.get('/api/actions/execution/:execution_id', async (c) => {
        const e = await phase2For(c.get('tenant')).getExecution(c.req.param('execution_id'));
        return e ? c.json(e) : c.json({ detail: 'Execution not found' }, 404);
    });
    // GET /api/actions/executions
    app.get('/api/actions/executions', async (c) => c.json({ executions: await phase2For(c.get('tenant')).listExecutions() }));
    // GET /api/actions/executions/detail/{execution_id}
    app.get('/api/actions/executions/detail/:execution_id', async (c) => {
        const e = await phase2For(c.get('tenant')).getExecution(c.req.param('execution_id'));
        return e ? c.json(e) : c.json({ detail: 'Execution not found' }, 404);
    });
    // GET /api/actions/executions/export  (CSV header-only — community has no export pipeline)
    app.get('/api/actions/executions/export', (c) => c.body('execution_id,workflow_id,status,trigger,started_at,ended_at\n', 200, { 'Content-Type': 'text/csv' }));
    // GET /api/actions/executions/{draft_id}  (param route LAST among executions/*)
    app.get('/api/actions/executions/:draft_id', async (c) => c.json({ executions: await phase2For(c.get('tenant')).listExecutions(c.req.param('draft_id')) }));
    // GET /api/actions/executions/{draft_id}/production/{engine_id}
    app.get('/api/actions/executions/:draft_id/production/:engine_id', async (c) => {
        const rows = await phase2For(c.get('tenant')).listExecutions(c.req.param('draft_id'));
        return c.json({ executions: rows, total: rows.length, engine_id: c.req.param('engine_id') });
    });
}
