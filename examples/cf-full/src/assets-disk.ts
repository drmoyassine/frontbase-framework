/**
 * Disk-backed ASSETS shim — the Static Assets binding over a directory, shared
 * by the Node/Docker entry (src/node.ts) and the Deno Deploy entry (src/deno.ts).
 *
 * Every engine call site rewrites the URL path BEFORE fetch (worker.ts:
 * /static/react/* → /react/*, /static/icon.png → /icon.png, shell →
 * /frontbase-admin/index.html, hashed bundles raw), so the shim maps the
 * pathname 1:1 under the console-dist root — the same layout wrangler's
 * [assets] directory serves, satisfying the identical
 * { fetch(Request) → Promise<Response> } binding contract.
 *
 * assetResponse() treats 200/304 as a hit and rebuilds from response.body +
 * headers, so the ETag below is what makes the hydrate.js `no-cache,
 * must-revalidate` policy cheap (a conditional GET 304s instead of
 * re-downloading the ~1 MB bundle every canvas load). Deno Deploy note: the
 * deployment's uploaded files are readable through node:fs (node compat), so
 * this shim works unmodified; Vercel Edge has NO fs and uses vercel.json
 * instead (src/vercel.ts).
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';

const MIME: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

/** Does this console-dist root hold a staged console? (Probe the shell.) */
export function isStagedConsole(consoleRoot: string): boolean {
    return existsSync(join(consoleRoot, 'frontbase-admin', 'index.html'));
}

export interface DiskAssets {
    fetch(request: Request): Promise<Response>;
    /** The root this shim serves from (boot logs / diagnostics). */
    root: string;
}

export function createDiskAssets(consoleRoot: string): DiskAssets {
    // Normalize once: containment checks below compare against the same form
    // join/normalize produces, on both separators (win32 + posix).
    const ROOT = normalize(consoleRoot);
    return {
        root: ROOT,
        async fetch(request: Request): Promise<Response> {
            let pathname: string;
            try { pathname = decodeURIComponent(new URL(request.url).pathname); }
            catch { return new Response('bad_path', { status: 400 }); }
            const rel = pathname.replace(/^\/+/, '');
            // Dotfile deny (console-dist/.assetsignore is wrangler-only config, not
            // an asset) + empty path reject.
            if (!rel || rel.split('/').some((seg) => seg.startsWith('.'))) {
                return new Response('not_found', { status: 404 });
            }
            const file = normalize(join(ROOT, rel));
            if (!file.startsWith(ROOT + sep)) return new Response('not_found', { status: 404 });
            let st: ReturnType<typeof statSync>;
            try { st = statSync(file); } catch { return new Response('not_found', { status: 404 }); }
            // Directory-index resolution — half of the binding contract. The
            // real Static Assets binding serves `<dir>/index.html` for a
            // directory URL (html_handling auto-trailing-slash; worker.ts:735
            // relies on it for /admin/). The 1:1 mapping above stops at the
            // directory itself, so resolve the index here — the Node/Deno
            // entries and the in-process smokes must serve what production
            // serves, or smoke:cloud's fail-closed /admin checks stay red.
            if (!st.isFile()) {
                const indexFile = normalize(join(file, 'index.html'));
                if (!indexFile.startsWith(ROOT + sep)) return new Response('not_found', { status: 404 });
                try { st = statSync(indexFile); } catch { return new Response('not_found', { status: 404 }); }
                if (!st.isFile()) return new Response('not_found', { status: 404 });
                return serveFile(indexFile, request);
            }
            return serveFile(file, request);
        },
    };
}

/** Read the (already containment-checked, already a-file) path as an asset response. */
function serveFile(file: string, request: Request): Response {
    const bytes = readFileSync(file);
    const etag = '"' + createHash('sha1').update(bytes).digest('hex').slice(0, 24) + '"';
    if (request.headers.get('if-none-match') === etag) {
        return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(bytes, {
        status: 200,
        headers: {
            'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
            etag,
        },
    });
}
