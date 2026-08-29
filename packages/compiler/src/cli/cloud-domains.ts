/**
 * A-25 WA9 — attach Workers Custom Domains via the Cloudflare API, so a cloud
 * deploy serves the apex app host (`app.<zone>`) and every tenant host
 * (`*.<zone>`) without a dashboard trip. Idempotent: the Custom Domains attach
 * (`PUT /accounts/{id}/workers/domains`) is an upsert — re-attaching an
 * existing hostname is a no-op, so re-running the deploy is safe.
 *
 * The zone is resolved by name (`GET /zones?name=<zone>`) — the deploy only
 * knows the base domain (e.g. `frontbase.dev`), never its zone id.
 *
 * Auth: the account API token travels ONLY in the Authorization header of the
 * API request — never argv, never a log line, never the returned result.
 * Required token scopes: Zone Read (zone lookup), Workers Scripts Edit,
 * Workers Routes Edit (Custom Domains attach).
 *
 * `fetchSeam` is the test seam: the suite injects a deterministic Cloudflare
 * double and asserts the exact request shapes (plan V1 — the live API's
 * wildcard-hostname acceptance can't be proven from a repo; the dashboard
 * fallback is documented for when it refuses).
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
    /** Hostnames whose attach returned 2xx. */
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
