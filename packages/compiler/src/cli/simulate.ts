/**
 * simulate — boots @frontbase/edge-core locally in any provider mode and renders
 * the same pages identically across all three (M1.4 acceptance).
 *
 *   direct : directProvider(manifest)            — the cloud-edge path
 *   proxy  : serves /api/data AND a proxy engine  — the SW's data path, in-process
 *   draft  : in-memory draft provider             — builder-canvas path (stub; real
 *            SQLite-WASM draft is Phase 2 builder)
 *
 * For M1.4 we expose the programmatic render API (no long-running server by
 * default) so tests can assert tri-provider byte-parity deterministically. A
 * `serve()` wrapper starts an HTTP server via @hono/node-server for manual use.
 */
import { createEngine, directProvider, proxyProvider, type DataProvider } from '@frontbase/edge-core';
import type { SiteManifest } from '@frontbase/edge-core';

export type ProviderMode = 'direct' | 'proxy' | 'draft';

export interface SimulateResult {
    mode: ProviderMode;
    status: number;
    body: string;
    headers: Record<string, string>;
}

/** A draft provider: returns rows baked into the manifest (Phase 2 swaps in SQLite-WASM). */
function draftProvider(manifest: SiteManifest): DataProvider {
    return {
        kind: 'draft',
        async query(queryId) {
            const q = manifest.queries[queryId];
            return q?.rows ?? [];
        },
    };
}

/**
 * Render a path in a given provider mode. proxy mode stands up a tiny in-process
 * edge that serves /api/data, then renders via proxyProvider pointed at it.
 */
export async function simulateRender(
    manifest: SiteManifest,
    path: string,
    mode: ProviderMode,
): Promise<SimulateResult> {
    if (mode === 'direct') {
        const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
        const res = await engine.fetch(new Request('http://simulate.local' + path));
        return toResult('direct', res);
    }
    if (mode === 'draft') {
        const engine = createEngine({ manifest, data: draftProvider(manifest), environment: 'edge' });
        const res = await engine.fetch(new Request('http://simulate.local' + path));
        return toResult('draft', res);
    }
    // proxy: an edge engine serves /api/data; a RENDERING engine (same 'edge'
    // environment label as the other modes, so the only variable is the data
    // provider) fetches its data via proxyProvider → the SW's data path.
    const edge = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
    const proxyBase = 'http://proxy.local/api/data';
    const renderer = createEngine({ manifest, data: proxyProvider(proxyBase), environment: 'edge' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.startsWith(proxyBase)) return edge.fetch(new Request(u, init));
        return origFetch(url as RequestInfo, init as RequestInit);
    }) as typeof fetch;
    try {
        const res = await renderer.fetch(new Request('http://simulate.local' + path));
        return toResult('proxy', res);
    } finally {
        globalThis.fetch = origFetch;
    }
}

async function toResult(mode: ProviderMode, res: Response): Promise<SimulateResult> {
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { mode, status: res.status, body: await res.text(), headers };
}

/**
 * Start a long-running HTTP server for manual use (the `frontbase simulate`
 * command). @hono/node-server is imported lazily so it is NOT a hard dependency
 * of programmatic simulate usage / tests.
 */
export async function serve(manifest: SiteManifest, mode: ProviderMode, port: number): Promise<{ close: () => void }> {
    const mod = await import('@hono/node-server');
    const honoServe = (mod.serve ?? mod.default) as typeof import('@hono/node-server').serve;
    const data: DataProvider = mode === 'direct' ? directProvider(manifest)
        : mode === 'draft' ? draftProvider(manifest) : proxyProvider('/api/data');
    const engine = createEngine({ manifest, data, environment: 'edge' });
    const server = await honoServe({ fetch: engine.fetch, port });
    return { close: () => server.close() };
}
