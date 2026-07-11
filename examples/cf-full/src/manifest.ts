/**
 * Demo site manifest for the FULL-CMS example. Self-contained (no cross-repo /
 * golden imports) so the artifact bundles standalone. The published pages here
 * are the PUBLIC face; the login-gated admin lives under /api/console/* (mounted
 * by createConsole in worker.ts).
 */
import type { SiteManifest } from '@frontbase/edge-core';

export const manifest: SiteManifest = {
    version: 'cf-full-1',
    queries: {},
    pages: {
        '/': {
            title: 'Frontbase — Full CMS on the Edge',
            slug: 'home',
            layout: {
                root: {},
                content: [
                    { id: 'h', type: 'Heading', props: { content: 'A whole CMS in one Cloudflare Worker', level: 'h1' } },
                    { id: 't', type: 'Text', props: { content: 'This page is server-rendered by @frontbase/edge-core on {{ app.environment }}. The admin console — login, tenants, pages, publish — is mounted at /api/console and is login-gated (default-deny).' } },
                    { id: 'l1', type: 'Link', props: { text: 'Console health (public) →', href: '/api/console/health', color: '#4338ca', underline: true } },
                    { id: 'l2', type: 'Link', props: { text: 'About this build →', href: '/about', color: '#4338ca', underline: true } },
                ],
            },
        },
        '/about': {
            title: 'About',
            slug: 'about',
            layout: {
                root: {},
                content: [
                    { id: 'ah', type: 'Heading', props: { content: 'One artifact, three environments', level: 'h2' } },
                    { id: 'at', type: 'Text', props: { content: 'The same engine renders on the edge, in the service worker, and in the builder. Storage is a Cloudflare D1 binding (env.DB) resolved per request.' } },
                    { id: 'ab', type: 'Link', props: { text: '← Home', href: '/', color: '#4338ca', underline: true } },
                ],
            },
        },
    },
};
