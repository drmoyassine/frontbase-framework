/**
 * TenantStore (M-ID.2) — tenant CRUD for multi-tenant provisioning. The tenant
 * row is global (not tenant-scoped — it IS the tenant). RULE 3: copies.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface TenantRecord { slug: string; name: string; createdAt: string }

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

    async deleteTenant(slug: string): Promise<void> {
        await this.runner.exec('DELETE FROM tenants WHERE slug = ?', [slug]);
    }
}
