/**
 * Dev-only file-system routing (CF-3, M3.1.5). In dev, pages come from the
 * filesystem instead of a baked manifest: a `pages/` directory where each
 * `<slug>.json` is a page layout (builder tree) and `<slug>.frontmatter.json`
 * optionally carries { title, description, queryId, cssBundle }.
 *
 * DEV-ONLY: imports `node:fs`/`node:path` — never reaches a browser/worker bundle
 * (the compiler's dev server uses this; production builds use the baked manifest).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { ManifestPageInput } from '../manifest/build.js';

export interface DevPagesOptions {
    /** Directory containing page layouts. Default 'pages'. */
    pagesDir?: string;
}

/**
 * Build page inputs from a filesystem `pages/` directory. Each `<slug>.json` is a
 * layout tree; an optional `<slug>.meta.json` carries title/description/queryId.
 * Returns a map of route-path → ManifestPageInput (route = `/<slug>`, home = `/`).
 */
export function devPagesFromFs(opts: DevPagesOptions = {}): Record<string, ManifestPageInput> {
    const dir = opts.pagesDir ?? 'pages';
    if (!existsSync(dir)) return {};
    const out: Record<string, ManifestPageInput> = {};
    for (const entry of readdirSync(dir).sort()) {
        if (!entry.endsWith('.json') || entry.endsWith('.meta.json')) continue;
        const full = join(dir, entry);
        if (!statSync(full).isFile()) continue;
        const slug = basename(entry, '.json');
        const layout = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
        const metaPath = join(dir, slug + '.meta.json');
        const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown> : {};
        const route = slug === 'home' || slug === 'index' ? '/' : '/' + slug;
        out[route] = {
            title: (meta.title as string) ?? slug,
            slug,
            ...(meta.description ? { description: meta.description as string } : {}),
            ...(meta.queryId ? { queryId: meta.queryId as string } : {}),
            ...(meta.cssBundle ? { cssBundle: meta.cssBundle as string } : {}),
            layout,
        };
    }
    return out;
}
