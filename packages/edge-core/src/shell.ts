/**
 * Chimera document shell — the published-page HTML document.
 *
 * Deliberately ships NO React, NO hydration bundle, NO SDK scripts (contrast:
 * the product's htmlDocument.ts). Page CSS comes from the publish-time
 * `cssBundle` (styling seam — Phase 1 input 16), falling back to base styles.
 * The ~10 KB behaviors runtime will be added here when M1.1 formalizes it.
 */
import { FALLBACK_CSS } from './ssr/baseStyles.js';
import type { PageEntry } from './manifest.js';
import { escapeHtml } from './ssr/htmlDocument.js';

export interface ShellOptions {
    environment: string;
    /** Emit the /sw.js registration script (edge path only — the handover). */
    registerServiceWorker: boolean;
}

export function renderDocument(page: PageEntry, bodyHtml: string, opts: ShellOptions): string {
    const swRegistration = opts.registerServiceWorker
        ? `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}</script>`
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
<style>${page.cssBundle || FALLBACK_CSS}</style>
</head>
<body>
<div id="root">${bodyHtml}</div>
${swRegistration}
</body>
</html>`;
}
