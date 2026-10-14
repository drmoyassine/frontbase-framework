import type { PageLayoutData, PageComponent } from '../ssr/types.js';

/** Host-portable navigation. SEO/media and saved source content remain untouched. */
export function projectRelativeSiteLinks<T extends PageLayoutData>(layout: T, siteOrigin: string): T {
    // Incomplete authoring drafts may not yet have an origin; publication admission requires one.
    if(!siteOrigin)return layout;
    const origin = new URL(siteOrigin).origin;
    const relative = (href: unknown): unknown => {
        if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return href;
        try {
            const url = new URL(href);
            if (url.origin !== origin || url.username || url.password) return href;
            const path = decodeURIComponent(url.pathname);
            // Never turn an absolute URL into a network-path or ambiguous escape.
            if (path.startsWith('//') || /[\\\x00-\x20]/.test(path)) return href;
            return url.pathname + url.search + url.hash;
        } catch { return href; }
    };
    const walk = (node: PageComponent): PageComponent => ({
        ...node,
        ...(node.props ? { props: { ...node.props, ...(Object.hasOwn(node.props, 'href') ? { href: relative(node.props.href) } : {}) } } : {}),
        ...(node.children ? { children: node.children.map(walk) } : {}),
    });
    return { ...layout, content: layout.content.map(walk) };
}
