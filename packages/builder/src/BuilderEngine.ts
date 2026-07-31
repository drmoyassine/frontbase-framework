/**
 * Builder Engine — Hono app serving the builder UI.
 *
 * Serves the eSSR-based builder canvas with editing capabilities.
 * Provides API endpoints for component CRUD operations.
 *
 * Phase 1 (WYSIWYG canvas): The canvas is now an iframe rendering the SAME
 * renderDocument output as published pages, guaranteeing byte-identical
 * styling. The editing client is thin (DOM-only) and round-trips edits
 * through server endpoints that re-render via renderPage.
 */

import { Hono, type MiddlewareHandler } from 'hono';
import { renderPage, renderDocument } from '@frontbase/edge-core';
import { FALLBACK_CSS } from '@frontbase/edge-core/ssr/baseStyles';
import type { PageLayoutData, PageComponent } from '@frontbase/edge-core';
import type { PageEntry } from '@frontbase/edge-core';
import { globalRegistry } from './registry/index.js';
import type { ComponentDefinition, ComponentTree } from './registry/EditableSchema.js';

/** Simple HTML escape function (same as edge-core's escapeHtml). */
function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Build system context (UTC) - matches edge-core's buildSystemContext. */
function buildSystemContext() {
    const now = new Date();
    const iso = now.toISOString();
    const parts = iso.split('T');
    const datePart = parts[0] || '';
    const timePart = parts[1]?.split('.')[0] || '';
    return {
        date: datePart,
        time: timePart,
        datetime: iso,
        timestamp: now.getTime(),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        env: 'production',
    };
}

/**
 * Builder engine options.
 */
export interface BuilderEngineOptions {
    /** Load a page by ID. Returns the page data with layout. */
    loadPage: (pageId: string) => Promise<{ id: string; layout: PageLayoutData } | null>;

    /** Save page layout. Called when user saves or auto-saves. */
    savePage: (pageId: string, layout: PageLayoutData) => Promise<void>;

    /** Get component registry export. Used by the client-side editor. */
    getRegistry?: () => ReturnType<typeof globalRegistry.exportForAgent>;

    /** Optional: Custom builder HTML template. */
    builderTemplate?: (pageId: string, canvasHtml: string, registryJson: string) => string;

    /** Optional: Enable/Disable auto-save. */
    autoSave?: boolean;

    /** Optional: Auto-save delay in milliseconds. */
    autoSaveDelay?: number;

    /** Optional: URL of the client-side editing bundle (Phase 2). */
    clientBundle?: string;

    /**
     * Optional: auth middleware applied to EVERY builder route as the FIRST
     * handler (e.g. a session gate that 302-redirects to /frontbase-admin when
     * there is no principal). Supplied by the host worker — the builder only
     * APPLIES it, so RULE 1 holds (no edge-infra/auth import in this package).
     * Hono runs handlers in registration order, so this is wired in BEFORE any
     * route is registered; adding it later (after routes) is a no-op.
     */
    authMiddleware?: MiddlewareHandler;
}

/**
 * Component update operation.
 */
export interface ComponentUpdate {
    operation: 'add' | 'update' | 'remove' | 'reorder';
    componentId?: string;
    data?: Record<string, unknown>;
    parentId?: string;
    index?: number;
    /**
     * Phase 4 styling surface: for 'update', whether `data` merges into
     * component.props ('prop', default) or component.stylesData.values
     * ('stylesData'). stylesData is applied as inline CSS on both canvas and
     * published via stylesDataToCSS — one render path, true WYSIWYG.
     */
    styleTarget?: 'prop' | 'stylesData';
}

/**
 * Hono context with page ID.
 */
interface BuilderContext {
    pageId?: string;
}

/**
 * Create the builder engine Hono app.
 */
export function createBuilderEngine(opts: BuilderEngineOptions): Hono {
    const app = new Hono();
    // Auth gate FIRST. Hono dispatches handlers in registration order, so a gate
    // registered after the routes (or on a parent app.use that doesn't cascade
    // onto mounted sub-apps) never runs before them. Applying the host-supplied
    // gate here, before any route, guarantees every /builder/* route requires a
    // session.
    if (opts.authMiddleware) app.use('*', opts.authMiddleware);
    const autoSaveDelay = opts.autoSaveDelay ?? 2000;

    /**
     * Render the builder canvas HTML with iframe WYSIWYG (Phase 1).
     *
     * The canvas is now an iframe rendering the SAME renderDocument output as
     * published pages, guaranteeing byte-identical styling. The iframe's srcdoc
     * contains the full HTML document with FALLBACK_CSS, exactly what a visitor
     * sees when visiting the published page.
     */
    async function renderBuilderCanvas(pageId: string, layout: PageLayoutData, pageData?: { title?: string; slug?: string; description?: string }): Promise<string> {
        // Build PageEntry for renderDocument (matches published page structure)
        const system = buildSystemContext();
        const pageEntry: PageEntry = {
            title: pageData?.title ?? '',
            slug: pageData?.slug ?? pageId,
            description: pageData?.description,
            layout, // Include the layout for renderDocument (it only uses metadata, but type requires it)
        };

        // Build TemplateContext matching engine.ts buildContext
        const ctx = {
            page: {
                id: pageId,
                title: pageEntry.title,
                url: `/${pageEntry.slug}`,
                slug: pageEntry.slug,
                description: pageEntry.description ?? '',
                published: true,
                createdAt: '',
                updatedAt: '',
                image: '',
                type: 'page',
                custom: {},
            },
            user: null,
            visitor: {} as any,
            url: {},
            system: {
                date: system.date,
                time: system.time,
                datetime: system.datetime,
                timestamp: system.timestamp,
                year: system.year,
                month: system.month,
                day: system.day,
                env: 'builder',
            },
            cookies: {},
            local: {},
            session: {},
            records: [],
            app: { environment: 'builder', manifestVersion: 1 },
        };

        // Render the page body using eSSR (same as published pages)
        const bodyHtml = await renderPage(layout, ctx);

        // Render the full document with FALLBACK_CSS (same as published)
        const canvasDocument = renderDocument(pageEntry, bodyHtml, {
            environment: 'builder',
            registerServiceWorker: false,
        });

        // Export registry for client-side editor
        const registryJson = JSON.stringify(opts.getRegistry ? opts.getRegistry() : globalRegistry.exportForAgent());
        // Component tree for the editing client's bootstrap — it instantiates
        // Editor and calls load() with these. Without it the tree/property panels
        // stay empty (the bundle only DEFINES Editor; nothing feeds it the page).
        const layoutJson = JSON.stringify(layout.content ?? []);

        // Use custom template or default
        if (opts.builderTemplate) {
            return opts.builderTemplate(pageId, canvasDocument, registryJson);
        }

        // Default builder template with iframe canvas
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Builder - ${pageId}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
        #fb-builder { display: flex; height: 100vh; }
        #fb-tree-view { width: 250px; background: white; border-right: 1px solid #e5e7eb; overflow-y: auto; flex-shrink: 0; }
        #fb-canvas-container { flex: 1; position: relative; overflow: auto; }
        #fb-canvas { width: 100%; min-height: 100%; border: none; display: block; }
        #fb-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        #fb-overlay * { pointer-events: auto; }
        #fb-selection { position: absolute; border: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.1); pointer-events: none; }
        #fb-selection.selected { border-color: #2563eb; background: rgba(37, 99, 235, 0.2); }
        #fb-property-panel { width: 320px; background: white; border-left: 1px solid #e5e7eb; overflow-y: auto; flex-shrink: 0; }
        .fb-prop-group { padding: 1rem; border-bottom: 1px solid #e5e7eb; }
        .fb-prop-group-title { font-weight: 600; margin-bottom: 0.5rem; font-size: 0.875rem; }
        .fb-prop-field { margin-bottom: 1rem; }
        .fb-prop-label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; }
        .fb-prop-required { color: #ef4444; }
        .fb-prop-input { width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; }
        .fb-prop-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        .fb-tree-item { padding: 0.5rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
        .fb-tree-item:hover { background: #f3f4f6; }
        .fb-tree-item.selected { background: #dbeafe; color: #1e40af; }
        .fb-loading { text-align: center; padding: 2rem; color: #6b7280; }
    </style>
</head>
<body>
    <div id="fb-builder">
        <div id="fb-tree-view"></div>
        <div id="fb-canvas-container">
            <iframe id="fb-canvas" style="border:none; width:100%; min-height:100%; display:block;"></iframe>
            <script>
                (function() {
                    var iframe = document.getElementById('fb-canvas');
                    var content = ${JSON.stringify(canvasDocument)};
                    console.log('[BUILDER DEBUG] canvasDocument length:', content.length);
                    console.log('[BUILDER DEBUG] First 200 chars:', content.substring(0, 200));
                    console.log('[BUILDER DEBUG] Includes <!DOCTYPE html>:', content.includes('<!DOCTYPE html>'));
                    console.log('[BUILDER DEBUG] Includes <html>:', content.includes('<html'));
                    console.log('[BUILDER DEBUG] Includes frontbase-admin:', content.includes('frontbase-admin'));
                    // Try both methods for maximum compatibility
                    try {
                        iframe.srcdoc = content;
                        console.log('[BUILDER DEBUG] srcdoc set successfully');
                    } catch(e) {
                        console.error('[BUILDER DEBUG] srcdoc failed:', e);
                        iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(content);
                    }
                })();
            </script>
            <svg id="fb-overlay"></svg>
        </div>
        <div id="fb-property-panel"></div>
    </div>
    <script>
        window.__FRONTBASE_REGISTRY__ = ${registryJson};
        window.__FRONTBASE_PAGE_ID__ = '${pageId}';
        window.__FRONTBASE_LAYOUT__ = ${layoutJson};
    </script>
    ${opts.clientBundle ? `<script type="module" src="${escapeHtml(opts.clientBundle)}"></script>` : '<script type="module" src="/editing/client/index.js"></script>'}
</body>
</html>`;
    }

    /**
     * GET /builder/edit/:pageId - Serve the builder UI
     */
    app.get('/edit/:pageId', async (c) => {
        const pageId = c.req.param('pageId');

        try {
            const page = await opts.loadPage(pageId);
            if (!page) {
                return c.html('<h1>Page not found</h1>', 404);
            }

            const html = await renderBuilderCanvas(pageId, page.layout);
            return c.html(html, 200, {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
        } catch (error) {
            console.error('[BuilderEngine] Error loading page:', error);
            return c.html('<h1>Error loading page</h1>', 500);
        }
    });

    /**
     * POST /builder/api/components - Handle component CRUD operations
     */
    app.post('/api/components', async (c) => {
        const pageId = c.req.header('x-page-id') || '';

        try {
            const update: ComponentUpdate = await c.req.json();
            const page = await opts.loadPage(pageId);

            if (!page) {
                return c.json({ error: 'Page not found' }, 404);
            }

            let layout = page.layout;

            switch (update.operation) {
                case 'update':
                    if (update.componentId && update.data) {
                        layout = update.styleTarget === 'stylesData'
                            ? updateComponentStyles(layout, update.componentId, update.data)
                            : updateComponentProps(layout, update.componentId, update.data);
                    }
                    break;

                case 'add':
                    if (update.data) {
                        layout = addComponent(layout, update.data, update.parentId, update.index);
                    }
                    break;

                case 'remove':
                    if (update.componentId) {
                        layout = removeComponent(layout, update.componentId);
                    }
                    break;

                case 'reorder':
                    if (update.componentId && typeof update.index === 'number') {
                        layout = reorderComponent(layout, update.componentId, update.index);
                    }
                    break;

                default:
                    return c.json({ error: 'Unknown operation' }, 400);
            }

            // Save the updated layout
            await opts.savePage(pageId, layout);

            // Re-render the canvas HTML for instant WYSIWYG update
            const system = buildSystemContext();
            const ctx = {
                page: {
                    id: pageId,
                    title: '',
                    url: `/${pageId}`,
                    slug: pageId,
                    description: '',
                    published: true,
                    createdAt: '',
                    updatedAt: '',
                    image: '',
                    type: 'page',
                    custom: {},
                },
                user: null,
                visitor: {} as any,
                url: {},
                system: {
                    date: system.date,
                    time: system.time,
                    datetime: system.datetime,
                    timestamp: system.timestamp,
                    year: system.year,
                    month: system.month,
                    day: system.day,
                    env: 'builder',
                },
                cookies: {},
                local: {},
                session: {},
                records: [],
                app: { environment: 'builder', manifestVersion: 1 },
            };
            const bodyHtml = await renderPage(layout, ctx);
            const canvasHtml = renderDocument({ title: '', slug: pageId, layout }, bodyHtml, {
                environment: 'builder',
                registerServiceWorker: false,
            });

            return c.json({ success: true, layout, html: canvasHtml });
        } catch (error) {
            console.error('[BuilderEngine] Error updating components:', error);
            return c.json({ error: 'Internal error' }, 500);
        }
    });

    /**
     * POST /builder/api/render - Render a component (for preview)
     */
    app.post('/api/render', async (c) => {
        try {
            const { type, props } = await c.req.json();

            if (!type || !globalRegistry.has(type)) {
                return c.json({ error: 'Unknown component type' }, 400);
            }

            const html = globalRegistry.renderComponent(type, props || {});
            return c.json({ html });
        } catch (error) {
            console.error('[BuilderEngine] Error rendering component:', error);
            return c.json({ error: 'Render error' }, 500);
        }
    });

    /**
     * POST /builder/api/reRender - Re-render the full canvas document (WYSIWYG).
     *
     * Accepts a full layout and returns the complete renderDocument output,
     * enabling the client to swap the iframe srcdoc for instant visual feedback.
     */
    app.post('/api/reRender', async (c) => {
        try {
            const { layout, pageData } = await c.req.json();

            if (!layout) {
                return c.json({ error: 'Layout is required' }, 400);
            }

            const system = buildSystemContext();
            const pageEntry: PageEntry = {
                title: pageData?.title ?? '',
                slug: pageData?.slug ?? '',
                description: pageData?.description,
                layout, // Include the layout for renderDocument
            };

            const ctx = {
                page: {
                    id: pageEntry.slug,
                    title: pageEntry.title,
                    url: `/${pageEntry.slug}`,
                    slug: pageEntry.slug,
                    description: pageEntry.description ?? '',
                    published: true,
                    createdAt: '',
                    updatedAt: '',
                    image: '',
                    type: 'page',
                    custom: {},
                },
                user: null,
                visitor: {} as any,
                url: {},
                system: {
                    date: system.date,
                    time: system.time,
                    datetime: system.datetime,
                    timestamp: system.timestamp,
                    year: system.year,
                    month: system.month,
                    day: system.day,
                    env: 'builder',
                },
                cookies: {},
                local: {},
                session: {},
                records: [],
                app: { environment: 'builder', manifestVersion: 1 },
            };

            const bodyHtml = await renderPage(layout, ctx);
            const html = renderDocument(pageEntry, bodyHtml, {
                environment: 'builder',
                registerServiceWorker: false,
            });

            return c.json({ html });
        } catch (error) {
            console.error('[BuilderEngine] Error re-rendering canvas:', error);
            return c.json({ error: 'Re-render error' }, 500);
        }
    });

    /**
     * GET /builder/api/registry - Get component registry
     */
    app.get('/api/registry', (c) => {
        try {
            const registry = opts.getRegistry ? opts.getRegistry() : globalRegistry.exportForAgent();
            return c.json(registry);
        } catch (error) {
            console.error('[BuilderEngine] Error getting registry:', error);
            return c.json({ error: 'Registry error' }, 500);
        }
    });

    /**
     * POST /builder/api/validate - Validate component props
     */
    app.post('/api/validate', async (c) => {
        try {
            const { type, props } = await c.req.json();

            if (!type) {
                return c.json({ error: 'Component type required' }, 400);
            }

            const result = globalRegistry.validateProps(type, props || {});
            return c.json(result);
        } catch (error) {
            console.error('[BuilderEngine] Error validating props:', error);
            return c.json({ error: 'Validation error' }, 500);
        }
    });

    return app;
}

/**
 * Update component props in layout.
 */
function updateComponentProps(layout: PageLayoutData, componentId: string, props: Record<string, unknown>): PageLayoutData {
    function updateInTree(nodes: PageComponent[]): PageComponent[] {
        return nodes.map((node: PageComponent) => {
            if (node.id === componentId) {
                return { ...node, props: { ...node.props, ...props } };
            }
            if (node.children) {
                return { ...node, children: updateInTree(node.children) };
            }
            return node;
        });
    }

    return {
        ...layout,
        content: updateInTree(layout.content),
    };
}

/**
 * Update a component's stylesData.values (Phase 4 unified styling surface).
 *
 * Unlike props, style values are stored on `component.stylesData.values` and are
 * applied as inline CSS by `stylesDataToCSS` during renderPage — on BOTH the
 * canvas and the published page. One render path → styling is identical by
 * construction (no separate "builder styling" to drift from "published styling").
 */
function updateComponentStyles(layout: PageLayoutData, componentId: string, values: Record<string, unknown>): PageLayoutData {
    function updateInTree(nodes: PageComponent[]): PageComponent[] {
        return nodes.map((node: PageComponent) => {
            if (node.id === componentId) {
                const existing = (node.stylesData ?? {}) as Record<string, unknown>;
                const prevValues = (existing.values ?? {}) as Record<string, unknown>;
                return {
                    ...node,
                    stylesData: { ...existing, values: { ...prevValues, ...values } },
                } as PageComponent;
            }
            if (node.children) {
                return { ...node, children: updateInTree(node.children) };
            }
            return node;
        });
    }

    return {
        ...layout,
        content: updateInTree(layout.content),
    };
}

/**
 * Add component to layout.
 */
function addComponent(layout: PageLayoutData, component: any, parentId?: string, index?: number): PageLayoutData {
    const newComponent: PageComponent = component.id ? component : { ...component, id: `comp-${Date.now()}`, type: 'Unknown' };

    if (parentId) {
        // Add as child of parent
        function addToParent(nodes: PageComponent[]): PageComponent[] {
            return nodes.map((node: PageComponent) => {
                if (node.id === parentId) {
                    const children = node.children || [];
                    if (typeof index === 'number' && index >= 0 && index <= children.length) {
                        children.splice(index, 0, newComponent);
                    } else {
                        children.push(newComponent);
                    }
                    return { ...node, children };
                }
                if (node.children) {
                    return { ...node, children: addToParent(node.children) };
                }
                return node;
            });
        }
        return {
            ...layout,
            content: addToParent(layout.content),
        };
    } else {
        // Add to root
        const content = [...layout.content];
        if (typeof index === 'number' && index >= 0 && index <= content.length) {
            content.splice(index, 0, newComponent);
        } else {
            content.push(newComponent);
        }
        return { ...layout, content };
    }
}

/**
 * Remove component from layout.
 */
function removeComponent(layout: PageLayoutData, componentId: string): PageLayoutData {
    function removeFromTree(nodes: PageComponent[]): PageComponent[] {
        return nodes
            .filter((node: PageComponent) => node.id !== componentId)
            .map((node: PageComponent) => ({
                ...node,
                children: node.children ? removeFromTree(node.children) : undefined,
            }));
    }

    return {
        ...layout,
        content: removeFromTree(layout.content),
    };
}

/**
 * Reorder component in layout.
 */
function reorderComponent(layout: PageLayoutData, componentId: string, newIndex: number): PageLayoutData {
    // Find and remove the component
    let found: PageComponent | null = null;

    function findAndRemove(nodes: PageComponent[]): PageComponent[] {
        const idx = nodes.findIndex((n: PageComponent) => n.id === componentId);
        if (idx !== -1) {
            const removed = nodes.splice(idx, 1);
            found = removed[0] || null;
            return nodes;
        }
        return nodes.map((node: PageComponent) => ({
            ...node,
            children: node.children ? findAndRemove(node.children) : undefined,
        }));
    }

    const content = findAndRemove(layout.content);

    // Insert at new index
    if (found) {
        if (newIndex >= 0 && newIndex <= content.length) {
            content.splice(newIndex, 0, found);
        } else {
            content.push(found);
        }
    }

    return { ...layout, content };
}
