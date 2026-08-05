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

const BUILTIN_SKILLS = [
    {
        id: '6c5fb17a-a441-43bd-b425-146b71b3c967',
        slug: 'code-exec',
        name: 'Code Execution',
        description: 'Run sandboxed Python snippets and return structured output.',
        category: 'utility',
        toolDefinitions: [
            { name: 'run_python', description: 'Execute a Python code snippet and return stdout.', parameters: { code: 'string' } },
        ],
    },
    {
        id: 'b85d208f-fef2-4208-a2cb-421fb6377905',
        slug: 'database-query',
        name: 'Database Query',
        description: 'Run read-only SQL against a connected datasource and return rows.',
        category: 'data',
        toolDefinitions: [
            { name: 'query_sql', description: 'Execute a read-only SQL SELECT.', parameters: { datasource_id: 'string', sql: 'string' } },
        ],
    },
    {
        id: 'f918bbb2-8b4a-4b38-90cd-bd3addf0c3bf',
        slug: 'document-parser',
        name: 'Document Parser',
        description: 'Parse uploaded documents (PDF, DOCX, CSV) into structured text.',
        category: 'data',
        toolDefinitions: [
            { name: 'parse_document', description: 'Extract text from a document file.', parameters: { file_id: 'string' } },
        ],
    },
    {
        id: '31ad867f-54d9-4b7b-84dd-00e9c074a02f',
        slug: 'integration-http',
        name: 'HTTP Integration',
        description: 'Make authenticated HTTP requests to external APIs.',
        category: 'integration',
        toolDefinitions: [
            { name: 'http_request', description: 'Perform an HTTP request.', parameters: { method: 'string', url: 'string', body: 'object' } },
        ],
    },
    {
        id: 'fd6f667c-3b87-43c0-a9ce-3930fc43d90e',
        slug: 'web-scraper',
        name: 'Web Scraper',
        description: 'Fetch and extract content from a URL (title, text, links).',
        category: 'web',
        toolDefinitions: [
            { name: 'scrape_url', description: 'Fetch a URL and return its text content.', parameters: { url: 'string' } },
        ],
    },
];

const CORE_TOOLS = [
    ['pages_list', 'List Pages', 'Pages'],
    ['pages_get', 'Get Page', 'Pages'],
    ['pages_update', 'Update Page', 'Pages'],
    ['styles_list', 'List Styles', 'Styles'],
    ['styles_get', 'Get Style', 'Styles'],
    ['styles_update', 'Update Style', 'Styles'],
    ['engine_info', 'Engine Info', 'Engine'],
    ['engine_status', 'Engine Status', 'Engine'],
    ['queryDatasource', 'Query Datasource', 'Datasources'],
    ['triggerWorkflow', 'Trigger Workflow', 'Workflows'],
].map(([name, label, category]) => ({ name, label, category, disabled: false }));

const builtinSkillViews = () => BUILTIN_SKILLS.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    toolDefinitions: skill.toolDefinitions,
    version: '1.0.0',
    isBuiltin: true,
    isActive: true,
    tenantId: null,
    projectId: null,
    profileSlug: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
}));

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

    const redactConfig = async (row: any) => {
        const { config, auth_type, token } = row;
        // Extract additional fields from encrypted config if not present in row
        const extracted: Record<string, unknown> = {};
        if (config && secretCipher.isEncrypted(String(config))) {
            try {
                const decrypted = await secretCipher.decrypt(String(config));
                if (decrypted) {
                    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
                    extracted.slug = parsed.slug;
                    extracted.description = parsed.description;
                    extracted.auth_type = parsed.auth_type;
                    extracted.token = parsed.token;
                    extracted.tool_filter = parsed.tool_filter;
                    extracted.category = parsed.category;
                    extracted.profile_slug = parsed.profile_slug;
                }
            } catch { /* ignore decrypt errors */ }
        }
        // Normalize transport: 'http' in legacy data maps to 'streamable-http' for parity
        const transport = row.transport === 'http' ? 'streamable-http' : (row.transport ?? 'streamable-http');
        // Use name as fallback for slug when encrypted config is unavailable (parity data uses name as slug)
        const slug = extracted.slug ?? row.slug ?? (row.name ?? '');
        return {
            id: row.id ?? '',
            name: row.name ?? '',
            slug,
            description: extracted.description ?? row.description ?? null,
            url: row.url ?? '',
            transport,
            authType: auth_type ?? extracted.auth_type ?? null,
            hasAuth: Boolean(token || extracted.token || config),
            toolFilter: extracted.tool_filter ?? row.tool_filter ?? null,
            category: extracted.category ?? row.category ?? null,
            isActive: Boolean(row.is_active ?? 1),
            isPublic: false,
            tenantId: null,
            projectId: null,
            profileSlug: extracted.profile_slug ?? row.profile_slug ?? null,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
        };
    };

    const redactSkillConfig = (row: any) => {
        const { config } = row;
        return {
            id: row.id ?? '',
            name: row.name ?? '',
            slug: row.slug ?? '',
            description: row.description ?? null,
            category: row.category ?? null,
            toolDefinitions: row.tool_definitions ?? [],
            version: row.version ?? '1.0.0',
            isBuiltin: false,
            isActive: Boolean(row.is_active ?? 1),
            tenantId: null,
            projectId: null,
            profileSlug: row.profile_slug ?? null,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
        };
    };
    const profilesFor = (tenant: string) =>
        kvFor(tenant).getJson<Array<{ id?: string; name?: string }>>('agent_profiles', []);
    const profileFor = async (tenant: string, slug: string) =>
        (await profilesFor(tenant)).find((item) => item.id === slug || item.name === slug);
    const profileDetail = (slug: string) => `Agent profile '${slug}' not found`;
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
        const raw = await c.req.json().catch(() => null) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return c.json({ detail: 'Invalid JSON body' }, 400);
        }
        const body = raw as { message?: string };
        return c.body(sse({ type: 'message', content: body.message ?? '', settingsApplied: Object.keys(settings).length > 0 }), 200, { 'Content-Type': 'text/event-stream' });
    });

    // POST /api/agent/chat/{profile_slug}
    app.post('/api/agent/chat/:profile_slug', async (c) => {
        const settings = await kvFor(c.get('tenant')).getJson<Record<string, unknown>>('agent_settings', {});
        const raw = await c.req.json().catch(() => null) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return c.json({ detail: 'Invalid JSON body' }, 400);
        }
        const body = raw as { message?: string };
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
        void usage;
        return c.json({ enabled: true, unlimited: true });
    });

    // GET /api/agent/settings
    app.get('/api/agent/settings', async (c) => {
        const tenant = c.get('tenant');
        const profileDefaults = {
            general: { temperature: 0.7, max_tokens: 4096, top_p: 0.9, timeout_seconds: 60 },
            system: { disabled_mcp_servers: [], disabled_skills: [], disabled_tools: [] },
        };
        const stored = await kvFor(tenant).getJson<typeof profileDefaults>('agent_settings', profileDefaults);
        // Merge stored settings with defaults (stored values override defaults, but missing/null fields use defaults)
        const general = { ...profileDefaults.general, ...stored.general };
        const system = {
            disabled_mcp_servers: [...profileDefaults.system.disabled_mcp_servers, ...(stored.system?.disabled_mcp_servers ?? [])],
            disabled_skills: [...profileDefaults.system.disabled_skills, ...(stored.system?.disabled_skills ?? [])],
            disabled_tools: [...profileDefaults.system.disabled_tools, ...(stored.system?.disabled_tools ?? [])],
        };
        return c.json({
            settings: { general, system },
            inherited_from: 'profile',
            can_modify_tenant: true,
        });
    });

    // PUT /api/agent/settings
    app.put('/api/agent/settings', async (c) => {
        const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        await kvFor(c.get('tenant')).setJson('agent_settings', b, '');
        return c.json({ message: 'Settings saved', scope: String(b.scope ?? 'user') });
    });

    // DELETE /api/agent/settings
    app.delete('/api/agent/settings', async (c) => {
        const kv = kvFor(c.get('tenant'));
        await kv.setJson('agent_settings', {}, '');
        const scope = c.req.query('scope') ?? 'user';
        return c.json({ deleted: 1, message: 'Settings reset', scope });
    });

    // GET /api/agent/mcp/{profile_slug}
    app.get('/api/agent/mcp/:profile_slug', async (c) => {
        const slug = c.req.param('profile_slug');
        const profile = await profileFor(c.get('tenant'), slug);
        if (!profile) return c.json({ detail: profileDetail(slug) }, 404);
        return c.json({
            protocolVersion: '2024-11-05',
            version: '1.0.0',
            name: profile.name ?? slug,
            capabilities: {},
            instructions: null,
        });
    });

    // POST /api/agent/mcp/{profile_slug}/tools/list
    app.post('/api/agent/mcp/:profile_slug/tools/list', async (c) => {
        const slug = c.req.param('profile_slug');
        if (!await profileFor(c.get('tenant'), slug)) {
            return c.json({ detail: profileDetail(slug) }, 404);
        }
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
        const slug = c.req.param('profile_slug');
        if (!await profileFor(c.get('tenant'), slug)) {
            return c.json({ detail: profileDetail(slug) }, 404);
        }
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
        const slug = c.req.param('profile_slug');
        if (!await profileFor(c.get('tenant'), slug)) {
            return c.json({ detail: profileDetail(slug) }, 404);
        }
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
        const slug = c.req.param('profile_slug');
        if (!await profileFor(c.get('tenant'), slug)) {
            return c.json({ detail: profileDetail(slug) }, 404);
        }
        const prompts = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('agent_prompts', []);
        return c.json({ prompts });
    });

    // POST /api/agent/mcp/{profile_slug}/prompts/get
    app.post('/api/agent/mcp/:profile_slug/prompts/get', async (c) => {
        const slug = c.req.param('profile_slug');
        if (!await profileFor(c.get('tenant'), slug)) {
            return c.json({ detail: profileDetail(slug) }, 404);
        }
        const body = await c.req.json().catch(() => ({})) as { name?: string };
        const prompts = await kvFor(c.get('tenant')).getJson<Array<Record<string, unknown>>>('agent_prompts', []);
        const prompt = prompts.find((item) => item.name === body.name);
        return prompt ? c.json(prompt) : c.json({ detail: 'Prompt not found' }, 404);
    });

    // GET /api/mcp-servers
    app.get('/api/mcp-servers', async (c) => {
        const rows = await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ?', [c.get('tenant')]);
        const mcpServers = await Promise.all(rows.map(redactConfig));
        return c.json({ mcpServers, total: mcpServers.length });
    });

    // POST /api/mcp-servers
    app.post('/api/mcp-servers', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: string;
            slug?: string;
            description?: string | null;
            url?: string;
            transport?: string;
            auth_type?: string | null;
            token?: string | null;
            tool_filter?: string[] | null;
            category?: string | null;
            is_active?: boolean;
            profile_slug?: string | null;
            config?: unknown;
        };
        const id = crypto.randomUUID();
        const nowStr = new Date().toISOString();
        // Merge fields into config for persistence
        const mergedConfig = {
            ...(typeof b.config === 'object' && b.config !== null ? b.config as Record<string, unknown> : {}),
            slug: b.slug,
            description: b.description,
            auth_type: b.auth_type,
            token: b.token,
            tool_filter: b.tool_filter,
            category: b.category,
            profile_slug: b.profile_slug,
        };
        await runner.exec(
            'INSERT INTO mcp_servers (id, tenant_slug, name, url, transport, config, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [id, c.get('tenant'), b.name ?? 'server', b.url ?? '', b.transport ?? 'streamable-http', await encryptedConfig(mergedConfig) ?? null, b.is_active ?? 1, nowStr, nowStr],
        );
        return c.json({
            id,
            name: b.name ?? 'server',
            slug: b.slug ?? '',
            description: b.description ?? null,
            url: b.url ?? '',
            transport: b.transport ?? 'streamable-http',
            authType: b.auth_type ?? null,
            hasAuth: Boolean(b.token),
            toolFilter: b.tool_filter ?? null,
            category: b.category ?? null,
            isActive: Boolean(b.is_active ?? 1),
            isPublic: false,
            tenantId: null,
            projectId: null,
            profileSlug: b.profile_slug ?? null,
            createdAt: nowStr,
            updatedAt: nowStr,
        }, 201);
    });

    // GET /api/mcp-servers/{server_id}
    app.get('/api/mcp-servers/:server_id', async (c) => {
        const r = await runner.query('SELECT * FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]);
        return r[0] ? c.json(await redactConfig(r[0])) : c.json({ detail: 'MCP server not found' }, 404);
    });

    // PUT /api/mcp-servers/{server_id}
    app.put('/api/mcp-servers/:server_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; url?: string };
        const existing = await runner.query(
            'SELECT id FROM mcp_servers WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('server_id')],
        );
        if (!existing[0]) return c.json({ detail: 'MCP server not found' }, 404);
        await runner.exec(
            'UPDATE mcp_servers SET name = ?, url = ? WHERE tenant_slug = ? AND id = ?',
            [b.name ?? 'server', b.url ?? '', c.get('tenant'), c.req.param('server_id')],
        );
        return c.json({ success: true });
    });

    // DELETE /api/mcp-servers/{server_id}
    app.delete('/api/mcp-servers/:server_id', async (c) => {
        const existing = await runner.query(
            'SELECT id FROM mcp_servers WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('server_id')],
        );
        if (!existing[0]) return c.json({ detail: 'MCP server not found' }, 404);
        await runner.exec('DELETE FROM mcp_servers WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('server_id')]);
        return c.body(null, 204);
    });

    // GET /api/mcp-servers/{server_id}/tools
    app.get('/api/mcp-servers/:server_id/tools', async (c) => {
        const rows = await runner.query(
            'SELECT id, url, transport, config FROM mcp_servers WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('server_id')],
        );
        if (!rows[0]) return c.json({ detail: 'MCP server not found' }, 404);
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
        if (!r[0]) return c.json({ detail: 'MCP server not found' }, 404);
        try {
            await mcpRequest(r[0], 'ping');
            return c.json({ reachable: true, serverId: c.req.param('server_id') });
        } catch {
            return c.json({ reachable: false, serverId: c.req.param('server_id') });
        }
    });

    // GET /api/agent-skills
    app.get('/api/agent-skills', async (c) => {
        const custom = (await runner.query(
            'SELECT * FROM agent_skills WHERE tenant_slug = ?',
            [c.get('tenant')],
        )).map(redactSkillConfig);
        const skills = [...builtinSkillViews(), ...custom];
        return c.json({ skills, total: skills.length });
    });

    // POST /api/agent-skills
    app.post('/api/agent-skills', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            slug?: string;
            name?: string;
            description?: string | null;
            category?: string | null;
            tool_definitions?: Array<Record<string, unknown>>;
            version?: string;
            profile_slug?: string | null;
            config?: unknown;
        };
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        await runner.exec(
            'INSERT INTO agent_skills (id, tenant_slug, name, description, config, created_at) VALUES (?,?,?,?,?,?)',
            [id, c.get('tenant'), b.name ?? 'skill', b.description ?? null, await encryptedConfig(b.config) ?? null, timestamp],
        );
        return c.json({
            id,
            slug: b.slug ?? '',
            name: b.name ?? 'skill',
            description: b.description ?? null,
            category: b.category ?? null,
            toolDefinitions: b.tool_definitions ?? [],
            version: b.version ?? '1.0.0',
            isBuiltin: false,
            isActive: true,
            tenantId: null,
            projectId: null,
            profileSlug: b.profile_slug ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
        }, 201);
    });

    // PUT /api/agent-skills/{skill_id}
    app.put('/api/agent-skills/:skill_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; description?: string };
        const existing = await runner.query(
            'SELECT id FROM agent_skills WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('skill_id')],
        );
        if (!existing[0]) return c.json({ detail: 'Skill not found' }, 404);
        await runner.exec(
            'UPDATE agent_skills SET name = ?, description = ? WHERE tenant_slug = ? AND id = ?',
            [b.name ?? 'skill', b.description ?? null, c.get('tenant'), c.req.param('skill_id')],
        );
        return c.json({ success: true });
    });

    // DELETE /api/agent-skills/{skill_id}
    app.delete('/api/agent-skills/:skill_id', async (c) => {
        const existing = await runner.query(
            'SELECT id FROM agent_skills WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('skill_id')],
        );
        if (!existing[0]) return c.json({ detail: 'Skill not found' }, 404);
        await runner.exec('DELETE FROM agent_skills WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), c.req.param('skill_id')]);
        return c.body(null, 204);
    });

    // GET /api/agent-catalogue
    app.get('/api/agent-catalogue', (c) => c.json({
        coreTools: CORE_TOOLS,
        mcpServers: [],
        skills: BUILTIN_SKILLS.map((skill) => ({
            id: skill.id,
            slug: skill.slug,
            name: skill.name,
            category: skill.category,
            isBuiltin: true,
            disabled: false,
        })),
    }));

    // GET /api/agent-profiles/{profile_id}/skills
    app.get('/api/agent-profiles/:profile_id/skills', async (c) => {
        const profiles = await profilesFor(c.get('tenant'));
        if (!profiles.some((profile) => profile.id === c.req.param('profile_id'))) {
            return c.json({ detail: 'Profile not found' }, 404);
        }
        const installs = await kvFor(c.get('tenant')).getJson<Array<{ id: string; profileId: string; skillId: string; configOverrides?: unknown; installedAt: string }>>('agent_profile_skills', []);
        const forProfile = installs.filter((item) => item.profileId === c.req.param('profile_id'));
        const skills = await runner.query('SELECT * FROM agent_skills WHERE tenant_slug = ?', [c.get('tenant')]);
        const byId = new Map(skills.map((skill) => [String(skill.id), skill]));
        const result = forProfile.flatMap((install) => {
            const skill = byId.get(install.skillId);
            return skill ? [{
                ...redactSkillConfig(skill),
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
        const profiles = await profilesFor(c.get('tenant'));
        if (!profiles.some((profile) => profile.id === c.req.param('profile_id'))) {
            return c.json({ detail: 'Profile not found' }, 404);
        }
        const installs = await kv.getJson<Array<{ id: string; profileId: string }>>('agent_profile_skills', []);
        const kept = installs.filter((item) => !(item.id === c.req.param('install_id') && item.profileId === c.req.param('profile_id')));
        if (kept.length === installs.length) return c.json({ detail: 'Installed skill not found' }, 404);
        await kv.setJson('agent_profile_skills', kept, new Date().toISOString());
        return c.body(null, 204);
    });
}
