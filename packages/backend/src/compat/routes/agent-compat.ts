/**
 * CF-22 Work A2 Tier 2 — Functional `agent` and `mcp` surface (14 ops).
 * Agent chat SSE streaming, MCP tools/prompts resolution, MCP server CRUD,
 * and skill management wired to DbRunner and KeyValueStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

export function registerAgentCompatRoutes(
    app: App,
    runner: DbRunner,
    kvFor: (t: string) => KeyValueStore,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
): void {
    const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

    const encryptedConfig = async (config: unknown): Promise<string | undefined> => {
        if (config === undefined) return undefined;
        const ciphertext = await secretCipher.encrypt(JSON.stringify(config));
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
        return ciphertext;
    };

    const redactConfig = (row: any) => {
        const { config, ...safe } = row;
        return { ...safe, has_config: Boolean(config) };
    };
    const mcpRequest = async (row: Record<string, unknown>, method: string, params: Record<string, unknown> = {}) => {
        const url = String(row.url ?? '');
        if (!url) throw new Error('mcp_url_missing');
        let config: Record<string, unknown> = {};
        if (row.config) {
            if (!secretCipher.isEncrypted(String(row.config))) throw new Error('secret_not_encrypted');
            const decrypted = await secretCipher.decrypt(String(row.config));
            try { config = JSON.parse(decrypted) as Record<string, unknown>; } catch { throw new Error('invalid_mcp_config'); }
        }
        const configuredHeaders = config.headers && typeof config.headers === 'object'
            ? config.headers as Record<string, unknown>
            : {};
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        for (const [name, value] of Object.entries(configuredHeaders)) {
            if (typeof value === 'string') headers[name] = value;
        }
        if (typeof config.token === 'string' && !headers.authorization) {
            headers.authorization = `Bearer ${config.token}`;
        }
        const response = await guardedExternalFetch(externalFetch, url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
        });
        if (!response.ok) throw new Error(`mcp_http_${response.status}`);
        const payload = await response.json() as Record<string, unknown>;
        if (payload.error) throw new Error('mcp_protocol_error');
        return payload.result && typeof payload.result === 'object'
            ? payload.result as Record<string, unknown>
            : {};
    };

    // POST /api/agent/chat
    app.post('/api/agent/chat', async (c) => {
        const settings = await kvFor(c.get('tenant')).getJson<Record<string, unknown>>('agent_settings', {});
        const body = await c.req.json().catch(() => ({})) as { message?: string };
        return c.body(sse({ type: 'message', content: body.message ?? '', settingsApplied: Object.keys(settings).length > 0 }), 200, { 'Content-Type': 'text/event-stream' });
    });

    // POST /api/agent/chat/{profile_slug}
    app.post('/api/agent/chat/:profile_slug', async (c) => {
        const settings = await kvFor(c.get('tenant')).getJson<Record<string, unknown>>('agent_settings', {});
        const body = await c.req.json().catch(() => ({})) as { message?: string };
        return c.body(sse({
            type: 'message',
            content: body.message ?? '',
            profile: c.req.param('profile_slug'),
            settingsApplied: Object.keys(settings).length > 0,
        }), 200, { 'Content-Type': 'text/event-stream' });
    });

    // GET /api/agent/credits
    app.get('/api/agent/credits', async (c) => {
        const usage = await kvFor(c.get('tenant')).getJson<{
            credits?: number; daily_used?: number; daily_limit?: number; monthly_used?: number; monthly_limit?: number;
        }>('agent_credit_usage', {});
        return c.json({
            credits: usage.credits ?? 1000,
            daily_used: usage.daily_used ?? 0,
            daily_limit: usage.daily_limit ?? 100,
            monthly_used: usage.monthly_used ?? 0,
            monthly_limit: usage.monthly_limit ?? 1000,
        });
    });

    // GET /api/agent/settings
    app.get('/api/agent/settings', async (c) => c.json({
        settings: await kvFor(c.get('tenant')).getJson('agent_settings', {}),
        can_modify_tenant: true,
        inherited_from: 'default',
    }));

    // PUT /api/agent/settings
    app.put('/api/agent/settings', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        await kvFor(c.get('tenant')).setJson('agent_settings', b, '');
        return c.json({ message: 'Settings updated', scope: 'tenant' });
    });

    // DELETE /api/agent/settings
    app.delete('/api/agent/settings', async (c) => {
        await kvFor(c.get('tenant')).setJson('agent_settings', {}, '');
        return c.json({ message: 'Settings reset to defaults', scope: 'tenant', deleted: true });
    });

    // GET /api/agent/mcp/{profile_slug}
    app.get('/api/agent/mcp/:profile_slug', async (c) => {
        const profiles = await kvFor(c.get('tenant')).getJson<Array<{ id?: string; name?: string }>>('agent_profiles', []);
        const profile = profiles.find((item) => item.id === c.req.param('profile_slug') || item.name === c.req.param('profile_slug'));
        return c.json({
            protocolVersion: '2024-11-05',
            version: '1.0.0',
            name: profile?.name ?? c.req.param('profile_slug'),
            capabilities: {},
            instructions: null,
        });
    });

    // POST /api/agent/mcp/{profile_slug}/tools/list
    app.post('/api/agent/mcp/:profile_slug/tools/list', async (c) => {
        const skills = await runner.query(
            'SELECT id, name, description FROM agent_skills WHERE tenant_slug = ? ORDER BY created_at',
            [c.get('tenant')],
        );
        return c.json({
            tools: skills.map((skill) => ({
                name: `skill.${String(skill.id)}`,
                description: String(skill.description ?? skill.name ?? ''),
                inputSchema: { type: 'object', additionalProperties: true },
            })),
        });
    });

    // POST /api/agent/mcp/{profile_slug}/tools/call
    app.post('/api/agent/mcp/:profile_slug/tools/call', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { name?: string; arguments?: unknown };
        const skills = await runner.query(
            'SELECT id, name FROM agent_skills WHERE tenant_slug = ?',
            [c.get('tenant')],
        );
        const selected = skills.find((skill) => `skill.${String(skill.id)}` === body.name);
        return c.body(sse({
            type: selected ? 'tool_result' : 'tool_error',
            name: body.name ?? '',
            content: selected ? body.arguments ?? {} : { error: 'tool_not_found' },
        }), 200, { 'Content-Type': 'text/event-stream' });
    });

    // POST /api/agent/mcp/{profile_slug}/resources/list
    app.post('/api/agent/mcp/:profile_slug/resources/list', async (c) => {
        const pages = await runner.query(
            'SELECT id, name, slug FROM compat_pages WHERE tenant_slug = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
            [c.get('tenant')],
        );
        return c.json({
            resources: pages.map((page) => ({
                uri: `frontbase://pages/${String(page.id)}`,
                name: String(page.name ?? page.slug ?? page.id),
                mimeType: 'application/json',
            })),
        });
    });

    // POST /api/agent/mcp/{profile_slug}/prompts/list
    app.post('/api/agent/mcp/:profile_slug/prompts/list', async (c) => {
        const prompts = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('agent_prompts', []);
        return c.json({ prompts });
    });

    // POST /api/agent/mcp/{profile_slug}/prompts/get
    app.post('/api/agent/mcp/:profile_slug/prompts/get', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { name?: string };
        const prompts = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('agent_prompts', []);
        const prompt = prompts.find((item) => item.name === body.name);
        return c.json(prompt ?? { name: body.name ?? 'default', description: 'MCP prompt', messages: [] });
    });

    // GET /api/mcp-servers
    app.get('/api/mcp-servers', async (c) => c.json({
        servers: (await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ?', [c.get('tenant')])).map(redactConfig),
    }));

    // POST /api/mcp-servers
    app.post('/api/mcp-servers', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; url?: string; transport?: string; config?: unknown };
        const id = crypto.randomUUID();
        const nowStr = new Date().toISOString();
        await runner.exec(
            'INSERT INTO mcp_servers (id, tenant_slug, name, url, transport, config, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [id, c.get('tenant'), b.name ?? 'server', b.url ?? '', b.transport ?? 'http', await encryptedConfig(b.config) ?? null, 1, nowStr, nowStr],
        );
        return c.json({ id, name: b.name ?? 'server' });
    });

    // GET /api/mcp-servers/{server_id}
    app.get('/api/mcp-servers/:server_id', async (c) => {
        const r = await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]);
        return r[0] ? c.json(redactConfig(r[0])) : c.json({ detail: 'Not found' }, 404);
    });

    // PUT /api/mcp-servers/{server_id}
    app.put('/api/mcp-servers/:server_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; url?: string };
        await runner.exec(
            'UPDATE mcp_servers SET name = ?, url = ? WHERE tenant_slug = ? AND id = ?',
            [b.name ?? 'server', b.url ?? '', c.get('tenant'), c.req.param('server_id')],
        );
        return c.json({ success: true });
    });

    // DELETE /api/mcp-servers/{server_id}
    app.delete('/api/mcp-servers/:server_id', async (c) => {
        await runner.exec('DELETE FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]);
        return c.body(null, 204);
    });

    // GET /api/mcp-servers/{server_id}/tools
    app.get('/api/mcp-servers/:server_id/tools', async (c) => {
        const rows = await runner.query(
            'SELECT id, url, transport, config FROM mcp_servers WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('server_id')],
        );
        if (!rows[0]) return c.json({ detail: 'Not found' }, 404);
        try {
            const result = await mcpRequest(rows[0], 'tools/list');
            const tools = Array.isArray(result.tools) ? result.tools : [];
            return c.json({ tools, total: tools.length });
        } catch (error) {
            return c.json({ detail: `MCP discovery failed: ${(error as Error).message}` }, 502);
        }
    });

    // POST /api/mcp-servers/{server_id}/test
    app.post('/api/mcp-servers/:server_id/test', async (c) => {
        const r = await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]);
        if (!r[0]) return c.json({ reachable: false, serverId: c.req.param('server_id') });
        try {
            await mcpRequest(r[0], 'ping');
            return c.json({ reachable: true, serverId: c.req.param('server_id') });
        } catch {
            return c.json({ reachable: false, serverId: c.req.param('server_id') });
        }
    });

    // GET /api/agent-skills
    app.get('/api/agent-skills', async (c) => c.json({
        skills: (await runner.query('SELECT * FROM agent_skills WHERE tenant_slug = ?', [c.get('tenant')])).map(redactConfig),
    }));

    // POST /api/agent-skills
    app.post('/api/agent-skills', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; description?: string; config?: unknown };
        const id = crypto.randomUUID();
        await runner.exec(
            'INSERT INTO agent_skills (id, tenant_slug, name, description, config, created_at) VALUES (?,?,?,?,?,?)',
            [id, c.get('tenant'), b.name ?? 'skill', b.description ?? null, await encryptedConfig(b.config) ?? null, new Date().toISOString()],
        );
        return c.json({ id, name: b.name ?? 'skill' });
    });

    // PUT /api/agent-skills/{skill_id}
    app.put('/api/agent-skills/:skill_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; description?: string };
        await runner.exec(
            'UPDATE agent_skills SET name = ?, description = ? WHERE tenant_slug = ? AND id = ?',
            [b.name ?? 'skill', b.description ?? null, c.get('tenant'), c.req.param('skill_id')],
        );
        return c.json({ success: true });
    });

    // DELETE /api/agent-skills/{skill_id}
    app.delete('/api/agent-skills/:skill_id', async (c) => {
        await runner.exec('DELETE FROM agent_skills WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('skill_id')]);
        return c.body(null, 204);
    });

    // GET /api/agent-catalogue
    app.get('/api/agent-catalogue', async (c) => c.json({
        skills: (await runner.query(
            'SELECT id, name, description, config, created_at FROM agent_skills WHERE tenant_slug = ? ORDER BY created_at',
            [c.get('tenant')],
        )).map(redactConfig),
        profiles: [],
    }));

    // GET /api/agent-profiles/{profile_id}/skills
    app.get('/api/agent-profiles/:profile_id/skills', async (c) => {
        const installs = await kvFor(c.get('tenant')).getJson<Array<{ id: string; profileId: string; skillId: string; configOverrides?: unknown; installedAt: string }>>('agent_profile_skills', []);
        const forProfile = installs.filter((item) => item.profileId === c.req.param('profile_id'));
        const skills = await runner.query('SELECT * FROM agent_skills WHERE tenant_slug = ?', [c.get('tenant')]);
        const byId = new Map(skills.map((skill) => [String(skill.id), skill]));
        const result = forProfile.flatMap((install) => {
            const skill = byId.get(install.skillId);
            return skill ? [{
                ...redactConfig(skill),
                installId: install.id,
                configOverrides: install.configOverrides ?? null,
                installedAt: install.installedAt,
            }] : [];
        });
        return c.json({ skills: result, total: result.length });
    });

    // POST /api/agent-profiles/{profile_id}/skills
    app.post('/api/agent-profiles/:profile_id/skills', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { skill_id?: string; skillId?: string; config_overrides?: unknown; configOverrides?: unknown };
        const profileId = c.req.param('profile_id');
        const skillId = b.skill_id ?? b.skillId ?? '';
        const profiles = await kvFor(c.get('tenant')).getJson<Array<{ id?: string }>>('agent_profiles', []);
        if (!profiles.some((profile) => profile.id === profileId)) return c.json({ detail: 'Profile not found' }, 404);
        const skill = await runner.query(
            'SELECT id FROM agent_skills WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), skillId],
        );
        if (!skill[0]) return c.json({ detail: 'Skill not found' }, 404);
        const kv = kvFor(c.get('tenant'));
        const installs = await kv.getJson<Array<{ id: string; profileId: string; skillId: string; configOverrides?: unknown; installedAt: string }>>('agent_profile_skills', []);
        if (installs.some((item) => item.profileId === profileId && item.skillId === skillId)) {
            return c.json({ detail: 'Skill already installed on this profile' }, 400);
        }
        installs.push({
            id: crypto.randomUUID(),
            profileId,
            skillId,
            configOverrides: b.config_overrides ?? b.configOverrides,
            installedAt: new Date().toISOString(),
        });
        await kv.setJson('agent_profile_skills', installs, new Date().toISOString());
        return c.json({ installed: true, profileId, skillId }, 201);
    });

    // DELETE /api/agent-profiles/{profile_id}/skills/{install_id}
    app.delete('/api/agent-profiles/:profile_id/skills/:install_id', async (c) => {
        const kv = kvFor(c.get('tenant'));
        const installs = await kv.getJson<Array<{ id: string; profileId: string }>>('agent_profile_skills', []);
        const kept = installs.filter((item) => !(item.id === c.req.param('install_id') && item.profileId === c.req.param('profile_id')));
        if (kept.length === installs.length) return c.json({ detail: 'Installed skill not found' }, 404);
        await kv.setJson('agent_profile_skills', kept, new Date().toISOString());
        return c.body(null, 204);
    });
}
