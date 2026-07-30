/**
 * CF-22 P2 Wave 1b — product-shaped pages store for the compat /api/pages/*
 * surface (migration v9). Id-keyed (unlike the framework's slug-keyed
 * published_pages used by eSSR), with soft-delete + immutable version snapshots.
 *
 * Community "publish": the worker IS the engine, so publish = mark live (the
 * product's publish-to-engine fan-out collapses to a single local activation;
 * deployments list reflects that). RULE 2: every read/write filtered by tenant.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export interface CompatPageRow {
    id: string; name: string; slug: string; title: string | null; description: string | null;
    keywords: string | null; is_public: number; is_homepage: number; is_published: number; layout_data: string;
    seo_data: string | null; deleted_at: string | null; content_hash: string | null;
    created_at: string; updated_at: string;
}
export interface CompatVersionRow {
    id: string; page_id: string; version_number: number; layout_data: string;
    content_hash: string | null; label: string | null; created_at: string;
}

/** SHA-256 hex via the Web Crypto SubtleCrypto API (Workers-safe; no node:crypto). */
const hash = async (layout: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(layout));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Serialize a row to the product PageOut shape. */
export function serializePage(r: CompatPageRow): Record<string, unknown> {
    let layout: unknown;
    try { layout = JSON.parse(r.layout_data); } catch { layout = { content: [], root: {} }; }
    return {
        id: r.id, name: r.name, slug: r.slug, title: r.title, description: r.description,
        keywords: r.keywords, isPublic: !!r.is_public, isHomepage: !!r.is_homepage, isPublished: !!r.is_published,
        layoutData: layout, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
        contentHash: r.content_hash, hasUnpublishedChanges: true, deployments: [],
    };
}

export class PagesStore {
    constructor(private runner: DbRunner, private tenant: string) {}

    async list(): Promise<CompatPageRow[]> {
        return await this.runner.query(
            'SELECT id, name, slug, title, description, keywords, is_public, is_homepage, is_published, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at FROM compat_pages WHERE tenant_slug = ? AND deleted_at IS NULL ORDER BY created_at',
            [this.tenant],
        ) as unknown as CompatPageRow[];
    }
    async get(id: string): Promise<CompatPageRow | null> {
        const rows = await this.runner.query(
            'SELECT id, name, slug, title, description, keywords, is_public, is_homepage, is_published, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at FROM compat_pages WHERE tenant_slug = ? AND id = ?',
            [this.tenant, id],
        );
        return (rows[0] as unknown as CompatPageRow) ?? null;
    }
    async getBySlug(slug: string, includeDeleted = false): Promise<CompatPageRow | null> {
        const rows = await this.runner.query(
            `SELECT id, name, slug, title, description, keywords, is_public, is_homepage, is_published, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at FROM compat_pages WHERE tenant_slug = ? AND slug = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
            [this.tenant, slug],
        );
        return (rows[0] as unknown as CompatPageRow) ?? null;
    }
    async homepage(): Promise<CompatPageRow | null> {
        const rows = await this.runner.query(
            'SELECT id, name, slug, title, description, keywords, is_public, is_homepage, is_published, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at FROM compat_pages WHERE tenant_slug = ? AND is_homepage = 1 AND deleted_at IS NULL',
            [this.tenant],
        );
        return (rows[0] as unknown as CompatPageRow) ?? null;
    }

    async create(input: { name: string; slug: string; title?: string | null; description?: string | null; layout_data?: unknown }, id: string, now: string): Promise<CompatPageRow> {
        const layout = JSON.stringify(input.layout_data ?? { content: [], root: {} });
        const ch = await hash(layout);
        await this.runner.exec(
            'INSERT INTO compat_pages (id, tenant_slug, name, slug, title, description, keywords, is_public, is_homepage, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, this.tenant, input.name, input.slug, input.title ?? null, input.description ?? null, null, 1, 0, layout, null, null, ch, now, now],
        );
        return { id, name: input.name, slug: input.slug, title: input.title ?? null, description: input.description ?? null, keywords: null, is_public: 1, is_homepage: 0, is_published: 0, layout_data: layout, seo_data: null, deleted_at: null, content_hash: ch, created_at: now, updated_at: now };
    }

    async update(id: string, patch: { name?: string; title?: string | null; description?: string | null; slug?: string; keywords?: string | null; isPublic?: boolean; isHomepage?: boolean; layoutData?: unknown; layout_data?: unknown }, now: string): Promise<CompatPageRow | null> {
        const existing = await this.get(id);
        if (!existing) return null;
        const merged = {
            name: patch.name ?? existing.name, slug: patch.slug ?? existing.slug,
            title: patch.title !== undefined ? patch.title : existing.title,
            description: patch.description !== undefined ? patch.description : existing.description,
            keywords: patch.keywords !== undefined ? patch.keywords : existing.keywords,
            is_public: patch.isPublic !== undefined ? (patch.isPublic ? 1 : 0) : existing.is_public,
            is_homepage: patch.isHomepage !== undefined ? (patch.isHomepage ? 1 : 0) : existing.is_homepage,
        };
        // The product's Save sends the FULL page via PUT /api/pages/{id}/, including
        // layoutData. Without this, update() persisted only metadata and silently
        // dropped the canvas — so a refresh re-fetched an empty layout (CF-22 bug).
        // The dedicated /layout/ route still calls setLayout directly.
        const layoutSource = patch.layoutData ?? patch.layout_data;
        let layout_data = existing.layout_data;
        let content_hash = existing.content_hash;
        if (layoutSource !== undefined) {
            layout_data = typeof layoutSource === 'string' ? layoutSource : JSON.stringify(layoutSource);
            content_hash = await hash(layout_data);
        }
        await this.runner.exec(
            'UPDATE compat_pages SET name=?, slug=?, title=?, description=?, keywords=?, is_public=?, is_homepage=?, layout_data=?, content_hash=?, updated_at=? WHERE tenant_slug=? AND id=?',
            [merged.name, merged.slug, merged.title, merged.description, merged.keywords, merged.is_public, merged.is_homepage, layout_data, content_hash, now, this.tenant, id],
        );
        return { ...existing, ...merged, layout_data, content_hash, updated_at: now } as CompatPageRow;
    }

    async setLayout(id: string, layoutData: unknown, now: string): Promise<CompatPageRow | null> {
        const existing = await this.get(id);
        if (!existing) return null;
        const layout = typeof layoutData === 'string' ? layoutData : JSON.stringify(layoutData);
        const ch = await hash(layout);
        await this.runner.exec('UPDATE compat_pages SET layout_data=?, content_hash=?, updated_at=? WHERE tenant_slug=? AND id=?', [layout, ch, now, this.tenant, id]);
        return { ...existing, layout_data: layout, content_hash: ch, updated_at: now };
    }

    async softDelete(id: string, now: string): Promise<boolean> {
        await this.runner.exec('UPDATE compat_pages SET deleted_at=?, updated_at=? WHERE tenant_slug=? AND id=? AND deleted_at IS NULL', [now, now, this.tenant, id]);
        return true;
    }
    async restore(id: string, now: string): Promise<CompatPageRow | null> {
        await this.runner.exec('UPDATE compat_pages SET deleted_at=NULL, updated_at=? WHERE tenant_slug=? AND id=?', [now, this.tenant, id]);
        return this.get(id);
    }
    async permanentDelete(id: string): Promise<boolean> {
        await this.runner.exec('DELETE FROM compat_pages WHERE tenant_slug=? AND id=?', [this.tenant, id]);
        await this.runner.exec('DELETE FROM compat_page_versions WHERE tenant_slug=? AND page_id=?', [this.tenant, id]);
        return true;
    }

    // Community publish = mark live; returns a synthetic "deployment" result.
    async publish(id: string, _engineId: string, now: string): Promise<{ success: boolean; previewUrl: string | null; version: number; message: string } | { success: false; error: string }> {
        const p = await this.get(id);
        if (!p) return { success: false, error: 'Page not found' };
        // Mark the page live — the eSSR serves rows with is_published = 1.
        await this.runner.exec(
            'UPDATE compat_pages SET is_published = 1, updated_at = ? WHERE tenant_slug = ? AND id = ?',
            [now, this.tenant, id],
        );
        // snapshot a version on publish
        await this.snapshot(id, p.layout_data, p.content_hash, `Published ${now}`, now);
        return { success: true, previewUrl: null, version: 1, message: `Page '${p.name}' published` };
    }

    /** Take a page offline (unpublish). The eSSR stops serving it. */
    async unpublish(id: string, now: string): Promise<boolean> {
        await this.runner.exec(
            'UPDATE compat_pages SET is_published = 0, updated_at = ? WHERE tenant_slug = ? AND id = ?',
            [now, this.tenant, id],
        );
        return true;
    }

    /**
     * Seed a default homepage template if no homepage exists (fresh deploy). The
     * page is a normal compat_pages row — published (live at `/`) and fully
     * editable/deletable in the console. Idempotent: only creates when no
     * is_homepage page exists.
     */
    async ensureHomepage(now: string): Promise<void> {
        const existing = await this.runner.query(
            'SELECT id FROM compat_pages WHERE tenant_slug = ? AND is_homepage = 1 AND deleted_at IS NULL LIMIT 1',
            [this.tenant],
        );
        if (existing.length > 0) return;
        const layout = JSON.stringify({
            root: {},
            content: [
                { id: 'seed-h', type: 'Heading', props: { content: 'Welcome to your new site', level: 'h1' } },
                { id: 'seed-t', type: 'Text', props: { content: 'This is your homepage. Edit it in the admin console, then publish to make changes live.' } },
                { id: 'seed-l', type: 'Link', props: { text: 'Open the admin console →', href: '/frontbase-admin', color: '#4338ca', underline: true } },
            ],
        });
        const ch = await hash(layout);
        await this.runner.exec(
            'INSERT INTO compat_pages (id, tenant_slug, name, slug, title, description, keywords, is_public, is_homepage, is_published, layout_data, seo_data, deleted_at, content_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [crypto.randomUUID(), this.tenant, 'Home', 'home', 'Home', null, null, 1, 1, 1, layout, null, null, ch, now, now],
        );
    }

    // ---- versions ----
    async listVersions(pageId: string): Promise<CompatVersionRow[]> {
        return await this.runner.query('SELECT id, page_id, version_number, layout_data, content_hash, label, created_at FROM compat_page_versions WHERE tenant_slug=? AND page_id=? ORDER BY version_number DESC', [this.tenant, pageId]) as unknown as CompatVersionRow[];
    }
    async getVersion(versionId: string): Promise<CompatVersionRow | null> {
        const rows = await this.runner.query('SELECT id, page_id, version_number, layout_data, content_hash, label, created_at FROM compat_page_versions WHERE tenant_slug=? AND id=?', [this.tenant, versionId]);
        return (rows[0] as unknown as CompatVersionRow) ?? null;
    }
    async snapshot(pageId: string, layout: string, contentHash: string | null, label: string | null, now: string): Promise<CompatVersionRow> {
        const max = await this.runner.query('SELECT MAX(version_number) AS m FROM compat_page_versions WHERE tenant_slug=? AND page_id=?', [this.tenant, pageId]);
        const next = (Number((max[0] as Record<string, unknown>)?.m ?? 0)) + 1;
        const id = crypto.randomUUID();
        await this.runner.exec('INSERT INTO compat_page_versions (id, page_id, tenant_slug, version_number, layout_data, content_hash, label, created_at) VALUES (?,?,?,?,?,?,?,?)', [id, pageId, this.tenant, next, layout, contentHash, label, now]);
        return { id, page_id: pageId, version_number: next, layout_data: layout, content_hash: contentHash, label, created_at: now };
    }
    async rollback(pageId: string, versionId: string, now: string): Promise<{ page: CompatPageRow; version: CompatVersionRow; preRollbackVersion: CompatVersionRow } | null> {
        const v = await this.getVersion(versionId);
        const page = await this.get(pageId);
        if (!v || !page) return null;
        // snapshot current before rolling back, then restore the target layout
        const preRollbackVersion = await this.snapshot(pageId, page.layout_data, page.content_hash, `Pre-rollback`, now);
        await this.runner.exec('UPDATE compat_pages SET layout_data=?, content_hash=?, updated_at=? WHERE tenant_slug=? AND id=?', [v.layout_data, v.content_hash, now, this.tenant, pageId]);
        return {
            page: { ...page, layout_data: v.layout_data, content_hash: v.content_hash, updated_at: now },
            version: v,
            preRollbackVersion,
        };
    }
}
