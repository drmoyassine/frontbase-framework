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
