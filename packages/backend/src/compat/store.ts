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
            'SELECT id, name, type, description, formula, value, created_at FROM template_variables WHERE tenant_slug = ? ORDER BY created_at',
            [this.tenant],
        );
        return rows as unknown as TemplateVariable[];
    }

    async get(id: string): Promise<TemplateVariable | null> {
        const rows = await this.runner.query(
            'SELECT id, name, type, description, formula, value, created_at FROM template_variables WHERE tenant_slug = ? AND id = ?',
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
        return { id, name: input.name, type: input.type, description: input.description ?? null, formula: input.formula ?? null, value: input.value ?? null, created_at: now };
    }

    async update(id: string, patch: Partial<{ name: string; type: string; description: string | null; formula: string | null; value: string | null }>): Promise<TemplateVariable | null> {
        const existing = await this.get(id);
        if (!existing) return null;
        const merged = {
            name: patch.name ?? existing.name,
            type: patch.type ?? existing.type,
            description: patch.description !== undefined ? patch.description : existing.description,
            formula: patch.formula !== undefined ? patch.formula : existing.formula,
            value: patch.value !== undefined ? patch.value : existing.value,
        };
        await this.runner.exec(
            'UPDATE template_variables SET name = ?, type = ?, description = ?, formula = ?, value = ? WHERE tenant_slug = ? AND id = ?',
            [merged.name, merged.type, merged.description, merged.formula, merged.value, this.tenant, id],
        );
        return { ...existing, ...merged };
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
