/**
 * Chimera document shell — the published-page / builder-canvas HTML document.
 *
 * Product parity: loads the vendored client hydration runtime at
 * /static/react/hydrate.js (served by the host — vendored the same way as the
 * console SPA). Without it, SSR markers ([data-react-component] + skeletons)
 * are emitted but nothing mounts, so DataTables stay skeletons. Page CSS comes
 * from the publish-time `cssBundle` (styling seam — Phase 1 input 16), falling
 * back to base styles.
 */
import { FALLBACK_CSS } from './ssr/baseStyles.js';
import type { PageEntry } from './manifest.js';
import { escapeHtml, HYDRATE_VERSION } from './ssr/htmlDocument.js';

export interface ShellOptions {
    environment: string;
    /** Emit the /sw.js registration script (edge path only — the handover). */
    registerServiceWorker: boolean;
    /** Minified behaviors runtime (M1.4 compiler emits it). Inlined before </body>. */
    behaviorsBundle?: string;
    /**
     * Favicon for the browser tab (host-resolved — EngineConfig.resolveFaviconUrl).
     * Emitted ONLY when set: the golden-corpus defaults resolve '' and their
     * byte-parity snapshots must not grow a link. Hosts that want the framework
     * icon fallback pass it here (faviconUrl || '/static/icon.png').
     */
    faviconUrl?: string;
    language?: string;
    canonicalUrl?: string;
    robots?: string;
    openGraph?: { title: string; description?: string; url: string; type: 'website' | 'article'; siteName: string; image?: string; imageAlt?: string };
}

export function renderDocument(page: PageEntry, bodyHtml: string, opts: ShellOptions): string {
    const metadata = [
        ...(opts.robots ? [`<meta name="robots" content="${escapeHtml(opts.robots)}">`] : []),
        ...Object.entries(opts.openGraph ? { title: opts.openGraph.title, description: opts.openGraph.description, url: opts.openGraph.url, type: opts.openGraph.type, site_name: opts.openGraph.siteName, image: opts.openGraph.image, 'image:alt': opts.openGraph.image ? opts.openGraph.imageAlt : undefined } : {})
            .filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `<meta property="og:${key}" content="${escapeHtml(String(value))}">`),
    ].join('\n');
    const swRegistration = opts.registerServiceWorker
        ? `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}</script>`
        : '';
    const behaviors = opts.behaviorsBundle
        ? `<script>${opts.behaviorsBundle}</script>`
        : '';
    const faviconLinks = opts.faviconUrl
        ? `<link rel="icon" href="${escapeHtml(opts.faviconUrl)}">\n<link rel="apple-touch-icon" href="${escapeHtml(opts.faviconUrl)}">\n`
        : '';
    return `<!DOCTYPE html>
<html lang="${escapeHtml(opts.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Frontbase">
<meta name="chimera-rendered-by" content="${escapeHtml(opts.environment)}">
<title>${escapeHtml(page.title)}</title>
${opts.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}">\n` : ''}${page.description ? `<meta name="description" content="${escapeHtml(page.description)}">` : ''}
${metadata ? metadata + '\n' : ''}${faviconLinks}<link rel="modulepreload" href="/static/react/hydrate.js?v=${HYDRATE_VERSION}">
<style>${page.cssBundle || FALLBACK_CSS}</style>
</head>
<body>
<div id="root">${bodyHtml}</div>
${behaviors}
<script type="module" src="/static/react/hydrate.js?v=${HYDRATE_VERSION}"></script>
${swRegistration}
</body>
</html>`;
}
