/**
 * CF-22 P1 / D4 — tenant-scoped store for template (formula) variables backing
 * the product-compat /api/variables surface. Same DbRunner seam as Phase2Store
 * (SQLite/D1/Turso/Postgres). RULE 2: every read/write filtered by tenant.
 *
 * Table: `template_variables` (migration v7). Distinct from the key-value
 * `variables` table (secret/settings store) — these are the builder's
 * @-mention formula variables {name, type, formula, value, description}.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface TemplateVariable {
    id: string;
    name: string;
    type: string;        // variable | calculated
    description: string | null;
    formula: string | null;
    value: string | null;
    created_at: string;
}

export class TemplateVariableStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    async list(): Promise<TemplateVariable[]> {
        const rows = await this.runner.query(
            'SELECT id, name, type, value, formula, description, created_at FROM template_variables WHERE tenant_slug = ? ORDER BY created_at',
            [this.tenant],
        );
        return rows as unknown as TemplateVariable[];
    }

    async get(id: string): Promise<TemplateVariable | null> {
        const rows = await this.runner.query(
            'SELECT id, name, type, value, formula, description, created_at FROM template_variables WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        const row = rows[0];
        return row ? (row as unknown as TemplateVariable) : null;
    }

    async create(input: { name: string; type: string; description?: string | null; formula?: string | null; value?: string | null }, id: string, now: string): Promise<TemplateVariable> {
        await this.runner.exec(
            'INSERT INTO template_variables (id, tenant_slug, name, type, formula, value, description, created_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, this.tenant, input.name, input.type, input.formula ?? null, input.value ?? null, input.description ?? null, now],
        );
        // Return in product order: id, name, type, value, formula, description, created_at
        return { id, name: input.name, type: input.type, value: input.value ?? null, formula: input.formula ?? null, description: input.description ?? null, created_at: now };
    }

    async update(id: string, patch: Partial<{ name: string; type: string; description: string | null; formula: string | null; value: string | null }>): Promise<TemplateVariable | null> {
        const existing = await this.get(id);
        if (!existing) return null;
        const merged = {
            name: patch.name ?? existing.name,
            type: patch.type ?? existing.type,
            value: patch.value !== undefined ? patch.value : existing.value,
            formula: patch.formula !== undefined ? patch.formula : existing.formula,
            description: patch.description !== undefined ? patch.description : existing.description,
        };
        await this.runner.exec(
            'UPDATE template_variables SET name = ?, type = ?, description = ?, formula = ?, value = ? WHERE tenant_slug = ? AND id = ?',
            [merged.name, merged.type, merged.description, merged.formula, merged.value, this.tenant, id],
        );
        // Return in product order: id, name, type, value, formula, description, created_at
        return { id: existing.id, name: merged.name, type: merged.type, value: merged.value, formula: merged.formula, description: merged.description, created_at: existing.created_at };
    }

    async delete(id: string): Promise<boolean> {
        await this.runner.exec('DELETE FROM template_variables WHERE tenant_slug = ? AND id = ?', [this.tenant, id]);
        return true;
    }
}

/**
 * CF-22 P2 Wave 1 — generic tenant-scoped key/value JSON store on the existing
 * `settings` table (migration v4). Backs the product-compat /api/settings/* and
 * /api/project surfaces (each domain stored as one JSON blob under a key).
 */
export class KeyValueStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    async getJson<T = unknown>(key: string, fallback: T): Promise<T> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, key]);
        const raw = rows[0]?.value;
        if (!raw) return fallback;
        try { return JSON.parse(String(raw)) as T; } catch { return fallback; }
    }

    async setJson(key: string, value: unknown, now: string): Promise<void> {
        await this.runner.exec(
            'INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
            [this.tenant, key, JSON.stringify(value), now],
        );
    }
}

export interface CommunityInvite {
    token: string;
    email: string;
    role: string;
    tenantSlug: string;
    tenantName: string | null;
    status: 'pending' | 'accepted';
    createdAt: string;
    expiresAt: string;
    acceptedAt?: string;
}

/**
 * Community invite persistence on the existing settings table.
 *
 * Invite lookup is intentionally token-global: the unauthenticated accept page
 * does not know a tenant yet, and possession of the random token is the
 * capability. Consumption uses compare-and-swap on the serialized value so the
 * same token cannot create two users under concurrent requests.
 */
export class CommunityInviteStore {
    constructor(private runner: DbRunner) {}

    async create(
        tenantSlug: string,
        input: { email: string; role: string; tenantName?: string | null },
        now: string,
    ): Promise<CommunityInvite> {
        const token = crypto.randomUUID();
        const created = new Date(now);
        const expires = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
        const invite: CommunityInvite = {
            token,
            email: input.email.trim().toLowerCase(),
            role: input.role,
            tenantSlug,
            tenantName: input.tenantName ?? null,
            status: 'pending',
            createdAt: created.toISOString(),
            expiresAt: expires.toISOString(),
        };
        await this.runner.exec(
            'INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?)',
            [tenantSlug, this.key(token), JSON.stringify(invite), now],
        );
        return invite;
    }

    async getPending(token: string, now: string): Promise<CommunityInvite | null> {
        const found = await this.find(token);
        if (!found || found.invite.status !== 'pending') return null;
        if (Date.parse(found.invite.expiresAt) <= Date.parse(now)) return null;
        return found.invite;
    }

    async consume(token: string, now: string): Promise<CommunityInvite | null> {
        const found = await this.find(token);
        if (!found || found.invite.status !== 'pending') return null;
        if (Date.parse(found.invite.expiresAt) <= Date.parse(now)) return null;
        const accepted: CommunityInvite = {
            ...found.invite,
            status: 'accepted',
            acceptedAt: now,
        };
        const changed = await this.runner.exec(
            'UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',
            [JSON.stringify(accepted), now, found.invite.tenantSlug, this.key(token), found.raw],
        );
        return changed > 0 ? found.invite : null;
    }

    private key(token: string): string {
        return `community_invite:${token}`;
    }

    private async find(token: string): Promise<{ invite: CommunityInvite; raw: string } | null> {
        const rows = await this.runner.query(
            'SELECT value FROM settings WHERE key = ? LIMIT 1',
            [this.key(token)],
        );
        const raw = rows[0]?.value;
        if (typeof raw !== 'string') return null;
        try {
            const invite = JSON.parse(raw) as CommunityInvite;
            return invite.token === token ? { invite, raw } : null;
        } catch {
            return null;
        }
    }
}

export interface PasswordResetCapability {
    userId: string;
    tenantSlug: string;
    email: string;
}

async function sha256Hex(value: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hashed, expiring, single-use password-reset capability store. */
export class PasswordResetStore {
    constructor(private runner: DbRunner) {}

    async create(
        user: { id: string; tenantSlug: string; email: string },
        now: string,
    ): Promise<string> {
        const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`;
        const tokenHash = await sha256Hex(token);
        const created = new Date(now);
        const expiresAt = new Date(created.getTime() + 60 * 60 * 1000).toISOString();
        // Supersede unused tokens for this account; a reset email always carries
        // the only currently valid capability.
        await this.runner.exec(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND tenant_slug = ? AND used_at IS NULL',
            [user.id, user.tenantSlug],
        );
        await this.runner.exec(
            `INSERT INTO password_reset_tokens
             (token_hash, user_id, tenant_slug, email, expires_at, used_at, created_at)
             VALUES (?,?,?,?,?,NULL,?)`,
            [tokenHash, user.id, user.tenantSlug, user.email.toLowerCase(), expiresAt, created.toISOString()],
        );
        return token;
    }

    async consume(email: string, token: string, now: string): Promise<PasswordResetCapability | null> {
        const tokenHash = await sha256Hex(token);
        const rows = await this.runner.query(
            `SELECT user_id, tenant_slug, email, expires_at, used_at
             FROM password_reset_tokens WHERE token_hash = ?`,
            [tokenHash],
        );
        const row = rows[0];
        if (!row || row.used_at || String(row.email).toLowerCase() !== email.toLowerCase()) return null;
        if (Date.parse(String(row.expires_at)) <= Date.parse(now)) return null;
        const changed = await this.runner.exec(
            `UPDATE password_reset_tokens SET used_at = ?
             WHERE token_hash = ? AND used_at IS NULL`,
            [now, tokenHash],
        );
        if (changed !== 1) return null;
        return {
            userId: String(row.user_id),
            tenantSlug: String(row.tenant_slug),
            email: String(row.email),
        };
    }
}

export interface ThemeRow { id: string; name: string; component_type: string; styles_data: string; is_system: number; created_at: string; updated_at: string; }

/** CF-22 P2 Wave 1 — component themes (migration v8). */
export class ThemesStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    async list(): Promise<ThemeRow[]> {
        return await this.runner.query('SELECT id, name, component_type, styles_data, is_system, created_at, updated_at FROM themes WHERE tenant_slug = ? ORDER BY created_at', [this.tenant]) as unknown as ThemeRow[];
    }
    async create(input: { name: string; component_type: string; styles_data: string; is_system?: boolean }, id: string, now: string): Promise<ThemeRow> {
        await this.runner.exec(
            'INSERT INTO themes (id, tenant_slug, name, component_type, styles_data, is_system, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            [id, this.tenant, input.name, input.component_type, input.styles_data, input.is_system ? 1 : 0, now, now],
        );
        return { id, name: input.name, component_type: input.component_type, styles_data: input.styles_data, is_system: input.is_system ? 1 : 0, created_at: now, updated_at: now };
    }
    async delete(id: string): Promise<boolean> {
        await this.runner.exec('DELETE FROM themes WHERE tenant_slug = ? AND id = ?', [this.tenant, id]);
        return true;
    }
}

/** CF-22 P2 Wave 1 — security events (migration v8). */
export class SecurityEventsStore {
    constructor(private runner: DbRunner, private tenant: string) {}
    async list(): Promise<Record<string, unknown>[]> {
        return await this.runner.query('SELECT id, kind, severity, detail, created_at FROM security_events WHERE tenant_slug = ? ORDER BY created_at DESC', [this.tenant]);
    }
    async summary(): Promise<{ total: number; by_severity: Record<string, number> }> {
        const rows = await this.runner.query('SELECT severity, COUNT(*) AS n FROM security_events WHERE tenant_slug = ? GROUP BY severity', [this.tenant]);
        const by_severity: Record<string, number> = {};
        let total = 0;
        for (const r of rows) { const s = String((r as Record<string, unknown>).severity); const n = Number((r as Record<string, unknown>).n); by_severity[s] = n; total += n; }
        return { total, by_severity };
    }
}
