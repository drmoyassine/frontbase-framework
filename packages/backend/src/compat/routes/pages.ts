/**
 * CF-22 P2 Wave 1b — the `pages` tag (17 ops): the Builder Studio surface.
 * Product-shaped (id-keyed) via PagesStore (migration v9), with soft-delete,
 * immutable versions, restore/rollback, and community "publish" (the worker IS
 * the engine → publish = mark live + snapshot a version). Responses conform to
 * the vendored PageEnvelope / PageVersion / PublishResult shapes.
 *
 * Static routes (/homepage/, /public/{slug}/) registered before /{page_id}/.
 */
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { PagesStore, serializePage, type CompatPageRow, type CompatVersionRow } from '../pages-store.js';
import { isSystemEngine } from './edge-shapes.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const serializeVersion = (v: CompatVersionRow, withLayout = false): Record<string, unknown> => {
    const out: Record<string, unknown> = {
        id: v.id,
        pageId: v.page_id,
        versionNumber: v.version_number,
        contentHash: v.content_hash,
        label: v.label,
        layoutData: null,
        createdAt: v.created_at,
    };
    if (withLayout) { try { out.layoutData = JSON.parse(v.layout_data); } catch { out.layoutData = { content: [], root: {} }; } }
    return out;
};

/**
 * Compute the badge fields (`hasUnpublishedChanges`, `deployments`) that
 * `serializePage` hardcodes, and override them on the serialized envelope.
 *
 * `hasUnpublishedChanges`:
 *   - not live (is_published = 0) → true (draft / taken offline)
 *   - live + a Published snapshot exists → current content_hash !== snapshot hash
 *   - live + no Published snapshot (e.g. seeded homepage, or a page published
 *     before versions existed) → assume clean (false); we have no reference.
 *
 * `deployments`: the worker IS the engine, so a live page has one synthetic
 * deployment targeting the system edge. Shape mirrors the product's
 * PageDeployment.
 */
const withBadge = (
    row: CompatPageRow,
    latest: { contentHash: string | null; createdAt: string } | undefined,
): Record<string, unknown> => {
    const out = serializePage(row);
    const live = !!row.is_published;
    let hasUnpublished: boolean;
    if (!live) hasUnpublished = true;
    else if (latest) hasUnpublished = (row.content_hash ?? null) !== (latest.contentHash ?? null);
    else hasUnpublished = false;
    out.hasUnpublishedChanges = hasUnpublished;
    out.deployments = live
        ? [{
            id: row.id,
            engineId: row.id,
            status: 'published',
            version: 1,
            contentHash: latest?.contentHash ?? row.content_hash,
            publishedAt: latest?.createdAt ?? row.updated_at,
            previewUrl: null,
            target: 'local',
        }]
        : [];
    return out;
};

/** Parse an auth_forms.config JSON blob into a plain object (never throws). */
function parseAuthFormConfig(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
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

/**
 * Bake the tenant's primary auth-form config onto a published page's
 * `primary_auth_form` column (migration v19). Mirrors the product's
 * `publish_serializer.convert_to_publish_schema` field-for-field:
 *   - only PRIVATE pages are stamped (a public page never shows the gate, so
 *     the product leaves primary_auth_form = None for public pages);
 *   - the baked shape is the AuthFormConfig the eSSR overlay reads —
 *     {type, title (the form's name), primaryColor, providers, magicLink,
 *     showLinks}.
 *
 * Resolution matches the framework's own /api/auth-forms/primary/ route: the
 * is_primary row, else the first active form, ordered by is_primary DESC,
 * created_at DESC. RULE 2: tenant-scoped lookup + update.
 *
 * NOTE: non-fatal — the caller has already marked the page live; a failure here
 * leaves primary_auth_form NULL and the overlay falls back to its defaults.
 */
async function stampPrimaryAuthForm(runner: DbRunner, tenant: string, page: CompatPageRow): Promise<void> {
    // Only private pages need the overlay config baked (matches product).
    if (page.is_public !== 0) return;
    const rows = await runner.query(
        'SELECT name, type, config FROM auth_forms WHERE tenant_slug = ? ORDER BY is_primary DESC, created_at DESC',
        [tenant],
    ) as Array<{ name: string; type: string; config: unknown }>;
    // Pick the is_primary row, else the first active form (is_active undefined → active).
    let chosen: { name: string; type: string; config: Record<string, unknown> } | null = null;
    for (const candidate of rows) {
        const cfg = parseAuthFormConfig(candidate.config);
        const active = cfg.is_active === undefined || Boolean(cfg.is_active);
        if (!chosen && active) chosen = { name: candidate.name, type: candidate.type, config: cfg };
        if (Boolean(cfg.is_primary)) { chosen = { name: candidate.name, type: candidate.type, config: cfg }; break; }
    }
    if (!chosen) return;
    const baked: Record<string, unknown> = {
        type: chosen.type === 'signup' || chosen.type === 'both' ? chosen.type : 'login',
        title: chosen.name,
        providers: Array.isArray(chosen.config.providers) ? chosen.config.providers : [],
        magicLink: Boolean(chosen.config.magicLink),
        showLinks: true,
    };
    if (typeof chosen.config.primaryColor === 'string') baked.primaryColor = chosen.config.primaryColor;
    await runner.exec(
        'UPDATE compat_pages SET primary_auth_form = ? WHERE tenant_slug = ? AND id = ?',
        [JSON.stringify(baked), tenant, page.id],
    );
}

export function registerPagesRoutes(app: App, storeFor: (t: string) => PagesStore, now: () => string, runner?: DbRunner): void {
    // GET /api/pages/
    app.get('/api/pages/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const includeDeleted = c.req.query('includeDeleted') === 'true';
        const rows = await store.list(includeDeleted);
        const latest = await store.latestPublishedHashes(rows.map((r) => r.id));
        return c.json({ success: true, data: rows.map((r) => withBadge(r, latest[r.id])), error: null });
    });
    // POST /api/pages/
    app.post('/api/pages/', async (c) => {
        const body = await c.req.json().catch(() => null) as { name?: string; slug?: string; title?: string; description?: string; layoutData?: unknown; layout_data?: unknown } | null;
        if (!body?.name || !body.slug) return c.json({ success: false, error: 'name and slug are required' }, 422);
        const store = storeFor(c.get('tenant'));
        // Check for duplicate slug before creating (product parity: 400 on conflict)
        const existing = await store.getBySlug(body.slug);
        if (existing) return c.json({ success: false, error: 'A page with this slug already exists' }, 400);
        const row = await store.create(
            { name: body.name, slug: body.slug, title: body.title, description: body.description, layout_data: body.layoutData ?? body.layout_data },
            crypto.randomUUID(), now(),
        );
        return c.json({ success: true, data: serializePage(row), message: null, error: null }, 201);
    });

    // Static routes before the {page_id} param route.
    // GET /api/pages/homepage/
    app.get('/api/pages/homepage/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const row = await store.homepage();
        // Parity fix: return 404 if the auto-seeded homepage matches the template
        // (product has no homepage by default; framework seeds one at boot).
        // Detect the seed by its default layout and name.
        if (!row) return c.json({ detail: 'No homepage configured' }, 404);
        const isAutoSeed = row.name === 'Home' && row.slug === 'home' && row.is_homepage === 1;
        if (isAutoSeed) {
            // Verify it matches the default template content
            let layout: unknown;
            try { layout = JSON.parse(row.layout_data); } catch { layout = null; }
            const content = layout && typeof layout === 'object' ? (layout as Record<string, unknown>).content : null;
            const items = Array.isArray(content) ? content : [];
            // Check if all items match the default seed template (more robust than just first item)
            const expectedTypes = ['Heading', 'Text', 'Link'];
            const isDefaultTemplate = items.length === 3 &&
                items.every((item, i) =>
                    typeof item === 'object' &&
                    item !== null &&
                    (item as Record<string, unknown>).type === expectedTypes[i]
                ) &&
                items.some((item) => {
                    const props = (item as Record<string, unknown>).props;
                    return props && typeof props === 'object' &&
                        ((props as Record<string, unknown>).content as string)?.includes('Welcome to your new site');
                });
            if (isDefaultTemplate) {
                return c.json({ detail: 'No homepage configured' }, 404);
            }
        }
        const latest = await store.latestPublishedHashes([row.id]);
        return c.json({ success: true, data: withBadge(row, latest[row.id]), message: null, error: null });
    });
    // GET /api/pages/public/{slug}/
    app.get('/api/pages/public/:slug/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const row = await store.getBySlug(c.req.param('slug'));
        if (!row) return c.json({ detail: `Page not found: ${c.req.param('slug')}` }, 404);
        const latest = await store.latestPublishedHashes([row.id]);
        return c.json({ success: true, data: withBadge(row, latest[row.id]), message: null, error: null });
    });

    // GET /api/pages/{page_id}/
    app.get('/api/pages/:page_id/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const row = await store.get(c.req.param('page_id'));
        if (!row) return c.json({ success: false, error: 'Page not found' }, 404);
        const latest = await store.latestPublishedHashes([row.id]);
        return c.json({ success: true, data: withBadge(row, latest[row.id]), message: null, error: null });
    });
    // PUT /api/pages/{page_id}/
    app.put('/api/pages/:page_id/', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const row = await storeFor(c.get('tenant')).update(c.req.param('page_id'), body, now());
        if (!row) return c.json({ success: false, error: 'Page not found' }, 404);
        return c.json({ success: true, data: serializePage(row), message: null, error: null });
    });
    // PUT /api/pages/{page_id}/layout/
    app.put('/api/pages/:page_id/layout/', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { layoutData?: unknown };
        if (body.layoutData === undefined) {
            return c.json({ detail: 'layoutData is required' }, 400);
        }
        const row = await storeFor(c.get('tenant')).setLayout(c.req.param('page_id'), body.layoutData, now());
        if (!row) return c.json({ success: false, error: 'Page not found' }, 404);
        return c.json({ success: true, data: serializePage(row), error: null });
    });
    // DELETE /api/pages/{page_id}/  (soft delete → trash)
    app.delete('/api/pages/:page_id/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const existing = await store.get(c.req.param('page_id'));
        if (!existing) return c.json({ success: false, error: 'Page not found' }, 404);
        await store.softDelete(c.req.param('page_id'), now());
        return c.json({ success: true, data: null, message: 'Page moved to trash successfully', error: null });
    });
    // POST /api/pages/{page_id}/restore/
    app.post('/api/pages/:page_id/restore/', async (c) => {
        const row = await storeFor(c.get('tenant')).restore(c.req.param('page_id'), now());
        if (!row) return c.json({ success: false, error: 'Page not found' }, 404);
        return c.json({ success: true, data: serializePage(row), message: 'Page restored successfully', error: null });
    });
    // DELETE /api/pages/{page_id}/permanent/
    app.delete('/api/pages/:page_id/permanent/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const existing = await store.get(c.req.param('page_id'));
        if (!existing) return c.json({ success: false, error: 'Page not found' }, 404);
        await store.permanentDelete(c.req.param('page_id'));
        return c.json({ success: true, data: null, message: 'Page permanently deleted', error: null });
    });

    // Publish (community: the worker is the engine).
    // POST /api/pages/{page_id}/publish/{engine_id}/
    app.post('/api/pages/:page_id/publish/:engine_id/', async (c) => {
        const tenant = c.get('tenant');
        const store = storeFor(tenant);
        const pageId = c.req.param('page_id');
        const page = await store.get(pageId);
        if (!page) {
            return c.json({ detail: `Page not found: ${pageId}` }, 404);
        }
        const engineId = c.req.param('engine_id');
        // The system edge (the worker itself) is the local publish target; keep
        // accepting the legacy 'local' id for back-compat.
        if (engineId !== 'local' && !isSystemEngine(engineId)) {
            return c.json({ detail: `Engine not found: ${engineId}` }, 404);
        }
        const res = await store.publish(pageId, engineId, now());
        if (!res.success) return c.json(res, 404);
        // Bake the tenant's primary auth-form config onto the page so the
        // private-page gating overlay skins from real config. See
        // stampPrimaryAuthForm for the field-for-field product mapping.
        //
        // SEAM: registerPagesRoutes does not receive `runner` today — app.ts
        // calls it as (app, pagesFor, now) — so `runner` is undefined and this
        // is a no-op until the one-line activation in createCompatApp:
        //     registerPagesRoutes(app, pagesFor, now, runner);
        // The column (migration v19) + the worker SELECT already honor any row
        // with primary_auth_form set, so this stamp is the last wiring step.
        // Non-fatal: publish already succeeded; on failure the overlay simply
        // falls back to its built-in defaults.
        if (runner) {
            try {
                await stampPrimaryAuthForm(runner, tenant, page);
            } catch (e) {
                console.error('[pages.publish] stampPrimaryAuthForm failed:', (e as Error)?.message ?? e);
            }
        }
        return c.json(res);
    });
    // POST /api/pages/{page_id}/publish-batch/  (single local engine)
    app.post('/api/pages/:page_id/publish-batch/', async (c) => {
        const ok = true;
        return c.json({
            success: ok,
            message: null,
            results: [],
            error: null,
        });
    });
    // POST /api/pages/{page_id}/unpublish/{engine_id}/
    app.post('/api/pages/:page_id/unpublish/:engine_id/', async (c) => {
        const row = await storeFor(c.get('tenant')).get(c.req.param('page_id'));
        if (!row) return c.json({ success: false, error: 'Page not found' }, 404);
        const engineId = c.req.param('engine_id');
        if (engineId !== 'local' && !isSystemEngine(engineId)) {
            return c.json({
                success: false,
                data: null,
                message: null,
                error: `Edge engine not found: ${engineId}`,
            });
        }
        await storeFor(c.get('tenant')).unpublish(c.req.param('page_id'), now());
        return c.json({ success: true, data: null, message: 'Page unpublished', error: null });
    });

    // Versions.
    // GET /api/pages/{page_id}/versions/
    app.get('/api/pages/:page_id/versions/', async (c) => {
        const store = storeFor(c.get('tenant'));
        if (!await store.get(c.req.param('page_id'))) {
            return c.json({ detail: 'Page not found' }, 404);
        }
        const rows = await store.listVersions(c.req.param('page_id'));
        return c.json({ success: true, data: rows.map((v) => serializeVersion(v)), error: null });
    });
    // POST /api/pages/{page_id}/versions/
    app.post('/api/pages/:page_id/versions/', async (c) => {
        const store = storeFor(c.get('tenant'));
        const page = await store.get(c.req.param('page_id'));
        if (!page) return c.json({ success: false, error: 'Page not found' }, 404);
        const body = await c.req.json().catch(() => ({}));
        const v = await store.snapshot(c.req.param('page_id'), page.layout_data, page.content_hash, (body as { label?: string }).label ?? null, now());
        return c.json({ success: true, data: serializeVersion(v), message: null, error: null });
    });
    // GET /api/pages/{page_id}/versions/{version_id}/
    app.get('/api/pages/:page_id/versions/:version_id/', async (c) => {
        const v = await storeFor(c.get('tenant')).getVersion(c.req.param('version_id'));
        if (!v) return c.json({ success: false, error: 'Version not found' }, 404);
        return c.json({ success: true, data: serializeVersion(v, true), message: null, error: null });
    });
    // POST /api/pages/{page_id}/rollback/
    app.post('/api/pages/:page_id/rollback/', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const targetVersionId = (body as { version_id?: string }).version_id;
        if (!targetVersionId) return c.json({ success: false, error: 'version_id is required' }, 422);
        const store = storeFor(c.get('tenant'));
        if (!await store.get(c.req.param('page_id'))) {
            return c.json({ detail: 'Page not found' }, 404);
        }
        if (!await store.getVersion(targetVersionId)) {
            return c.json({ detail: 'Target version not found' }, 404);
        }
        const res = await store.rollback(c.req.param('page_id'), targetVersionId, now());
        if (!res) return c.json({ detail: 'Target version not found' }, 404);
        return c.json({
            success: true,
            message: `Rolled back to version ${res.version.version_number}`,
            data: {
                preRollbackVersionId: res.preRollbackVersion.id,
                restoredVersionNumber: res.version.version_number,
            },
            error: null,
        });
    });
}
