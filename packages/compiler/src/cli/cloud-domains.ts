/**
 * Cloud deployment routing: app.<zone> is a Workers Custom Domain;
 * *.<zone> uses a Workers route over existing proxied wildcard DNS.
 * Cloudflare Custom Domains do not support wildcards.
 * Token scopes: Zone Read, DNS Read, Workers Scripts Edit, Workers Routes Edit.
 * Existing DNS and routes owned by other workers are never overwritten.
 * Tests inject the HTTP transport; live DNS/certificate proof remains required.
 */

/** Minimal Response surface the seam must provide (no DOM dependency). */
export interface FetchLike {
    (input: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export interface AttachDomainsResult {
    /** Zone id the hostnames were attached under. */
    zoneId: string;
    /** Hostnames whose Custom Domain or route is attached (DNS/TLS still require live verification). */
    attached: string[];
    /** Hostnames the API refused, with its error detail. */
    failed: Array<{ hostname: string; status: number; detail: string }>;
}

export class ZoneNotFoundError extends Error {
    constructor(zoneName: string) {
        super(`zone_not_found: no Cloudflare zone named "${zoneName}" is visible to this API token (needs Zone Read)`);
        this.name = 'ZoneNotFoundError';
    }
}

/** Resolve the zone id for `zoneName`, then attach every hostname in
 *  `hostnames` to the worker `service`. Partial failure does not abort the
 *  remaining hostnames — the result carries per-hostname outcomes so the
 *  caller can remediate exactly what failed. */
export async function attachWorkerDomains(
    accountId: string,
    apiToken: string,
    zoneName: string,
    hostnames: string[],
    service: string,
    fetchSeam: FetchLike = defaultFetch,
): Promise<AttachDomainsResult> {
    if (!accountId) throw new Error('accountId is required');
    if (!apiToken) throw new Error('apiToken is required');
    if (!service) throw new Error('service (worker name) is required');
    if (hostnames.length === 0) throw new Error('hostnames must not be empty');

    // 1. Zone lookup — by name, so the caller never handles a zone id.
    const zoneRes = await fetchSeam(
        `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    const zoneBody = await zoneRes.json() as { result?: Array<{ id?: string }> };
    const zoneId = zoneBody.result?.[0]?.id;
    if (!zoneRes.ok || !zoneId) throw new ZoneNotFoundError(zoneName);

    // 2. Attach each hostname (upsert — safe to re-run).
    const attached: string[] = [];
    const failed: AttachDomainsResult['failed'] = [];
    for (const hostname of hostnames) {
        // Custom Domains do not accept wildcards; tenant hosts need a zone route.
        if (hostname.startsWith('*.')) {
            const failure = await attachWildcardRoute(zoneId, apiToken, hostname, service, fetchSeam);
            if (failure) failed.push({ hostname, ...failure });
            else attached.push(hostname);
            continue;
        }
        const res = await fetchSeam(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/domains`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ zone_id: zoneId, hostname, service, environment: 'production' }),
            },
        );
        if (res.ok) {
            attached.push(hostname);
            continue;
        }
        const body = await res.json().catch(() => ({})) as { errors?: Array<{ message?: string }> };
        failed.push({
            hostname,
            status: res.status,
            detail: body.errors?.[0]?.message ?? `HTTP ${res.status}`,
        });
    }
    return { zoneId, attached, failed };
}

/** The two hostnames a cloud deploy needs on the base-domain zone: the app
 *  host (platform console + signup) and the wildcard that makes every
 *  registered slug's host route to the worker. */
export function cloudHostnames(zoneName: string, appLabel = 'app'): string[] {
    return [`${appLabel}.${zoneName}`, `*.${zoneName}`];
}

/** Wildcard routing requires existing proxied DNS. Never overwrite DNS or
 * another worker's route, including an explicit no-worker exclusion. */
async function attachWildcardRoute(
    zoneId: string, token: string, hostname: string, service: string, fetcher: FetchLike,
): Promise<{ status: number; detail: string } | null> {
    const base = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const dns = await fetcher(`${base}/dns_records?name=${encodeURIComponent(hostname)}&per_page=100`, { headers });
    const dnsBody = await dns.json().catch(() => ({})) as {
        success?: boolean; result?: Array<{ name?: string; proxied?: boolean; type?: string }>;
    };
    if (!dns.ok || dnsBody.success === false) {
        return { status: dns.status, detail: 'Cannot verify wildcard DNS; the token needs DNS Read on the zone.' };
    }
    if (!dnsBody.result?.some((r) => r.name === hostname && r.proxied === true && ['A', 'AAAA', 'CNAME'].includes(r.type ?? ''))) {
        return { status: 409, detail: `Create an operator-approved proxied DNS record for ${hostname}, then retry. DNS records are never created or overwritten by this helper.` };
    }
    const pattern = `${hostname}/*`;
    let owned = false;
    for (let page = 1; ; page++) {
        const res = await fetcher(`${base}/workers/routes?per_page=100&page=${page}`, { headers });
        const body = await res.json().catch(() => ({})) as {
            success?: boolean; result?: Array<{ pattern?: string; script?: string }>;
            result_info?: { total_pages?: number };
        };
        if (!res.ok || body.success === false || !Array.isArray(body.result)) {
            return { status: res.status, detail: 'Cannot inspect existing Workers routes; no route was changed.' };
        }
        for (const route of body.result) {
            if (route.pattern !== pattern) continue;
            if (route.script !== service) {
                return { status: 409, detail: `Route ${pattern} already belongs to another worker or is an exclusion. Resolve it explicitly before retrying.` };
            }
            owned = true;
        }
        if (page >= (body.result_info?.total_pages ?? 1)) break;
        if (page >= 100) return { status: 409, detail: 'Route inventory exceeded the safety limit; no route was changed.' };
    }
    if (owned) return null;
    const created = await fetcher(`${base}/workers/routes`, {
        method: 'POST', headers, body: JSON.stringify({ pattern, script: service }),
    });
    const result = await created.json().catch(() => ({})) as { success?: boolean };
    if (!created.ok || result.success === false) {
        return { status: created.status, detail: `Wildcard route creation failed (HTTP ${created.status}); inspect Workers Routes permissions and retry.` };
    }
    return null;
}