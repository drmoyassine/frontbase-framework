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
}

export function renderDocument(page: PageEntry, bodyHtml: string, opts: ShellOptions): string {
    const swRegistration = opts.registerServiceWorker
        ? `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}</script>`
        : '';
    const behaviors = opts.behaviorsBundle
        ? `<script>${opts.behaviorsBundle}</script>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Frontbase">
<meta name="chimera-rendered-by" content="${escapeHtml(opts.environment)}">
<title>${escapeHtml(page.title)}</title>
${page.description ? `<meta name="description" content="${escapeHtml(page.description)}">` : ''}
<link rel="modulepreload" href="/static/react/hydrate.js?v=${HYDRATE_VERSION}">
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
