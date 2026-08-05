import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;
type AuthFormRow = Record<string, unknown>;

const COLS = 'id, tenant_slug, name, type, config, is_primary, created_at, updated_at';

// Validation error detail type matching FastAPI/Pydantic format
type ValidationError = {
    type: string;
    loc: string[];
    msg: string;
    input: unknown;
};

type ValidationResponse = { detail: ValidationError[] };

function validationError(details: ValidationError[]): ValidationResponse {
    return { detail: details };
}

// Common validation error types
const errorTypes = {
    string_type: 'string_type',
    missing: 'missing',
    bool_type: 'bool_type',
    array_type: 'array_type',
};

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
    message: string | null = null,
    error: string | null = null,
): { success: boolean; data: unknown; message: string | null; error: string | null } => ({
    success,
    data,
    message,
    error,
});

export function registerAuthFormsRoutes(app: App, runner: DbRunner, now: () => string): void {
    app.get('/api/auth-forms/', async (c) => {
        try {
            const rows = await runner.query(
                `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? ORDER BY created_at DESC`,
                [c.get('tenant')],
            ) as AuthFormRow[];
            return c.json(envelope(true, rows.map(serializeForm)));
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.post('/api/auth-forms/', async (c) => {
        const body = await c.req.json() as {
            name?: unknown;
            type?: unknown;
            config?: Record<string, unknown> | null;
            target_contact_type?: unknown;
            allowed_contact_types?: unknown;
            redirect_url?: unknown;
            is_active?: unknown;
        };
        const errors: ValidationError[] = [];

        // Validate name (required, must be string)
        if (body.name === undefined || body.name === null) {
            errors.push({ type: errorTypes.missing, loc: ['body', 'name'], msg: 'Field required', input: body });
        } else if (typeof body.name !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'name'], msg: 'Input should be a valid string', input: body.name });
        }

        // Validate type (required, must be string)
        if (body.type === undefined || body.type === null) {
            errors.push({ type: errorTypes.missing, loc: ['body', 'type'], msg: 'Field required', input: body });
        } else if (typeof body.type !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'type'], msg: 'Input should be a valid string', input: body.type });
        }

        // Validate target_contact_type (optional, must be string if provided)
        if (body.target_contact_type !== undefined && body.target_contact_type !== null && typeof body.target_contact_type !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'target_contact_type'], msg: 'Input should be a valid string', input: body.target_contact_type });
        }

        // Validate allowed_contact_types (optional, must be array if provided)
        if (body.allowed_contact_types !== undefined && body.allowed_contact_types !== null && !Array.isArray(body.allowed_contact_types)) {
            errors.push({ type: errorTypes.array_type, loc: ['body', 'allowed_contact_types'], msg: 'Input should be a valid array', input: body.allowed_contact_types });
        }

        // Validate redirect_url (optional, must be string if provided)
        if (body.redirect_url !== undefined && body.redirect_url !== null && typeof body.redirect_url !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'redirect_url'], msg: 'Input should be a valid string', input: body.redirect_url });
        }

        // Validate is_active (optional, must be boolean if provided)
        if (body.is_active !== undefined && body.is_active !== null && typeof body.is_active !== 'boolean') {
            errors.push({ type: errorTypes.bool_type, loc: ['body', 'is_active'], msg: 'Input should be a valid boolean', input: body.is_active });
        }

        if (errors.length > 0) {
            return c.json(validationError(errors), 422);
        }

        try {
            // All validated, proceed with creation
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
                name: body.name as string,
                type: body.type as string,
                config: JSON.stringify(config),
                is_primary: primary ? 1 : 0,
                created_at: timestamp,
                updated_at: timestamp,
            })), 201);
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.get('/api/auth-forms/primary/', async (c) => {
        try {
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
            return c.json(envelope(false, null, null, 'No auth forms configured'));
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.get('/api/auth-forms/:form_id/', async (c) => {
        try {
            const rows = await runner.query(
                `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`,
                [c.get('tenant'), c.req.param('form_id')],
            ) as AuthFormRow[];
            return rows[0]
                ? c.json(envelope(true, serializeForm(rows[0])))
                : c.json(envelope(false, null, null, 'Auth form not found'));
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.put('/api/auth-forms/:form_id/', async (c) => {
        try {
            const rows = await runner.query(
                `SELECT ${COLS} FROM auth_forms WHERE tenant_slug = ? AND id = ?`,
                [c.get('tenant'), c.req.param('form_id')],
            ) as AuthFormRow[];
            const existing = rows[0];
            if (!existing) return c.json(envelope(false, null, null, 'Auth form not found'));

        const body = await c.req.json() as {
            name?: unknown;
            type?: unknown;
            config?: Record<string, unknown> | null;
            target_contact_type?: unknown;
            allowed_contact_types?: unknown;
            redirect_url?: unknown;
            is_active?: unknown;
        };
        const errors: ValidationError[] = [];

        // Validate name (optional, must be string if provided)
        if (body.name !== undefined && body.name !== null && typeof body.name !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'name'], msg: 'Input should be a valid string', input: body.name });
        }

        // Validate type (optional, must be string if provided)
        if (body.type !== undefined && body.type !== null && typeof body.type !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'type'], msg: 'Input should be a valid string', input: body.type });
        }

        // Validate target_contact_type (optional, must be string if provided)
        if (body.target_contact_type !== undefined && body.target_contact_type !== null && typeof body.target_contact_type !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'target_contact_type'], msg: 'Input should be a valid string', input: body.target_contact_type });
        }

        // Validate allowed_contact_types (optional, must be array if provided)
        if (body.allowed_contact_types !== undefined && body.allowed_contact_types !== null && !Array.isArray(body.allowed_contact_types)) {
            errors.push({ type: errorTypes.array_type, loc: ['body', 'allowed_contact_types'], msg: 'Input should be a valid array', input: body.allowed_contact_types });
        }

        // Validate redirect_url (optional, must be string if provided)
        if (body.redirect_url !== undefined && body.redirect_url !== null && typeof body.redirect_url !== 'string') {
            errors.push({ type: errorTypes.string_type, loc: ['body', 'redirect_url'], msg: 'Input should be a valid string', input: body.redirect_url });
        }

        // Validate is_active (optional, must be boolean if provided)
        if (body.is_active !== undefined && body.is_active !== null && typeof body.is_active !== 'boolean') {
            errors.push({ type: errorTypes.bool_type, loc: ['body', 'is_active'], msg: 'Input should be a valid boolean', input: body.is_active });
        }

        if (errors.length > 0) {
            return c.json(validationError(errors), 422);
        }

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
                body.name !== undefined ? body.name : String(existing.name),
                body.type !== undefined ? body.type : String(existing.type),
                JSON.stringify(config),
                primary ? 1 : 0,
                timestamp,
                c.get('tenant'),
                c.req.param('form_id'),
            ],
        );
        return c.json(envelope(true, serializeForm({
            ...existing,
            name: body.name !== undefined ? body.name : existing.name,
            type: body.type !== undefined ? body.type : existing.type,
            config: JSON.stringify(config),
            is_primary: primary ? 1 : 0,
            updated_at: timestamp,
        })));
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.delete('/api/auth-forms/:form_id/', async (c) => {
        try {
            const rows = await runner.query(
                'SELECT id FROM auth_forms WHERE tenant_slug = ? AND id = ?',
                [c.get('tenant'), c.req.param('form_id')],
            );
            if (!rows[0]) return c.json(envelope(false, null, null, 'Auth form not found'));
            await runner.exec(
                'DELETE FROM auth_forms WHERE tenant_slug = ? AND id = ?',
                [c.get('tenant'), c.req.param('form_id')],
            );
            return c.json(envelope(true));
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });

    app.put('/api/auth-forms/:form_id/set-primary/', async (c) => {
        try {
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
        } catch (e) {
            return c.json(envelope(false, null, null, String(e)));
        }
    });
}
