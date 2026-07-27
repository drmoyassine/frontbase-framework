import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { DbRunner } from '@frontbase/edge-infra';
import type { KeyValueStore } from '../store.js';
export function registerAgentCompatRoutes(app: App, runner: DbRunner, kvFor: (t: string) => KeyValueStore): void {
    app.post('/api/agent/chat', (c) => c.json({ success: false, detail: 'No LLM provider configured' }));
    app.post('/api/agent/chat/:profile_slug', (c) => c.json({ success: false, detail: 'No LLM provider configured' }));
    app.get('/api/agent/credits', (c) => c.json({ credits: -1, daily_used: 0, daily_limit: -1, monthly_used: 0, monthly_limit: -1 }));
    // Contract (bf1ac54) requires SettingsResponse {settings, can_modify_tenant?, inherited_from?}.
    app.get('/api/agent/settings', async (c) => c.json({
        settings: await kvFor(c.get('tenant')).getJson('agent_settings', {}),
        can_modify_tenant: true,
        inherited_from: 'default', // community merges one layer only
    }));
    app.put('/api/agent/settings', async (c) => { const b = await c.req.json().catch(() => ({})); await kvFor(c.get('tenant')).setJson('agent_settings', b, ''); return c.json(b); });
    app.delete('/api/agent/settings', async (c) => { await kvFor(c.get('tenant')).setJson('agent_settings', {}, ''); return c.json({ success: true }); });
    app.get('/api/agent/mcp/:profile_slug', (c) => c.json({}));
    app.post('/api/agent/mcp/:profile_slug/tools/list', (c) => c.json({ tools: [] }));
    app.post('/api/agent/mcp/:profile_slug/tools/call', (c) => c.body(null, 204));
    app.post('/api/agent/mcp/:profile_slug/resources/list', (c) => c.json({ resources: [] }));
    app.post('/api/agent/mcp/:profile_slug/prompts/list', (c) => c.json({ prompts: [] }));
    app.post('/api/agent/mcp/:profile_slug/prompts/get', (c) => c.json({}));
    app.get('/api/mcp-servers', async (c) => c.json({ servers: await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ?', [c.get('tenant')]) }));
    app.post('/api/mcp-servers', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); await runner.exec('INSERT INTO mcp_servers (id, tenant_slug, name, url, transport, config, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', [id, c.get('tenant'), b.name ?? 'server', b.url ?? '', b.transport ?? 'http', b.config ? JSON.stringify(b.config) : null, 1, new Date().toISOString(), new Date().toISOString()]); return c.json({ id, name: b.name }); });
    app.get('/api/mcp-servers/:server_id', async (c) => { const r = await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]); return r[0] ? c.json(r[0]) : c.json({ detail: 'Not found' }, 404); });
    app.put('/api/mcp-servers/:server_id', async (c) => { const b = await c.req.json().catch(() => ({})); await runner.exec('UPDATE mcp_servers SET name = ?, url = ? WHERE tenant_slug = ? AND id = ?', [b.name ?? 'server', b.url ?? '', c.get('tenant'), c.req.param('server_id')]); return c.json({ success: true }); });
    app.delete('/api/mcp-servers/:server_id', async (c) => { await runner.exec('DELETE FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]); return c.json({ success: true }); });
    app.get('/api/mcp-servers/:server_id/tools', (c) => c.json({ tools: [] }));
    app.post('/api/mcp-servers/:server_id/test', (c) => c.json({ success: false }));
    app.get('/api/agent-skills', async (c) => c.json({ skills: await runner.query('SELECT * FROM agent_skills WHERE tenant_slug = ?', [c.get('tenant')]) }));
    app.post('/api/agent-skills', async (c) => { const b = await c.req.json().catch(() => ({})); const id = crypto.randomUUID(); await runner.exec('INSERT INTO agent_skills (id, tenant_slug, name, description, config, created_at) VALUES (?,?,?,?,?,?)', [id, c.get('tenant'), b.name ?? 'skill', b.description ?? null, b.config ? JSON.stringify(b.config) : null, new Date().toISOString()]); return c.json({ id, name: b.name }); });
    app.put('/api/agent-skills/:skill_id', async (c) => { const b = await c.req.json().catch(() => ({})); await runner.exec('UPDATE agent_skills SET name = ?, description = ? WHERE tenant_slug = ? AND id = ?', [b.name ?? 'skill', b.description ?? null, c.get('tenant'), c.req.param('skill_id')]); return c.json({ success: true }); });
    app.delete('/api/agent-skills/:skill_id', async (c) => { await runner.exec('DELETE FROM agent_skills WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('skill_id')]); return c.json({ success: true }); });
    app.get('/api/agent-catalogue', (c) => c.json({ skills: [], profiles: [] }));
    app.get('/api/agent-profiles/:profile_id/skills', (c) => c.json({ skills: [] }));
    app.post('/api/agent-profiles/:profile_id/skills', (c) => c.json({}));
    app.delete('/api/agent-profiles/:profile_id/skills/:install_id', (c) => c.json({ success: true }));
}

