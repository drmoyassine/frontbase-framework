/**
 * Vercel resource strategy.
 *
 * Ports the product reference (app/services/provider_discovery.py →
 * _discover_vercel, and app/services/engine_lister.py → _list_vercel_engines
 * which calls vercel_deploy_api.list_projects) to the framework's guarded-fetch
 * seam. Field names are copied exactly so the SPA's import-dedupe
 * (rest_url / endpoint / db_url / hostname / cache_url ...) keeps working.
 *
 *   - discover:     vercel_project / edge_config / blob_store
 *   - listEngines:  projects → https://{name}.vercel.app
 *
 * Auth is `Bearer {api_token}` on every call. The product's discoverer does
 * NOT scope by team_id (lists every project the token can see); the engine
 * lister DOES forward an optional `team_id` cred as `?teamId=`. Both behaviors
 * are preserved here.
 *
 * All outbound HTTP goes through guardedExternalFetch (https-only, no
 * redirects, private-IP blocked, 10s guard). Methods never throw — they
 * return a product-faithful {success:false, detail} on any failure.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    ListEnginesResult,
    DiscoveredResource,
    EngineInfo,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

const VERCEL_API = 'https://api.vercel.com';
const PROJECTS_V9_URL = `${VERCEL_API}/v9/projects`;
const EDGE_CONFIG_URL = `${VERCEL_API}/v1/edge-config`;
const BLOB_URL = `${VERCEL_API}/v1/blob?limit=50`;
const PROJECTS_V10_URL = `${VERCEL_API}/v10/projects`;

/** Vercel project/engine timestamps are epoch milliseconds — normalise to ISO
 *  like the product's `_epoch_to_iso`. Passes strings through unchanged. */
function epochMsToIso(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        try {
            return new Date(value).toISOString();
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

/** Append (or merge) a query param onto a URL string that may already have one. */
function withParam(baseUrl: string, key: string, value: string): string {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function createVercelResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'vercel',

        // -------------------------------------------------------------------
        // discover — projects + edge-config (+ connection strings) + blob
        // -------------------------------------------------------------------
        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers = authHeaders(token);
            const resources: DiscoveredResource[] = [];

            try {
                // 1. Projects → vercel_project
                try {
                    const projResp = await guardedExternalFetch(externalFetch, PROJECTS_V9_URL, { headers });
                    if (projResp.ok) {
                        const body = (await projResp.json()) as { projects?: unknown };
                        const projects = Array.isArray(body.projects) ? body.projects : [];
                        for (const raw of projects) {
                            const p = raw as { id?: unknown; name?: unknown; framework?: unknown };
                            resources.push({
                                id: String(p.id ?? ''),
                                name: String(p.name ?? ''),
                                type: 'vercel_project',
                                framework: String(p.framework ?? ''),
                            });
                        }
                    }
                } catch {
                    // projects discovery is best-effort relative to the whole call
                }

                // 2. Edge Configs → edge_config (cache-like). Fetch a connection
                //    string per config from /tokens (first connectionString) so the
                //    SPA can wire runtime access; the product stores it under
                //    `cache_url` to reuse the cache-storage dedupe lane.
                try {
                    const ecResp = await guardedExternalFetch(externalFetch, EDGE_CONFIG_URL, { headers });
                    if (ecResp.ok) {
                        const ecBody = await ecResp.json();
                        const configs = Array.isArray(ecBody) ? ecBody : [];
                        for (const raw of configs) {
                            const ec = raw as { id?: unknown; slug?: unknown; itemCount?: unknown };
                            const ecId = String(ec.id ?? '');
                            const entry: DiscoveredResource = {
                                id: ecId,
                                name: String(ec.slug ?? ecId),
                                type: 'edge_config',
                                item_count: ec.itemCount ?? undefined,
                            };
                            if (ecId) {
                                try {
                                    const tokResp = await guardedExternalFetch(
                                        externalFetch,
                                        `${EDGE_CONFIG_URL}/${encodeURIComponent(ecId)}/tokens`,
                                        { headers },
                                    );
                                    if (tokResp.ok) {
                                        const tokens = await tokResp.json();
                                        if (Array.isArray(tokens) && tokens.length > 0) {
                                            const connStr =
                                                (tokens[0] as { connectionString?: unknown }).connectionString;
                                            if (connStr) entry.cache_url = String(connStr);
                                        }
                                    }
                                } catch {
                                    // connection-string fetch is best-effort
                                }
                            }
                            resources.push(entry);
                        }
                    }
                } catch {
                    // edge-config discovery is best-effort
                }

                // 3. Blob stores → blob_store (best-effort)
                try {
                    const blobResp = await guardedExternalFetch(externalFetch, BLOB_URL, { headers });
                    if (blobResp.ok) {
                        const body = (await blobResp.json()) as { stores?: unknown };
                        const stores = Array.isArray(body.stores) ? body.stores : [];
                        for (const raw of stores) {
                            const store = raw as { id?: unknown; name?: unknown };
                            resources.push({
                                id: String(store.id ?? ''),
                                name: String(store.name ?? ''),
                                type: 'blob_store',
                            });
                        }
                    }
                } catch {
                    // blob discovery is best-effort
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Vercel discovery failed: ${(error as Error).message}`,
                };
            }
        },

        // -------------------------------------------------------------------
        // listEngines — projects (v10) → https://{name}.vercel.app
        // -------------------------------------------------------------------
        async listEngines(credentials: Record<string, unknown>): Promise<ListEnginesResult> {
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return {
                    success: false,
                    engines: [],
                    detail: 'Credentials not available',
                };
            }
            const headers = authHeaders(token);
            const teamId = String(credentials.team_id ?? '');

            // Matches vercel_deploy_api.list_projects: /v10/projects?limit=50[&teamId=]
            let url = `${PROJECTS_V10_URL}?limit=50`;
            if (teamId) url = withParam(url, 'teamId', teamId);

            try {
                const resp = await guardedExternalFetch(externalFetch, url, { headers });
                if (!resp.ok) {
                    return {
                        success: false,
                        engines: [],
                        detail: `Vercel API error: ${resp.status}`,
                    };
                }
                const body = (await resp.json()) as { projects?: unknown };
                const projects = Array.isArray(body.projects) ? body.projects : [];

                const engines: EngineInfo[] = [];
                for (const raw of projects) {
                    const p = raw as {
                        name?: unknown;
                        updatedAt?: unknown;
                        createdAt?: unknown;
                    };
                    const name = String(p.name ?? '');
                    engines.push({
                        name,
                        url: `https://${name}.vercel.app`,
                        provider: 'vercel',
                        deployed_at: epochMsToIso(p.updatedAt),
                        created_at: epochMsToIso(p.createdAt),
                    });
                }

                return { success: true, engines };
            } catch (error) {
                return {
                    success: false,
                    engines: [],
                    detail: `Vercel engine listing failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
