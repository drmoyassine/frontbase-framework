/**
 * Deno Deploy resource strategy.
 *
 * Ports the product reference (app/services/provider_discovery.py →
 * _discover_deno, and app/services/engine_lister.py → _list_deno_engines)
 * to the framework's guarded-fetch seam. Field names are copied exactly so
 * the SPA's import-dedupe (rest_url / endpoint / db_url / hostname ...) keeps
 * working.
 *
 *   - discover:     deno_project { name:slug, has_kv:true } — every Deno
 *                   Deploy app has KV, so `has_kv` is always true.
 *   - listEngines:  /v2/apps with Link-header cursor pagination (limit=30,
 *                   max 5 pages); engine url suffix is `.{org_slug}.deno.net`
 *                   when an `org_slug` cred is present, else `.deno.dev`.
 *
 * Auth is `Bearer {token}` where token is read from `access_token` (product
 * field) with a defensive fallback to `personal_token`. All outbound HTTP
 * goes through guardedExternalFetch (https-only, no redirects, private-IP
 * blocked, 10s guard). Methods never throw — they return a product-faithful
 * {success:false, detail} on any failure.
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

const DENO_APPS_URL = 'https://api.deno.com/v2/apps';
const DISCOVER_LIMIT = 50;
const ENGINES_PAGE_LIMIT = 30;
const MAX_ENGINE_PAGES = 5;

function resolveToken(credentials: Record<string, unknown>): string {
    // Product reads `access_token` only; `personal_token` is a defensive
    // fallback for accounts provisioned with a personal access token.
    return String(credentials.access_token ?? credentials.personal_token ?? '');
}

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

/** Append (or merge) a query param onto a URL string that may already have one. */
function withParam(baseUrl: string, key: string, value: string): string {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Parse the `cursor=` value out of a Link header containing `rel="next"`.
 * Mirrors the product's `re.search(r'cursor=([^&>]+)', link)` + `rel="next"`
 * guard. Returns null when there is no next page (no rel="next", or no
 * decodable cursor), which the caller treats as "stop paginating".
 */
function extractNextCursor(linkHeader: string): string | null {
    if (!linkHeader || !linkHeader.includes('rel="next"')) return null;
    const match = linkHeader.match(/cursor=([^&>]+)/);
    return match && match[1] ? match[1] : null;
}

export function createDenoResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'deno',

        // -------------------------------------------------------------------
        // discover — apps → deno_project { name:slug, has_kv:true }
        // -------------------------------------------------------------------
        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const token = resolveToken(credentials);
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers = authHeaders(token);
            const url = withParam(DENO_APPS_URL, 'limit', String(DISCOVER_LIMIT));

            try {
                const resp = await guardedExternalFetch(externalFetch, url, { headers });
                if (!resp.ok) {
                    // Product: {"success": False, "detail": f"Deno API error: {resp.status_code}"}
                    return { success: false, detail: `Deno API error: ${resp.status}` };
                }
                const body = await resp.json();
                const apps = Array.isArray(body) ? body : [];

                const resources: DiscoveredResource[] = [];
                for (const raw of apps) {
                    const app = raw as { id?: unknown; slug?: unknown };
                    resources.push({
                        id: String(app.id ?? ''),
                        name: String(app.slug ?? ''),
                        type: 'deno_project',
                        has_kv: true, // every Deno Deploy app gets KV
                    });
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Deno discovery failed: ${(error as Error).message}`,
                };
            }
        },

        // -------------------------------------------------------------------
        // listEngines — /v2/apps with Link-header cursor pagination
        // -------------------------------------------------------------------
        async listEngines(credentials: Record<string, unknown>): Promise<ListEnginesResult> {
            const token = resolveToken(credentials);
            if (!token) {
                return {
                    success: false,
                    engines: [],
                    detail: 'Credentials not available',
                };
            }
            const headers = authHeaders(token);

            // URL suffix mirrors the product: org-scoped subdomain when an
            // org_slug is stored, else the shared *.deno.dev host.
            const orgSlug = String(credentials.org_slug ?? '');
            const urlSuffix = orgSlug ? `.${orgSlug}.deno.net` : '.deno.dev';

            const engines: EngineInfo[] = [];
            let cursor: string | null = null;

            try {
                for (let page = 0; page < MAX_ENGINE_PAGES; page++) {
                    let pageUrl = withParam(DENO_APPS_URL, 'limit', String(ENGINES_PAGE_LIMIT));
                    if (cursor) pageUrl = withParam(pageUrl, 'cursor', cursor);

                    const resp = await guardedExternalFetch(externalFetch, pageUrl, { headers });
                    if (!resp.ok) {
                        // First-page failure → surface the API error (no engines
                        // collected yet). Mid-pagination failure → stop and
                        // return what we have, matching the product's `break`.
                        if (page === 0) {
                            return {
                                success: false,
                                engines: [],
                                detail: `Deno API error: ${resp.status}`,
                            };
                        }
                        break;
                    }

                    const body = await resp.json();
                    const apps = Array.isArray(body) ? body : [];
                    if (apps.length === 0) break; // no more apps

                    for (const raw of apps) {
                        const app = raw as {
                            slug?: unknown;
                            updated_at?: unknown;
                            created_at?: unknown;
                        };
                        const slug = String(app.slug ?? '');
                        engines.push({
                            name: slug,
                            url: `https://${slug}${urlSuffix}`,
                            provider: 'deno',
                            deployed_at: String(app.updated_at ?? ''),
                            created_at: String(app.created_at ?? ''),
                        });
                    }

                    // Cursor lives in the Link header — stop when there's no
                    // rel="next" or no decodable cursor.
                    const linkHeader = resp.headers.get('link') ?? '';
                    cursor = extractNextCursor(linkHeader);
                    if (!cursor) break;
                }

                return { success: true, engines };
            } catch (error) {
                return {
                    success: false,
                    engines: [],
                    detail: `Deno engine listing failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
