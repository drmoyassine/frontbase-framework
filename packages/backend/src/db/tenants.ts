/**
 * TenantStore (M-ID.2) — tenant CRUD for multi-tenant provisioning. The tenant
 * row is global (not tenant-scoped — it IS the tenant). RULE 3: copies.
 *
 * A-25 Phase 4 cloud: `plan`/`status` columns (migration v20) carry the
 * cloud subscription state. NULL on self-host (⇒ unlimited per plan-limits
 * contract); cloud signups write plan='free', status='active'.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface TenantRecord { slug: string; name: string; createdAt: string }

export interface TenantFullRecord extends TenantRecord {
    plan: string | null;
    status: string | null;
}

export interface TenantPatch {
    name?: string;
    plan?: string | null;
    status?: string | null;
}

export class TenantStore {
    constructor(private runner: DbRunner) {}

    async createTenant(slug: string, name: string, now: string): Promise<TenantRecord> {
        await this.runner.exec('INSERT INTO tenants (slug, name, created_at) VALUES (?,?,?)', [slug, name, now]);
        return { slug, name, createdAt: now };
    }

    async listTenants(): Promise<TenantRecord[]> {
        const rows = await this.runner.query('SELECT slug, name, created_at FROM tenants ORDER BY slug');
        return rows.map((r) => ({ slug: String(r.slug), name: String(r.name), createdAt: String(r.created_at) }));
    }

    async tenantExists(slug: string): Promise<boolean> {
        const rows = await this.runner.query('SELECT slug FROM tenants WHERE slug = ?', [slug]);
        return rows.length > 0;
    }

    async getTenant(slug: string): Promise<TenantFullRecord | null> {
        const rows = await this.runner.query(
            'SELECT slug, name, created_at, plan, status FROM tenants WHERE slug = ? LIMIT 1',
            [slug],
        );
        const row = rows[0];
        if (!row) return null;
        return {
            slug: String(row.slug),
            name: String(row.name),
            createdAt: String(row.created_at),
            plan: row.plan == null ? null : String(row.plan),
            status: row.status == null ? null : String(row.status),
        };
    }

    async updateTenant(slug: string, patch: TenantPatch): Promise<TenantFullRecord | null> {
        const sets: string[] = [];
        const args: unknown[] = [];
        if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name); }
        if (patch.plan !== undefined) { sets.push('plan = ?'); args.push(patch.plan); }
        if (patch.status !== undefined) { sets.push('status = ?'); args.push(patch.status); }
        if (sets.length === 0) return this.getTenant(slug);
        await this.runner.exec(`UPDATE tenants SET ${sets.join(', ')} WHERE slug = ?`, [...args, slug]);
        return this.getTenant(slug);
    }

    async deleteTenant(slug: string): Promise<void> {
        await this.runner.exec('DELETE FROM tenants WHERE slug = ?', [slug]);
    }
}
