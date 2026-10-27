/**
 * Demo site manifest for the CF-worker example. The homepage layout is the real
 * Frontbase homepage from the golden corpus (kept in-repo — no cross-repo import).
 */
import type { SiteManifest } from '@frontbase/edge-core';
import homee from '../../../golden-corpus/layouts/homee.json' with { type: 'json' };

export const manifest: SiteManifest = {
    version: 'cf-example-1',
    queries: {
        'products.list': {
            queryId: 'products.list',
            ttlSeconds: 60,
            rows: [
                { name: 'Edge Widget', price: 19, status: 'active' },
                { name: 'Chimera Engine', price: 42, status: 'active' },
                { name: 'Liquid Filter Pack', price: 7, status: 'draft' },
            ],
        },
    },
    pages: {
        '/': {
            title: 'Chimera Engine — Home',
            slug: 'home',
            layout: {
                root: {},
                content: [
                    { id: 'h', type: 'Heading', props: { content: 'Universal eSSR — powered by @frontbase/edge-core', level: 'h1' } },
                    { id: 't', type: 'Text', props: { content: 'Rendered by the SAME engine on {{ app.environment }}. Follow the links — after the service worker installs, navigation renders locally.' } },
                    { id: 'l1', type: 'Link', props: { text: 'View the real Frontbase homepage →', href: '/homee', color: '#4338ca', underline: true } },
                    { id: 'l2', type: 'Link', props: { text: 'Products (registered-query data) →', href: '/products', color: '#4338ca', underline: true } },
                ],
            },
        },
        '/homee': {
            title: (homee as { title: string }).title,
            slug: 'homee',
            layout: (homee as { layout: SiteManifest['pages'][string]['layout'] }).layout,
        },
        '/products': {
            title: 'Products',
            slug: 'products',
            queryId: 'products.list',
            layout: {
                root: {},
                content: [
                    { id: 'ph', type: 'Heading', props: { content: 'Products ({{ records | size }})', level: 'h2' } },
                    { id: 'pl', type: 'Text', props: { content: '{% for r in records %}{{ r.name }} — ${{ r.price }} ({{ r.status }}){% unless forloop.last %} · {% endunless %}{% endfor %}' } },
                    { id: 'pb', type: 'Link', props: { text: '← Home', href: '/', color: '#4338ca', underline: true } },
                ],
            },
        },
    },
};
