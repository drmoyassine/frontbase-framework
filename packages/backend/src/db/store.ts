/**
 * Console persistence — tenant-scoped CRUD over the Drizzle schema. Backed by a
 * libsql client (the same one edge-infra uses); CI runs :memory:.
 *
 * RULE 2: every read/write is filtered by `tenantSlug` from the authenticated
 * principal. RULE 3: rows returned are copies. RULE 4: store errors are caught
 * by the route layer and surfaced opaquely.
 */
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { publishedPages, drafts, workflows } from './schema.js';
import { migrateUp } from './migrations.js';

export interface PageInput { slug: string; title: string; description?: string; layoutData: string; cssBundle?: string; }

export class ConsoleStore {
    private db: LibSQLDatabase<Record<string, never>>;
    private client: Client;
    private tenant: string;

    private constructor(db: LibSQLDatabase<Record<string, never>>, client: Client, tenant: string) {
        this.db = db;
        this.client = client;
        this.tenant = tenant;
    }

    /** Create a store for a tenant, over a libsql URL (`:memory:` for tests).
     *  Schema is brought up to date via the versioned migration runner (M3.0.5)
     *  — the Drizzle schema (schema.ts) stays the single source of truth (A-13). */
    static async create(url: string, tenant: string): Promise<ConsoleStore> {
        const client = createClient({ url });
        await migrateUp(client);
        const db = drizzle(client);
        return new ConsoleStore(db, client, tenant);
    }

    /** Raw client — for the publish pipeline / migrations. */
    raw(): Client { return this.client; }

    // ---- Drafts (tenant-scoped) ----
    async upsertDraft(slug: string, layoutData: string, now: string): Promise<void> {
        // tenant predicate in every statement (RULE 2)
        await this.client.execute({
            sql: `INSERT INTO drafts (slug, tenant_slug, layout_data, updated_at) VALUES (?,?,?,?)
                  ON CONFLICT(slug, tenant_slug) DO UPDATE SET layout_data=excluded.layout_data, updated_at=excluded.updated_at`,
            args: [slug, this.tenant, layoutData, now],
        });
    }
    async getDraft(slug: string): Promise<{ layoutData: string } | null> {
        const r = await this.client.execute({ sql: 'SELECT layout_data FROM drafts WHERE slug = ? AND tenant_slug = ?', args: [slug, this.tenant] });
        const row = r.rows[0];
        return row ? { layoutData: String(row.layout_data) } : null;
    }
    async listDrafts(): Promise<{ slug: string }[]> {
        const r = await this.client.execute({ sql: 'SELECT slug FROM drafts WHERE tenant_slug = ? ORDER BY slug', args: [this.tenant] });
        return r.rows.map((row) => ({ slug: String(row.slug) }));
    }

    // ---- Published pages (tenant-scoped) ----
    async publishPage(input: PageInput, now: string): Promise<{ version: number }> {
        const cur = await this.client.execute({ sql: 'SELECT version FROM published_pages WHERE slug = ? AND tenant_slug = ?', args: [input.slug, this.tenant] });
        const version = cur.rows[0] ? Number(cur.rows[0].version) + 1 : 1;
        await this.client.execute({
            sql: `INSERT INTO published_pages (slug, tenant_slug, title, description, layout_data, css_bundle, version, updated_at)
                  VALUES (?,?,?,?,?,?,?,?)
                  ON CONFLICT(slug, tenant_slug) DO UPDATE SET title=excluded.title, description=excluded.description,
                  layout_data=excluded.layout_data, css_bundle=excluded.css_bundle, version=excluded.version, updated_at=excluded.updated_at`,
            args: [input.slug, this.tenant, input.title, input.description ?? null, input.layoutData, input.cssBundle ?? null, version, now],
        });
        return { version };
    }
    async getPage(slug: string): Promise<{ title: string; layoutData: string; cssBundle?: string; version: number } | null> {
        const r = await this.client.execute({
            sql: 'SELECT title, layout_data, css_bundle, version FROM published_pages WHERE slug = ? AND tenant_slug = ?',
            args: [slug, this.tenant],
        });
        const row = r.rows[0];
        return row ? { title: String(row.title), layoutData: String(row.layout_data), cssBundle: row.css_bundle ? String(row.css_bundle) : undefined, version: Number(row.version) } : null;
    }
    async listPages(): Promise<{ slug: string; title: string; version: number }[]> {
        const r = await this.client.execute({ sql: 'SELECT slug, title, version FROM published_pages WHERE tenant_slug = ? ORDER BY slug', args: [this.tenant] });
        return r.rows.map((row) => ({ slug: String(row.slug), title: String(row.title), version: Number(row.version) }));
    }
    async deletePage(slug: string): Promise<boolean> {
        const r = await this.client.execute({ sql: 'DELETE FROM published_pages WHERE slug = ? AND tenant_slug = ?', args: [slug, this.tenant] });
        return r.rowsAffected > 0;
    }
}

// Drizzle tables are re-exported so migrations/tools can read the single source of truth.
export { publishedPages, drafts, workflows };
