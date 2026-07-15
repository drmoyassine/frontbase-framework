/**
 * CF-22 P2 Wave 1b — the `database` tag (10 ops): datasource connection state +
 * table introspection. Community default has no external datasource configured,
 * so introspection ops return the product's graceful "not configured / empty"
 * shapes (the same shapes FastAPI returns when Supabase isn't connected —
 * verified against the vendored spec, not invented). Connection state lives in
 * the KeyValueStore; real introspection (F7 runners) wires in when a datasource
 * is configured.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerDatabaseRoutes(app: App, kvFor: (t: string) => KeyValueStore, now: () => string): void {
    // GET /api/database/connections/
    app.get('/api/database/connections/', async (c) => {
        const conn = await kvFor(c.get('tenant')).getJson<{ connected?: boolean }>('db_connection', {});
        return c.json({ supabase: { connected: !!conn.connected, url: '', hasServiceKey: !!conn.connected } });
    });
    // POST /api/database/test-supabase/
    app.post('/api/database/test-supabase/', (c) => c.json({ success: false, message: 'No Supabase connection configured' }));
    // POST /api/database/connect-supabase/
    app.post('/api/database/connect-supabase/', async (c) => {
        await kvFor(c.get('tenant')).setJson('db_connection', { connected: true }, now());
        return c.json({ success: true, message: 'Connected' });
    });
    // DELETE /api/database/disconnect-supabase/
    app.delete('/api/database/disconnect-supabase/', async (c) => {
        await kvFor(c.get('tenant')).setJson('db_connection', { connected: false }, now());
        return c.json({ success: true, message: 'Disconnected' });
    });
    // GET /api/database/tables/  +  /api/database/supabase-tables/  (not configured → empty)
    const emptyTables = { success: true, data: { tables: [] }, message: null, error: null };
    app.get('/api/database/tables/', (c) => c.json(emptyTables));
    app.get('/api/database/supabase-tables/', (c) => c.json(emptyTables));
    // GET /api/database/table-data/{table_name}/
    app.get('/api/database/table-data/:table_name/', (c) => c.json({ success: true, message: 'Data retrieved successfully', data: [], total: 0 }));
    // GET /api/database/table-schema/{table_name}/
    app.get('/api/database/table-schema/:table_name/', (c) => c.json({ success: true, data: { table_name: c.req.param('table_name'), columns: [] }, error: null }));
    // POST /api/database/advanced-query/
    app.post('/api/database/advanced-query/', (c) => c.json({ success: false, data: [], rows: [], error: 'No datasource configured' }));
    // POST /api/database/distinct-values/
    app.post('/api/database/distinct-values/', (c) => c.json({ success: true, data: [], error: null }));
}
