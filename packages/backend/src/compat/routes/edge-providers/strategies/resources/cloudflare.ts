/**
 * Cloudflare resource strategy.
 *
 * Ports the product reference (app/services/provider_discovery.py →
 * _discover_cloudflare / _create_cf_{d1,kv,queue}, and
 * app/services/cloudflare_api.py → list_workers) to the framework's
 * guarded-fetch seam. Field names are copied exactly so the SPA's
 * import-dedupe (rest_url / db_url / cache_url / queue_url / hostname ...)
 * keeps working.
 *
 *   - discover:     d1 / kv / r2 / queue / vectorize (paginated GETs, all accounts)
 *   - createResource: d1 / kv / queue
 *   - listEngines:  Workers scripts (scripts + workers.dev subdomain)
 *
 * All outbound HTTP goes through guardedExternalFetch (https-only, no
 * redirects, private-IP blocked, 10s guard). Methods never throw — they
 * return a product-faithful {success:false, detail} on any failure.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    CreateResourceResult,
    ListEnginesResult,
    DiscoveredResource,
    EngineInfo,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

const CF_API = 'https://api.cloudflare.com/client/v4';
const MAX_PAGES = 5; // per-endpoint pagination cap (× 50 items = 250 per account)

/** Cloudflare v4 envelope. */
interface CfEnvelope {
    success?: boolean;
    errors?: Array<{ code?: number; message?: string }>;
    result?: unknown;
    result_info?: { total_pages?: number; count?: number };
}

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function firstError(envelope: CfEnvelope | null, fallback: string): string {
    const errs = envelope?.errors;
    if (Array.isArray(errs) && errs.length > 0 && errs[0]?.message) {
        return String(errs[0].message);
    }
    return fallback;
}

/**
 * Paginated GET on a Cloudflare v4 list endpoint. Returns the merged
 * `result` arrays across pages (best-effort: stops on the first network
 * error, non-200, or non-array result). Mirrors product _cf_api_get but
 * adds bounded pagination so accounts with >20 of a resource fully surface.
 */
async function cfGetAll(
    externalFetch: CompatFetch,
    token: string,
    path: string,
): Promise<unknown[]> {
    const headers = authHeaders(token);
    const out: unknown[] = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${CF_API}${path}${sep}page=${page}&per_page=50`;
        let resp: Response;
        try {
            resp = await guardedExternalFetch(externalFetch, url, { headers });
        } catch {
            return out; // network/redirect/timeout — return what we have
        }
        if (!resp.ok) return out;
        let body: CfEnvelope;
        try {
            body = (await resp.json()) as CfEnvelope;
        } catch {
            return out;
        }
        const result = body.result;
        if (!Array.isArray(result)) return out;
        if (result.length === 0) return out;
        for (const row of result) out.push(row);
        const totalPages = body.result_info?.total_pages;
        if (!totalPages || page >= totalPages) break;
    }
    return out;
}

/** POST + parse envelope (reads JSON on any status, like the product). */
async function cfPost(
    externalFetch: CompatFetch,
    token: string,
    path: string,
    payload: Record<string, unknown>,
): Promise<CfEnvelope | null> {
    try {
        const resp = await guardedExternalFetch(externalFetch, `${CF_API}${path}`, {
            headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
            method: 'POST',
            body: JSON.stringify(payload),
        });
        try {
            return (await resp.json()) as CfEnvelope;
        } catch {
            return null;
        }
    } catch {
        return null;
    }
}

/** Resolve a single account_id for create/listEngines (hint or first account). */
async function resolveAccountId(
    externalFetch: CompatFetch,
    token: string,
    hinted: string,
): Promise<string | null> {
    if (hinted) return hinted;
    try {
        const resp = await guardedExternalFetch(externalFetch, `${CF_API}/accounts`, {
            headers: authHeaders(token),
        });
        if (!resp.ok) return null;
        const body = (await resp.json()) as CfEnvelope;
        const arr = Array.isArray(body.result) ? body.result : [];
        const first = arr[0] as { id?: unknown } | undefined;
        const id = first?.id;
        return id ? String(id) : null;
    } catch {
        return null;
    }
}

/** List ALL accounts (discover scans every account, matching the product). */
async function listAccounts(
    externalFetch: CompatFetch,
    token: string,
): Promise<Array<{ id: string; name: string }>> {
    const rows = await cfGetAll(externalFetch, token, '/accounts');
    const out: Array<{ id: string; name: string }> = [];
    for (const raw of rows) {
        const row = raw as { id?: unknown; name?: unknown };
        const id = row.id ? String(row.id) : '';
        if (!id) continue;
        out.push({ id, name: String(row.name ?? '') });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export function createCloudflareResourceStrategy(
    externalFetch: CompatFetch,
): ProviderResourceStrategy {
    return {
        provider: 'cloudflare',

        // -------------------------------------------------------------------
        // discover — d1 / kv / r2 / queue / vectorize across all accounts
        // -------------------------------------------------------------------
        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }

            try {
                const accounts = await listAccounts(externalFetch, token);
                if (accounts.length === 0) {
                    return {
                        success: false,
                        detail: 'No Cloudflare accounts found or invalid token',
                    };
                }

                const resources: DiscoveredResource[] = [];
                for (const acct of accounts) {
                    const accountId = acct.id;
                    const accountName = acct.name;

                    // 1. D1 databases → db_url 'd1://{uuid}'
                    const d1Rows = await cfGetAll(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/d1/database`,
                    );
                    for (const raw of d1Rows) {
                        const d = raw as { uuid?: unknown; name?: unknown };
                        const uuid = String(d.uuid ?? '');
                        resources.push({
                            id: uuid,
                            name: String(d.name ?? ''),
                            type: 'd1',
                            account_id: accountId,
                            account_name: accountName,
                            db_url: `d1://${uuid}`,
                        });
                    }

                    // 2. KV namespaces → cache_url 'kv://{ns}'
                    const kvRows = await cfGetAll(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/storage/kv/namespaces`,
                    );
                    for (const raw of kvRows) {
                        const ns = raw as { id?: unknown; title?: unknown };
                        const nsId = String(ns.id ?? '');
                        resources.push({
                            id: nsId,
                            name: String(ns.title ?? ''),
                            type: 'kv',
                            account_id: accountId,
                            account_name: accountName,
                            cache_url: `kv://${nsId}`,
                        });
                    }

                    // 3. R2 buckets → r2_url 'r2://{name}' (matches the d1/kv/queue
                    //    url-handle convention; product omits an r2 url handle)
                    const r2Rows = await cfGetAll(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/r2/buckets`,
                    );
                    for (const raw of r2Rows) {
                        const b = raw as { name?: unknown };
                        const name = String(b.name ?? '');
                        resources.push({
                            id: name,
                            name,
                            type: 'r2',
                            account_id: accountId,
                            account_name: accountName,
                            r2_url: `r2://${name}`,
                        });
                    }

                    // 4. Queues → queue_url 'cfq://{queue_id}'
                    const qRows = await cfGetAll(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/queues`,
                    );
                    for (const raw of qRows) {
                        const q = raw as { queue_id?: unknown; queue_name?: unknown };
                        const qId = String(q.queue_id ?? '');
                        resources.push({
                            id: qId,
                            name: String(q.queue_name ?? ''),
                            type: 'queue',
                            account_id: accountId,
                            account_name: accountName,
                            queue_url: `cfq://${qId}`,
                        });
                    }

                    // 5. Vectorize indexes → dimensions + metric
                    const vRows = await cfGetAll(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/vectorize/v2/indexes`,
                    );
                    for (const raw of vRows) {
                        const v = raw as {
                            name?: unknown;
                            config?: { dimensions?: unknown; metric?: unknown } | null;
                        };
                        const name = String(v.name ?? '');
                        resources.push({
                            id: name,
                            name,
                            type: 'vectorize',
                            account_id: accountId,
                            account_name: accountName,
                            dimensions: v.config?.dimensions ?? undefined,
                            metric: v.config?.metric ?? undefined,
                        });
                    }
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Cloudflare discovery failed: ${(error as Error).message}`,
                };
            }
        },

        // -------------------------------------------------------------------
        // createResource — d1 / kv / queue
        // -------------------------------------------------------------------
        async createResource(
            credentials: Record<string, unknown>,
            resourceType: string,
            name: string,
            _region?: string,
        ): Promise<CreateResourceResult> {
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const safeName = String(name ?? '').trim();
            if (!safeName) {
                return { success: false, detail: 'Resource name is required' };
            }

            try {
                if (resourceType === 'd1') {
                    const accountId = await resolveAccountId(
                        externalFetch,
                        token,
                        String(credentials.account_id ?? ''),
                    );
                    if (!accountId) {
                        return { success: false, detail: 'No Cloudflare accounts found' };
                    }
                    const envelope = await cfPost(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/d1/database`,
                        { name: safeName },
                    );
                    if (envelope?.success) {
                        const result = (envelope.result ?? {}) as {
                            uuid?: unknown;
                            name?: unknown;
                        };
                        const uuid = String(result.uuid ?? '');
                        return {
                            success: true,
                            resource: {
                                id: uuid,
                                name: String(result.name ?? safeName),
                                type: 'd1',
                                db_url: `d1://${uuid}`,
                            },
                        };
                    }
                    return {
                        success: false,
                        detail: firstError(envelope, 'D1 create failed'),
                    };
                }

                if (resourceType === 'kv') {
                    const accountId = await resolveAccountId(
                        externalFetch,
                        token,
                        String(credentials.account_id ?? ''),
                    );
                    if (!accountId) {
                        return { success: false, detail: 'No Cloudflare accounts found' };
                    }
                    const envelope = await cfPost(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/storage/kv/namespaces`,
                        { title: safeName },
                    );
                    if (envelope?.success) {
                        const result = (envelope.result ?? {}) as {
                            id?: unknown;
                            title?: unknown;
                        };
                        const nsId = String(result.id ?? '');
                        return {
                            success: true,
                            resource: {
                                id: nsId,
                                name: String(result.title ?? safeName),
                                type: 'kv',
                            },
                        };
                    }
                    return {
                        success: false,
                        detail: firstError(envelope, 'KV create failed'),
                    };
                }

                if (resourceType === 'queue') {
                    const accountId = await resolveAccountId(
                        externalFetch,
                        token,
                        String(credentials.account_id ?? ''),
                    );
                    if (!accountId) {
                        return { success: false, detail: 'No Cloudflare accounts found' };
                    }
                    const envelope = await cfPost(
                        externalFetch,
                        token,
                        `/accounts/${accountId}/queues`,
                        { queue_name: safeName },
                    );
                    if (envelope?.success) {
                        const result = (envelope.result ?? {}) as {
                            queue_id?: unknown;
                            queue_name?: unknown;
                        };
                        const qId = String(result.queue_id ?? '');
                        return {
                            success: true,
                            resource: {
                                id: qId,
                                name: String(result.queue_name ?? safeName),
                                type: 'queue',
                            },
                        };
                    }
                    return {
                        success: false,
                        detail: firstError(envelope, 'Queue create failed'),
                    };
                }

                return {
                    success: false,
                    detail: `Resource creation not supported for cloudflare/${resourceType}`,
                };
            } catch (error) {
                return {
                    success: false,
                    detail: `Cloudflare create failed: ${(error as Error).message}`,
                };
            }
        },

        // -------------------------------------------------------------------
        // listEngines — Workers scripts (scripts + workers.dev subdomain)
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

            try {
                const accountId = await resolveAccountId(
                    externalFetch,
                    token,
                    String(credentials.account_id ?? ''),
                );
                if (!accountId) {
                    return {
                        success: false,
                        engines: [],
                        detail: 'No Cloudflare accounts found',
                    };
                }

                const scripts = await cfGetAll(
                    externalFetch,
                    token,
                    `/accounts/${accountId}/workers/scripts`,
                );

                // Resolve the workers.dev subdomain for URL construction (best-effort;
                // product falls back to "workers.dev" on any failure).
                let subdomain = 'workers.dev';
                try {
                    const subResp = await guardedExternalFetch(
                        externalFetch,
                        `${CF_API}/accounts/${accountId}/workers/subdomain`,
                        { headers: authHeaders(token) },
                    );
                    if (subResp.ok) {
                        const subBody = (await subResp.json()) as CfEnvelope;
                        const subResult = subBody.result as { subdomain?: unknown } | null;
                        const subName = subResult?.subdomain ? String(subResult.subdomain) : '';
                        if (subName) subdomain = `${subName}.workers.dev`;
                    }
                } catch {
                    // ignore — keep default subdomain
                }

                const engines: EngineInfo[] = [];
                for (const raw of scripts) {
                    const s = raw as {
                        id?: unknown;
                        modified_on?: unknown;
                        created_on?: unknown;
                    };
                    const scriptName = String(s.id ?? '');
                    engines.push({
                        name: scriptName,
                        url: `https://${scriptName}.${subdomain}`,
                        provider: 'cloudflare',
                        deployed_at: String(s.modified_on ?? ''),
                        created_at: String(s.created_on ?? ''),
                    });
                }

                return { success: true, engines };
            } catch (error) {
                return {
                    success: false,
                    engines: [],
                    detail: `Cloudflare engine listing failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
