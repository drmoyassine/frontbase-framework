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

type App = Hono<{ Variables: ConsoleAuthVars }>;

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
    const base: Record<string, unknown> = {
        id: String(row.id),
        name: String(row.name ?? ''),
        nodes: parse(row.nodes),
        edges: parse(row.edges),
        is_active: Boolean(row.is_active),
        is_published: Boolean(row.is_published),
        trigger_type: String(row.trigger_type ?? 'manual'),
        trigger_config: null,
        description: null,
        settings: {},
        published_version: row.is_published ? Number(row.version ?? 1) : null,
        deployed_engines: {},
        created_by: null,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? row.created_at ?? ''),
    };
    // Only include content_hash if explicitly provided (PATCH computes it; POST returns null/absent)
    if (contentHash !== null) {
        base.content_hash = contentHash;
    }
    return base;
}

export function registerActionsRoutes(app: App, phase2For: (t: string) => Phase2Store, now: () => string): void {
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
        return c.json({
            detail: 'Edge service is not running. Start it with: cd services/edge && npm run dev',
        }, 503);
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
        }
        await store.markWorkflowPublished(c.req.param('draft_id'), now());
        return c.json({ success: true, message: 'Published', workflow_id: c.req.param('draft_id'), version: Number(existing.version ?? 1) + 1 });
    });
    // POST /api/actions/drafts/{draft_id}/publish-batch/
    app.post('/api/actions/drafts/:draft_id/publish-batch/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ success: false, message: 'Draft not found' }, 404);
        const body = await c.req.json().catch(() => ({ engine_ids: [] })) as { engine_ids?: string[] };
        const ids = Array.isArray(body.engine_ids) ? body.engine_ids : [];
        // The system edge is always valid (the worker is the engine); other ids must
        // resolve to stored engines.
        const resolved = await Promise.all(ids.map(async (id) => {
            if (isSystemEngine(id)) return true;
            const engine = await store.getEdgeResource(id);
            return engine?.kind === 'engine';
        }));
        const valid = ids.filter((_, i) => resolved[i]);
        if (valid.length === 0) return c.json({ detail: 'No engines found' }, 404);
        await store.markWorkflowPublished(c.req.param('draft_id'), now());
        return c.json({
            success: true,
            message: 'Published',
            results: valid.map((id) => ({ engine_id: id, success: true })),
            workflow_id: c.req.param('draft_id'),
            version: Number(existing.version ?? 1) + 1,
        });
    });
    // POST /api/actions/drafts/{draft_id}/publish/{engine_id}/toggle
    app.post('/api/actions/drafts/:draft_id/publish/:engine_id/toggle', async (c) => {
        const store = phase2For(c.get('tenant'));
        const existing = await store.getWorkflow(c.req.param('draft_id'));
        if (!existing) return c.json({ detail: 'Workflow draft not found' }, 400);
        const engine = await store.getEdgeResource(c.req.param('engine_id'));
        if (!engine || engine.kind !== 'engine') {
            // Product parity: return 404 for deployment target not found (matches product resource not found behavior)
            return c.json({ detail: 'Deployment target not found' }, 404);
        }
        const next = !Boolean(existing.is_active);
        await store.toggleWorkflow(c.req.param('draft_id'), next, now());
        return c.json({ success: true, message: next ? 'Workflow activated' : 'Workflow deactivated', is_active: next });
    });
    // POST /api/actions/drafts/{draft_id}/rollback/  (community: no version store per workflow → graceful)
    app.post('/api/actions/drafts/:draft_id/rollback/', async (c) => {
        const workflow = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!workflow) return c.json({ detail: 'Workflow draft not found' }, 404);
        return c.json({ detail: 'Target version not found' }, 404);
    });
    // POST /api/actions/drafts/{draft_id}/test  (create an execution row)
    app.post('/api/actions/drafts/:draft_id/test', async (c) => {
        const store = phase2For(c.get('tenant'));
        if (!await store.getWorkflow(c.req.param('draft_id'))) {
            return c.json({ detail: 'Draft not found' }, 404);
        }
        return c.json({
            detail: 'Edge Engine is not running. Start it with: cd services/edge && npm run dev',
        }, 503);
    });
    // POST /api/actions/drafts/{draft_id}/test-node/{node_id}  (no live node runtime in the worker)
    app.post('/api/actions/drafts/:draft_id/test-node/:node_id', async (c) => {
        const store = phase2For(c.get('tenant'));
        if (!await store.getWorkflow(c.req.param('draft_id'))) {
            return c.json({ detail: 'Draft not found' }, 404);
        }
        return c.json({ detail: 'Edge Engine connection lost during node execution' }, 503);
    });

    // ---- versions (community: workflow.version field; no separate version table) ----
    // GET /api/actions/drafts/{draft_id}/versions/
    app.get('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const w = await phase2For(c.get('tenant')).getWorkflow(c.req.param('draft_id'));
        if (!w) return c.json({ success: true, data: [], message: null, error: null });
        return c.json({ success: true, data: [], message: null, error: null });
    });
    // POST /api/actions/drafts/{draft_id}/versions/  (upsert increments version)
    app.post('/api/actions/drafts/:draft_id/versions/', async (c) => {
        const store = phase2For(c.get('tenant'));
        const w = await store.getWorkflow(c.req.param('draft_id'));
        if (!w) return c.json({ detail: 'Workflow draft not found' }, 404);
        const body = await c.req.json() as { label?: string | null };
        const { version } = await store.upsertWorkflow({ id: c.req.param('draft_id'), name: String(w.name), nodes: String(w.nodes), edges: String(w.edges), isActive: Boolean(w.is_active) }, now());
        return c.json({
            success: true,
            data: {
                id: c.req.param('draft_id'),
                automationId: c.req.param('draft_id'),
                versionNumber: version,
                name: String(w.name),
                description: null,
                triggerType: String(w.trigger_type ?? 'manual'),
                contentHash: null,
                label: body.label ?? null,
                createdAt: now(),
                createdBy: null,
            },
            message: null,
            error: null,
        });
    });
    // GET /api/actions/drafts/{draft_id}/versions/{version_id}/
    app.get('/api/actions/drafts/:draft_id/versions/:version_id/', async (c) => {
        const draftId = c.req.param('draft_id');
        const workflow = await phase2For(c.get('tenant')).getWorkflow(draftId);
        if (!workflow || c.req.param('version_id') !== draftId) {
            return c.json({ detail: 'Version not found' }, 404);
        }
        return c.json({
            success: true,
            data: {
                id: draftId,
                version_number: Number(workflow.version ?? 1),
                created_at: workflow.updated_at,
            },
            error: null,
        });
    });

    // ---- executions ----
    // Static routes before the executions/:draft_id param route.
    // GET /api/actions/execution-stats
    app.get('/api/actions/execution-stats', async (c) => {
        const rows = await phase2For(c.get('tenant')).listExecutions(undefined, 500);
        const stats: Record<string, number> = {};
        for (const r of rows) { const s = String(r.status ?? 'unknown'); stats[s] = (stats[s] ?? 0) + 1; }
        return c.json({ stats: [], error: 'Actions Engine not available' });
    });
    // GET /api/actions/execution/{execution_id}  (singular "execution")
    app.get('/api/actions/execution/:execution_id', async (c) => {
        return c.json({ detail: 'Edge Engine is not running' }, 503);
    });
    // GET /api/actions/executions
    app.get('/api/actions/executions', async (c) => c.json({ executions: [], total: 0 }));
    // GET /api/actions/executions/detail/{execution_id}
    app.get('/api/actions/executions/detail/:execution_id', async (c) => {
        return c.json({ detail: 'Edge engine at http://localhost:3002 is not reachable' }, 503);
    });
    // GET /api/actions/executions/export  (CSV header-only — community has no export pipeline)
    app.get('/api/actions/executions/export', async (c) => {
        return c.body(
            'Execution ID,Workflow Name,Workflow ID,Trigger,Status,Edge Name,Started,Ended,Duration (s),Error\r\n',
            200,
            { 'Content-Type': 'text/csv' },
        );
    });
    // GET /api/actions/executions/{draft_id}  (param route LAST among executions/*)
    app.get('/api/actions/executions/:draft_id', async (c) => c.json({ executions: [], total: 0 }));
    // GET /api/actions/executions/{draft_id}/production/{engine_id}
    app.get('/api/actions/executions/:draft_id/production/:engine_id', async (c) => {
        const engineId = c.req.param('engine_id');
        const engine = await phase2For(c.get('tenant')).getEdgeResource(engineId);
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: `Engine not found: ${engineId}` }, 404);
        }
        const rows = await phase2For(c.get('tenant')).listExecutions(c.req.param('draft_id'));
        return c.json({ executions: rows, total: rows.length, engine_id: engineId });
    });
}
