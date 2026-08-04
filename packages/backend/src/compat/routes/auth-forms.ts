import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;
type AuthFormRow = Record<string, unknown>;

const COLS = 'id, tenant_slug, name, type, config, is_primary, created_at, updated_at';

function parseConfig(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value !== 'string' || value.length === 0) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function serializeForm(row: AuthFormRow): Record<string, unknown> {
    const config = parseConfig(row.config);
    const primary = Boolean(row.is_primary ?? config.is_primary);
    const embeddable = Boolean(config.is_embeddable);
    const active = config.is_active === undefined ? true : Boolean(config.is_active);
    const target = typeof config.target_contact_type === 'string' ? config.target_contact_type : null;
    const allowed = Array.isArray(config.allowed_contact_types) ? config.allowed_contact_types : [];
    const redirect = typeof config.redirect_url === 'string' ? config.redirect_url : null;
    const createdAt = String(row.created_at ?? '');
    const updatedAt = String(row.updated_at ?? createdAt);
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        type: String(row.type ?? 'login'),
        config,
        target_contact_type: target,
        targetContactType: target,
        allowed_contact_types: allowed,
        allowedContactTypes: allowed,
        redirect_url: redirect,
        redirectUrl: redirect,
        is_active: active,
        isActive: active,
        is_primary: primary,
        isPrimary: primary,
        is_embeddable: embeddable,
        isEmbeddable: embeddable,
        created_at: createdAt,
        createdAt,
        updated_at: updatedAt,
        updatedAt,
    };
}

const envelope = (
    success: boolean,
    data: unknown = null,
    error: string | null = null,
): { success: boolean; data: unknown; message: null; error: string | null } => ({
    success,
    data,
    message: null,
    error,
});

export function registerAuthFormsRoutes(app: App, runner: DbRunner, now: () => string): void {
    app.get('/api/auth-forms/', async (c) => {
        const rows = await runner.query(
            `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? ORDER BY created_at DESC`,
            [c.get('tenant')],
        ) as AuthFormRow[];
        return c.json(envelope(true, rows.map(serializeForm)));
    });

    app.post('/api/auth-forms/', async (c) => {
        const body = await c.req.json() as {
            name: string;
            type: string;
            config?: Record<string, unknown> | null;
            target_contact_type?: string | null;
            allowed_contact_types?: unknown[] | null;
            redirect_url?: string | null;
            is_active?: boolean;
        };
        const id = crypto.randomUUID();
        const timestamp = now();
        const config: Record<string, unknown> = {
            ...(body.config ?? {}),
            target_contact_type: body.target_contact_type ?? null,
            allowed_contact_types: body.allowed_contact_types ?? [],
            redirect_url: body.redirect_url ?? null,
            is_active: body.is_active ?? true,
        };
        const primary = Boolean(config.is_primary);
        await runner.exec(
            'INSERT INTO auth_forms (id, tenant_slug, name, type, config, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, c.get('tenant'), body.name, body.type, JSON.stringify(config), primary ? 1 : 0, timestamp, timestamp],
        );
        return c.json(envelope(true, serializeForm({
            id,
            name: body.name,
            type: body.type,
            config: JSON.stringify(config),
            is_primary: primary ? 1 : 0,
            created_at: timestamp,
            updated_at: timestamp,
        })), 201);
    });

    app.get('/api/auth-forms/primary/', async (c) => {
        // Framework has no is_active column - it's in config JSON
        // Match product logic: filter active by config, then find by config.is_primary
        const allRows = await runner.query(
            `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? ORDER BY created_at DESC`,
            [c.get('tenant')],
        ) as AuthFormRow[];
        // Filter to active forms (config.is_active !== false)
        const activeRows = allRows.filter((candidate) => {
            const config = parseConfig(candidate.config);
            return config.is_active === undefined || Boolean(config.is_active);
        });
        // Find first with is_primary in config
        const primary = activeRows.find((candidate) => {
            const config = parseConfig(candidate.config);
            return Boolean(config.is_primary);
        });
        // Fallback to first active if no primary found
        const target = primary || activeRows[0];
        if (target) {
            return c.json(envelope(true, serializeForm(target)));
        }
        return c.json(envelope(false, null, 'No auth forms configured'));
    });

    app.get('/api/auth-forms/:form_id/', async (c) => {
        const rows = await runner.query(
            `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`,
            [c.get('tenant'), c.req.param('form_id')],
        ) as AuthFormRow[];
        return rows[0]
            ? c.json(envelope(true, serializeForm(rows[0])))
            : c.json(envelope(false, null, 'Auth form not found'));
    });

    app.put('/api/auth-forms/:form_id/', async (c) => {
        const rows = await runner.query(
            `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`,
            [c.get('tenant'), c.req.param('form_id')],
        ) as AuthFormRow[];
        const existing = rows[0];
        if (!existing) return c.json(envelope(false, null, 'Auth form not found'));

        const body = await c.req.json() as {
            name?: string;
            type?: string;
            config?: Record<string, unknown> | null;
            target_contact_type?: string | null;
            allowed_contact_types?: unknown[] | null;
            redirect_url?: string | null;
            is_active?: boolean;
        };
        const oldConfig = parseConfig(existing.config);
        const config = body.config === undefined ? { ...oldConfig } : { ...(body.config ?? {}) };
        if (body.target_contact_type !== undefined) config.target_contact_type = body.target_contact_type;
        if (body.allowed_contact_types !== undefined) config.allowed_contact_types = body.allowed_contact_types;
        if (body.redirect_url !== undefined) config.redirect_url = body.redirect_url;
        if (body.is_active !== undefined) config.is_active = body.is_active;
        const primary = Boolean(config.is_primary ?? existing.is_primary);
        const timestamp = now();
        await runner.exec(
            'UPDATE auth_forms SET name = ?, type = ?, config = ?, is_primary = ?, updated_at = ? WHERE tenant_slug = ? AND id = ?',
            [
                body.name ?? String(existing.name),
                body.type ?? String(existing.type),
                JSON.stringify(config),
                primary ? 1 : 0,
                timestamp,
                c.get('tenant'),
                c.req.param('form_id'),
            ],
        );
        return c.json(envelope(true, serializeForm({
            ...existing,
            name: body.name ?? existing.name,
            type: body.type ?? existing.type,
            config: JSON.stringify(config),
            is_primary: primary ? 1 : 0,
            updated_at: timestamp,
        })));
    });

    app.delete('/api/auth-forms/:form_id/', async (c) => {
        const rows = await runner.query(
            'SELECT id FROM auth_forms WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('form_id')],
        );
        if (!rows[0]) return c.json(envelope(false, null, 'Auth form not found'));
        await runner.exec(
            'DELETE FROM auth_forms WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('form_id')],
        );
        return c.json(envelope(true));
    });

    app.put('/api/auth-forms/:form_id/set-primary/', async (c) => {
        const rows = await runner.query(
            `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`,
            [c.get('tenant'), c.req.param('form_id')],
        ) as AuthFormRow[];
        const existing = rows[0];
        if (!existing) return c.json(envelope(false, null, 'Auth form not found'));

        await runner.exec('UPDATE auth_forms SET is_primary = 0 WHERE tenant_slug = ?', [c.get('tenant')]);
        await runner.exec(
            'UPDATE auth_forms SET is_primary = 1, updated_at = ? WHERE tenant_slug = ? AND id = ?',
            [now(), c.get('tenant'), c.req.param('form_id')],
        );
        return c.json(envelope(true, serializeForm({ ...existing, is_primary: 1 })));
    });
}
