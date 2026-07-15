/**
 * CF-22 P2 Wave 1b — the `rls` tag (14 ops): row-level-security policy +
 * metadata management. RLS is a Supabase/Postgres feature; the community default
 * has no datasource, so policy ops return the product's graceful acks (can't
 * manage policies without a connected database). Metadata (the form-state the
 * console stores to re-open the policy editor) is persisted locally in the
 * KeyValueStore so the console's RLS UI round-trips. Shapes match the vendored
 * RlsListEnvelope / RlsMessageEnvelope / RlsDataEnvelope / RlsVerifyEnvelope.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerRlsRoutes(app: App, kvFor: (t: string) => KeyValueStore): void {
    // ---- policies (graceful: no datasource) ----
    app.get('/api/database/rls/policies/', (c) => c.json({ success: true, data: [], error: null }));
    app.get('/api/database/rls/tables/', (c) => c.json({ success: true, data: [], error: null }));
    app.get('/api/database/rls/policies/:table_name', (c) => c.json({ success: true, data: [], error: null }));
    app.post('/api/database/rls/policies/', (c) => c.json({ success: false, message: 'No datasource configured', error: null }));
    app.put('/api/database/rls/policies/:table_name/:policy_name', (c) => c.json({ success: false, message: 'No datasource configured', error: null }));
    app.delete('/api/database/rls/policies/:table_name/:policy_name', (c) => c.json({ success: false, message: 'No datasource configured', error: null }));
    app.post('/api/database/rls/tables/:table_name/toggle/', (c) => c.json({ success: false, message: 'No datasource configured', error: null }));
    app.post('/api/database/rls/batch/', (c) => c.json({ success: false, message: 'Batch creation completed (no datasource)', error: null }));
    app.post('/api/database/rls/bulk-delete/', (c) => c.json({ success: true, message: 'Deleted 0 policies', error: null }));

    // ---- metadata (local form-state; round-trips in the console) ----
    app.get('/api/database/rls/metadata/', async (c) => c.json({ success: true, data: await kvFor(c.get('tenant')).getJson('rls_metadata', []), error: null }));
    app.get('/api/database/rls/metadata/:table_name/:policy_name', async (c) => {
        const all = await kvFor(c.get('tenant')).getJson<Array<{ tableName: string; policyName: string }>>('rls_metadata', []);
        const found = all.find((m) => m.tableName === c.req.param('table_name') && m.policyName === c.req.param('policy_name'));
        return c.json({ success: true, data: found ?? null, error: null });
    });
    app.post('/api/database/rls/metadata/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { tableName?: string; policyName?: string };
        const all = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('rls_metadata', []);
        const idx = all.findIndex((m) => (m as { tableName?: string }).tableName === body.tableName && (m as { policyName?: string }).policyName === body.policyName);
        const entry = { ...body, tableName: body.tableName, policyName: body.policyName };
        if (idx >= 0) all[idx] = entry; else all.push(entry);
        await kvFor(c.get('tenant')).setJson('rls_metadata', all, '');
        return c.json({ success: true, data: { tableName: body.tableName, policyName: body.policyName }, error: null });
    });
    app.delete('/api/database/rls/metadata/:table_name/:policy_name', async (c) => {
        const all = await kvFor(c.get('tenant')).getJson<Array<{ tableName: string; policyName: string }>>('rls_metadata', []);
        await kvFor(c.get('tenant')).setJson('rls_metadata', all.filter((m) => !(m.tableName === c.req.param('table_name') && m.policyName === c.req.param('policy_name'))), '');
        return c.json({ success: true, message: 'Metadata deleted', error: null });
    });
    app.post('/api/database/rls/metadata/verify/', (c) => c.json({ success: true, data: { hasMetadata: false, isVerified: false, reason: 'no_metadata' }, error: null }));
}
