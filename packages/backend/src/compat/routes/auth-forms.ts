import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;
const COLS = 'id, tenant_slug, name, type, config, is_primary, created_at, updated_at';

export function registerAuthFormsRoutes(app: App, runner: DbRunner, now: () => string): void {
    app.get('/api/auth-forms/', async (c) => c.json({ forms: await runner.query(`SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ?`, [c.get('tenant')]) }));
    app.post('/api/auth-forms/', async (c) => {
        const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); const ts = now();
        await runner.exec('INSERT INTO auth_forms (id, tenant_slug, name, type, config, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', [id, c.get('tenant'), b.name ?? 'form', b.type ?? 'login', b.config ? JSON.stringify(b.config) : null, 0, ts, ts]);
        return c.json({ id, name: b.name ?? 'form', type: b.type ?? 'login', config: b.config, is_primary: false, created_at: ts, updated_at: ts }, 201);
    });
    app.get('/api/auth-forms/primary/', async (c) => { const r = await runner.query(`SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND is_primary = 1`, [c.get('tenant')]); return r[0] ? c.json(r[0]) : c.json({ detail: 'No primary form' }, 404); });
    app.get('/api/auth-forms/:form_id/', async (c) => { const r = await runner.query(`SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`, [c.get('tenant'), c.req.param('form_id')]); return r[0] ? c.json(r[0]) : c.json({ detail: 'Not found' }, 404); });
    app.put('/api/auth-forms/:form_id/', async (c) => { const b = await c.req.json().catch(() => ({})); await runner.exec('UPDATE auth_forms SET name = ?, config = ?, updated_at = ? WHERE tenant_slug = ? AND id = ?', [b.name ?? 'form', b.config ? JSON.stringify(b.config) : null, now(), c.get('tenant'), c.req.param('form_id')]); return c.json({ success: true }); });
    app.delete('/api/auth-forms/:form_id/', async (c) => { await runner.exec('DELETE FROM auth_forms WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('form_id')]); return c.json({ success: true, message: 'Form deleted' }); });
    app.put('/api/auth-forms/:form_id/set-primary/', async (c) => { await runner.exec('UPDATE auth_forms SET is_primary = 0 WHERE tenant_slug = ?', [c.get('tenant')]); await runner.exec('UPDATE auth_forms SET is_primary = 1 WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('form_id')]); return c.json({ success: true }); });
}
