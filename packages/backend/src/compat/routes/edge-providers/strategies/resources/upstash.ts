/**
 * Upstash resource strategy.
 *
 * Ports the product reference (_discover_upstash + _create_upstash_redis in
 * provider_discovery.py) to the framework's guarded-fetch seam. Surfaces
 * four resource kinds — redis, qstash, vector, search — and provisions new
 * Redis databases. Field names (rest_url, rest_token, endpoint, signing_key,
 * next_signing_key, region, token) match the product EXACTLY because the SPA
 * dedupes imported resources on those keys.
 *
 * All outbound HTTP goes through guardedExternalFetch (https-only, no
 * redirects, private-IP blocked, 10s timeout per call). Credentials arrive
 * already decrypted + snake_case from the route handler.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    CreateResourceResult,
    DiscoveredResource,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

/** Unicode-safe base64 of `email:token` for the Basic auth header.
 *
 * `btoa` and `TextEncoder` are Web-standard globals available in every
 * runtime the framework targets (CF Workers, Deno, Node 18+). email:token
 * is ASCII in practice, but encoding via UTF-8 bytes keeps us safe if a
 * malformed credential slips through without ever throwing. */
function basicAuthHeader(email: string, token: string): string {
    const raw = `${email}:${token}`;
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return `Basic ${btoa(binary)}`;
}

/** Best-effort Upstash Management API GET.
 *
 * Mirrors the product `_upstash_get` helper: returns `[]` on any non-OK
 * response or JSON parse failure so callers can treat a missing/forbidden
 * resource kind as "nothing to import" rather than a hard failure. */
async function upstashGet(
    externalFetch: CompatFetch,
    auth: string,
    url: string,
): Promise<unknown> {
    const resp = await guardedExternalFetch(externalFetch, url, {
        headers: { Authorization: auth },
    });
    if (!resp.ok) return [];
    try {
        return await resp.json();
    } catch {
        return [];
    }
}

const REDIS_DATABASES_URL = 'https://api.upstash.com/v2/redis/databases';
const QSTASH_USER_URL = 'https://api.upstash.com/v2/qstash/user';
const QSTASH_KEYS_URL = 'https://qstash.upstash.io/v2/keys';
const VECTOR_INDEXES_URL = 'https://api.upstash.com/v2/vector/indexes';
const SEARCH_INDEXES_URL = 'https://api.upstash.com/v2/search/indexes';
const CREATE_REDIS_URL = 'https://api.upstash.com/v2/redis/database';

export function createUpstashResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'upstash',

        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const token = String(credentials.api_token ?? '');
            const email = String(credentials.email ?? '');
            if (!token || !email) {
                return { success: false, detail: 'Credentials not available' };
            }
            const auth = basicAuthHeader(email, token);
            const resources: DiscoveredResource[] = [];

            try {
                // 1. Redis databases (primary call — a network error here fails discovery)
                const redisDbs = await upstashGet(externalFetch, auth, REDIS_DATABASES_URL);
                if (Array.isArray(redisDbs)) {
                    for (const entry of redisDbs) {
                        const d = entry as Record<string, unknown>;
                        resources.push({
                            id: String(d.database_id ?? ''),
                            name: String(d.database_name ?? ''),
                            type: 'redis',
                            endpoint: String(d.endpoint ?? ''),
                            rest_url: String(d.rest_url ?? ''),
                            rest_token: String(d.rest_token ?? ''),
                            region: String(d.region ?? ''),
                        });
                    }
                }

                // 2. QStash — best-effort. Resolve the real QStash token from the
                //    Developer API, then fetch signing keys with Bearer auth.
                try {
                    const qstashUser = await upstashGet(externalFetch, auth, QSTASH_USER_URL);
                    const qstashToken =
                        qstashUser && typeof qstashUser === 'object' && !Array.isArray(qstashUser)
                            ? String((qstashUser as Record<string, unknown>).token ?? '')
                            : '';
                    if (qstashToken) {
                        let signingKey = '';
                        let nextSigningKey = '';
                        try {
                            const keysResp = await guardedExternalFetch(
                                externalFetch,
                                QSTASH_KEYS_URL,
                                { headers: { Authorization: `Bearer ${qstashToken}` } },
                            );
                            if (keysResp.ok) {
                                const keysData = (await keysResp.json()) as Record<string, unknown>;
                                signingKey = String(keysData.current ?? '');
                                nextSigningKey = String(keysData.next ?? '');
                            }
                        } catch {
                            // signing-keys fetch is best-effort; resource still importable
                        }
                        resources.push({
                            id: 'qstash',
                            name: 'QStash',
                            type: 'qstash',
                            endpoint: 'https://qstash.upstash.io',
                            token: qstashToken,
                            signing_key: signingKey,
                            next_signing_key: nextSigningKey,
                        });
                    }
                } catch {
                    // QStash discovery is best-effort
                }

                // 3. Vector indexes — best-effort
                try {
                    const vectors = await upstashGet(externalFetch, auth, VECTOR_INDEXES_URL);
                    if (Array.isArray(vectors)) {
                        for (const entry of vectors) {
                            const v = entry as Record<string, unknown>;
                            resources.push({
                                id: String(v.id ?? ''),
                                name: String(v.name ?? ''),
                                type: 'vector',
                                endpoint: String(v.endpoint ?? ''),
                                region: String(v.region ?? ''),
                                dimensions: v.dimension_count,
                                similarity_function: String(v.similarity_function ?? ''),
                            });
                        }
                    }
                } catch {
                    // Vector discovery is best-effort
                }

                // 4. Search indexes — best-effort
                try {
                    const searches = await upstashGet(externalFetch, auth, SEARCH_INDEXES_URL);
                    if (Array.isArray(searches)) {
                        for (const entry of searches) {
                            const s = entry as Record<string, unknown>;
                            resources.push({
                                id: String(s.id ?? ''),
                                name: String(s.name ?? ''),
                                type: 'search',
                                endpoint: String(s.endpoint ?? ''),
                                region: String(s.region ?? ''),
                            });
                        }
                    }
                } catch {
                    // Search discovery is best-effort
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Upstash discovery failed: ${(error as Error).message}`,
                };
            }
        },

        async createResource(
            credentials: Record<string, unknown>,
            resourceType: string,
            name: string,
            region?: string,
        ): Promise<CreateResourceResult> {
            if (resourceType !== 'redis') {
                return {
                    success: false,
                    detail: `Unsupported resource type for upstash: ${resourceType}`,
                };
            }
            const token = String(credentials.api_token ?? '');
            const email = String(credentials.email ?? '');
            if (!token || !email) {
                return { success: false, detail: 'Credentials not available' };
            }
            const auth = basicAuthHeader(email, token);

            try {
                const resp = await guardedExternalFetch(externalFetch, CREATE_REDIS_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: auth,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        database_name: name,
                        platform: 'aws',
                        primary_region: region || 'global',
                        read_regions: [],
                        tls: true,
                    }),
                });

                if (resp.status === 200 || resp.status === 201) {
                    const data = (await resp.json()) as Record<string, unknown>;
                    return {
                        success: true,
                        resource: {
                            id: String(data.database_id ?? ''),
                            name: String(data.database_name ?? name),
                            type: 'redis',
                            endpoint: String(data.endpoint ?? ''),
                            rest_url: String(data.rest_url ?? ''),
                            rest_token: String(data.rest_token ?? ''),
                            region: String(data.region ?? region ?? ''),
                        },
                    };
                }

                let detail = `Upstash API error ${resp.status}`;
                try {
                    const text = await resp.text();
                    if (text) detail += `: ${text.slice(0, 300)}`;
                } catch {
                    // ignore body read failure
                }
                return { success: false, detail };
            } catch (error) {
                return {
                    success: false,
                    detail: `Upstash creation failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
