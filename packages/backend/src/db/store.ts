/**
 * Console persistence — tenant-scoped CRUD over the Drizzle schema. Backed by a
 * `DbRunner` (from @frontbase/edge-infra), so it speaks SQLite / D1 / Turso /
 * Postgres through ONE seam (Decision A-19 / B1). CI runs :memory: SQLite.
 *
 * RULE 2: every read/write is filtered by `tenantSlug` from the authenticated
 * principal. RULE 3: rows returned are copies. RULE 4: store errors are caught
 * by the route layer and surfaced opaquely.
 */
import type { DbRunner } from '@frontbase/edge-infra';
import { sqliteRunner } from '@frontbase/edge-infra';
import { publishedPages, drafts, workflows } from './schema.js';

export interface PageInput { slug: string; title: string; description?: string; layoutData: string; cssBundle?: string; }

export class ConsoleStore {
    protected runner: DbRunner;
    protected tenant: string;

    constructor(runner: DbRunner, tenant: string) {
        this.runner = runner;
        this.tenant = tenant;
    }

    /** Convenience for tests / Docker: build a SQLite-file/:memory: runner from a URL. */
    static fromUrl(url: string, tenant: string): ConsoleStore {
        return new ConsoleStore(sqliteRunner(url), tenant);
    }

    /** The underlying runner — for the publish pipeline / migrations. */
    raw(): DbRunner { return this.runner; }

    // ---- Drafts (tenant-scoped) ----
    async upsertDraft(slug: string, layoutData: string, now: string): Promise<void> {
        // tenant predicate in every statement (RULE 2)
        await this.runner.exec(
            `INSERT INTO drafts (slug, tenant_slug, layout_data, updated_at) VALUES (?,?,?,?)
             ON CONFLICT(slug, tenant_slug) DO UPDATE SET layout_data=excluded.layout_data, updated_at=excluded.updated_at`,
            [slug, this.tenant, layoutData, now],
        );
    }
    async getDraft(slug: string): Promise<{ layoutData: string } | null> {
        const rows = await this.runner.query('SELECT layout_data FROM drafts WHERE slug = ? AND tenant_slug = ?', [slug, this.tenant]);
        const row = rows[0];
        return row ? { layoutData: String(row.layout_data) } : null;
    }
    async listDrafts(): Promise<{ slug: string }[]> {
        const rows = await this.runner.query('SELECT slug FROM drafts WHERE tenant_slug = ? ORDER BY slug', [this.tenant]);
        return rows.map((row) => ({ slug: String(row.slug) }));
    }

    // ---- Published pages (tenant-scoped) ----
    async publishPage(input: PageInput, now: string): Promise<{ version: number }> {
        const cur = await this.runner.query('SELECT version FROM published_pages WHERE slug = ? AND tenant_slug = ?', [input.slug, this.tenant]);
        const version = cur[0] ? Number(cur[0].version) + 1 : 1;
        await this.runner.exec(
            `INSERT INTO published_pages (slug, tenant_slug, title, description, layout_data, css_bundle, version, updated_at)
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT(slug, tenant_slug) DO UPDATE SET title=excluded.title, description=excluded.description,
             layout_data=excluded.layout_data, css_bundle=excluded.css_bundle, version=excluded.version, updated_at=excluded.updated_at`,
            [input.slug, this.tenant, input.title, input.description ?? null, input.layoutData, input.cssBundle ?? null, version, now],
        );
        return { version };
    }
    async getPage(slug: string): Promise<{ title: string; layoutData: string; cssBundle?: string; version: number } | null> {
        const rows = await this.runner.query(
            'SELECT title, layout_data, css_bundle, version FROM published_pages WHERE slug = ? AND tenant_slug = ?',
            [slug, this.tenant],
        );
        const row = rows[0];
        return row ? { title: String(row.title), layoutData: String(row.layout_data), cssBundle: row.css_bundle ? String(row.css_bundle) : undefined, version: Number(row.version) } : null;
    }
    async listPages(): Promise<{ slug: string; title: string; version: number }[]> {
        const rows = await this.runner.query('SELECT slug, title, version FROM published_pages WHERE tenant_slug = ? ORDER BY slug', [this.tenant]);
        return rows.map((row) => ({ slug: String(row.slug), title: String(row.title), version: Number(row.version) }));
    }
    async deletePage(slug: string): Promise<boolean> {
        const n = await this.runner.exec('DELETE FROM published_pages WHERE slug = ? AND tenant_slug = ?', [slug, this.tenant]);
        return n > 0;
    }
}

// Drizzle tables are re-exported so migrations/tools can read the single source of truth.
export { publishedPages, drafts, workflows };
