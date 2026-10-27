/**
 * Netlify resource strategy.
 *
 * Ports the product reference (app/services/provider_discovery.py →
 * _discover_netlify, and app/services/engine_lister.py → _list_netlify_engines)
 * to the framework's guarded-fetch seam. Field names are copied exactly so the
 * SPA's import-dedupe (rest_url / endpoint / db_url / hostname / ...) keeps
 * working.
 *
 *   - discover:     GET /api/v1/sites → netlify_site
 *   - listEngines:  GET /api/v1/sites → {name, url, deployed_at, created_at}
 *
 * Auth is `Bearer {api_token}` on every call. The product reference does not
 * paginate Netlify (a single GET returns the user's site list), so this stays
 * faithful: one guarded fetch per method. Both methods hit the same endpoint
 * and tolerate a non-200 / non-array body without throwing.
 *
 * DIVERGENCE from product: `discover` emits `type: 'netlify_site'`. The product
 * omits `type`, but the SPA storage filter requires it, so this is a principled
 * divergence (the only field-name/shape deviation here).
 *
 * All outbound HTTP goes through guardedExternalFetch (https-only, no
 * redirects, private-IP blocked, 10s guard). Methods never throw — they return
 * a product-faithful {success:false, detail} on any failure.
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

const SITES_URL = 'https://api.netlify.com/api/v1/sites';

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

export function createNetlifyResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'netlify',

        // -------------------------------------------------------------------
        // discover — sites → netlify_site
        // -------------------------------------------------------------------
        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers = authHeaders(token);

            try {
                const resp = await guardedExternalFetch(externalFetch, SITES_URL, { headers });
                // Product calls resp.json() unconditionally; mirror that but
                // defend against a non-array / unparseable body.
                let sites: unknown = [];
                try {
                    sites = await resp.json();
                } catch {
                    sites = [];
                }
                const list = Array.isArray(sites) ? sites : [];

                const resources: DiscoveredResource[] = [];
                for (const raw of list) {
                    const s = raw as { id?: unknown; name?: unknown; ssl_url?: unknown; url?: unknown };
                    resources.push({
                        id: String(s.id ?? ''),
                        name: String(s.name ?? ''),
                        // Product uses ssl_url || url || "" — preserved verbatim.
                        url: String(s.ssl_url ?? s.url ?? ''),
                        type: 'netlify_site',
                    });
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Netlify discovery failed: ${(error as Error).message}`,
                };
            }
        },

        // -------------------------------------------------------------------
        // listEngines — sites → {name, url, deployed_at, created_at}
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

            try {
                const resp = await guardedExternalFetch(externalFetch, SITES_URL, { headers });
                // Product's _list_netlify_engines returns [] on any non-200.
                if (!resp.ok) {
                    return {
                        success: false,
                        engines: [],
                        detail: `Netlify API error: ${resp.status}`,
                    };
                }
                let sites: unknown = [];
                try {
                    sites = await resp.json();
                } catch {
                    sites = [];
                }
                const list = Array.isArray(sites) ? sites : [];

                const engines: EngineInfo[] = [];
                for (const raw of list) {
                    // Product filters `if isinstance(s, dict)` — mirror by checking object type.
                    if (raw === null || typeof raw !== 'object') continue;
                    const s = raw as {
                        name?: unknown;
                        ssl_url?: unknown;
                        url?: unknown;
                        published_deploy?: unknown;
                        created_at?: unknown;
                    };
                    const publishedDeploy = s.published_deploy;
                    const deployedAt =
                        publishedDeploy !== null && typeof publishedDeploy === 'object'
                            ? String(
                                  (publishedDeploy as { published_at?: unknown }).published_at ?? '',
                              )
                            : '';
                    engines.push({
                        name: String(s.name ?? ''),
                        // Product: s.get("ssl_url", s.get("url", "")).
                        url: String(s.ssl_url ?? s.url ?? ''),
                        provider: 'netlify',
                        deployed_at: deployedAt,
                        created_at: String(s.created_at ?? ''),
                    });
                }

                return { success: true, engines };
            } catch (error) {
                return {
                    success: false,
                    engines: [],
                    detail: `Netlify engine listing failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
