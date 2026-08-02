/**
 * Turso resource strategy.
 *
 * Ports the product reference (_discover_turso + _create_turso_db in
 * provider_discovery.py) to the framework's guarded-fetch seam, plus a
 * by-account Path A for stored credentials. Surfaces one resource kind —
 * `turso_db` — and provisions new databases.
 *
 * discover has two paths:
 *   - Path A (by-account, stored creds): when `credentials.databases` is a
 *     non-empty array (or JSON-encoded array string), emit one resource per
 *     stored DB with the richer shape {id, name, type, db_url, hostname,
 *     token, last_tested, test_ok}. This avoids re-hitting the Turso API on
 *     every discovery after the connect handler has already captured the
 *     account's databases.
 *   - Path B (raw /discover or empty stored): fall through to the live Turso
 *     Management API — list organizations, then list each org's databases,
 *     normalizing `db_url` to `libsql://{hostname}`.
 *
 * createResource provisions a new `turso_db` under the first org's
 * `default` group (product-faithful: turso create uses a `group` kwarg
 * defaulting to 'default'; the framework createResource signature has no
 * group param, so 'default' is hardcoded).
 *
 * Field names (hostname, db_url, org, group, regions, token, last_tested,
 * test_ok) match the product EXACTLY because the SPA dedupes imported
 * resources on db_url / hostname.
 *
 * All outbound HTTP goes through guardedExternalFetch (https-only, no
 * redirects, private-IP blocked, 10s timeout per call). Credentials arrive
 * already decrypted + snake_case from the route handler.
 *
 * No listEngines — Turso has no equivalent of Cloudflare Workers scripts,
 * and engine_lister.py has no turso entry.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    CreateResourceResult,
    DiscoveredResource,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

const ORGS_URL = 'https://api.turso.tech/v1/organizations';

/** Extract a stored `databases` array from credentials.
 *
 * The connect handler may store databases as either a real array or a
 * JSON-encoded string. Returns the array when present + non-empty, else
 * `null` so the caller falls through to the live API (Path B). */
function extractDatabasesArray(raw: unknown): unknown[] | null {
    let arr: unknown = raw;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            arr = JSON.parse(raw);
        } catch {
            return null; // not JSON — treat as absent
        }
    }
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
}

export function createTursoResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'turso',

        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            // Path A — stored databases[] from the connect handler (no network).
            const storedDbs = extractDatabasesArray(credentials.databases);
            if (storedDbs) {
                const resources: DiscoveredResource[] = [];
                for (const entry of storedDbs) {
                    const d = (entry ?? {}) as Record<string, unknown>;
                    const name = String(d.name ?? '');
                    const hostname = String(d.hostname ?? '');
                    const storedDbUrl = String(d.db_url ?? '');
                    resources.push({
                        id: String(d.id ?? name),
                        name,
                        type: 'turso_db',
                        hostname,
                        db_url: storedDbUrl || (hostname ? `libsql://${hostname}` : ''),
                        token: String(d.token ?? ''),
                        last_tested: String(d.last_tested ?? ''),
                        test_ok: typeof d.test_ok === 'boolean' ? d.test_ok : undefined,
                    });
                }
                return { success: true, resources };
            }

            // Path B — live Turso Management API.
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers = { Authorization: `Bearer ${token}` };

            try {
                const orgResp = await guardedExternalFetch(externalFetch, ORGS_URL, { headers });
                if (!orgResp.ok) {
                    return { success: false, detail: `Turso API error: ${orgResp.status}` };
                }
                const orgs = await orgResp.json();
                const orgList = Array.isArray(orgs) ? orgs : [];
                const resources: DiscoveredResource[] = [];

                // Iterate every org (product-faithful): 1 + N calls where N is
                // typically 1; bounded since accounts rarely have many orgs.
                for (const orgEntry of orgList) {
                    const org = (orgEntry ?? {}) as Record<string, unknown>;
                    const orgSlug = String(org.slug ?? org.name ?? '');
                    if (!orgSlug) continue;

                    let dbList: unknown = null;
                    try {
                        const dbResp = await guardedExternalFetch(
                            externalFetch,
                            `${ORGS_URL}/${orgSlug}/databases`,
                            { headers },
                        );
                        if (!dbResp.ok) continue; // best-effort per org
                        const dbs = await dbResp.json();
                        // Turso returns either a bare array or {databases: [...]}.
                        if (Array.isArray(dbs)) {
                            dbList = dbs;
                        } else if (dbs && typeof dbs === 'object') {
                            const wrapped = (dbs as Record<string, unknown>).databases;
                            dbList = Array.isArray(wrapped) ? wrapped : null;
                        }
                    } catch {
                        continue; // per-org fetch is best-effort
                    }
                    if (!Array.isArray(dbList)) continue;

                    for (const dbEntry of dbList) {
                        const d = (dbEntry ?? {}) as Record<string, unknown>;
                        const hostname = String(d.hostname ?? '');
                        const dbName = String(d.name ?? d.Name ?? '');
                        resources.push({
                            id: dbName,
                            name: dbName,
                            type: 'turso_db',
                            hostname,
                            db_url: hostname ? `libsql://${hostname}` : '',
                            org: orgSlug,
                            group: String(d.group ?? ''),
                            regions: Array.isArray(d.regions) ? (d.regions as string[]) : [],
                        });
                    }
                }

                return { success: true, resources };
            } catch (error) {
                return {
                    success: false,
                    detail: `Turso discovery failed: ${(error as Error).message}`,
                };
            }
        },

        async createResource(
            credentials: Record<string, unknown>,
            resourceType: string,
            name: string,
            _region?: string,
        ): Promise<CreateResourceResult> {
            if (resourceType !== 'turso_db') {
                return {
                    success: false,
                    detail: `Unsupported resource type for turso: ${resourceType}`,
                };
            }
            const token = String(credentials.api_token ?? '');
            if (!token) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers = {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            try {
                // Resolve the first org slug (product uses orgs[0]).
                const orgResp = await guardedExternalFetch(externalFetch, ORGS_URL, { headers });
                if (!orgResp.ok) {
                    return { success: false, detail: `Turso API error: ${orgResp.status}` };
                }
                const orgs = await orgResp.json();
                const orgList = Array.isArray(orgs) ? orgs : [];
                if (orgList.length === 0) {
                    return { success: false, detail: 'No Turso organizations found' };
                }
                const orgSlug = String((orgList[0] as Record<string, unknown>).slug ?? '');

                const resp = await guardedExternalFetch(
                    externalFetch,
                    `${ORGS_URL}/${orgSlug}/databases`,
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ name, group: 'default' }),
                    },
                );

                if (resp.status === 200 || resp.status === 201) {
                    const data = (await resp.json()) as Record<string, unknown>;
                    // Turso wraps the new DB as {database: {...}}; fall back to the
                    // top-level object for resilience.
                    const db =
                        data.database && typeof data.database === 'object'
                            ? (data.database as Record<string, unknown>)
                            : data;
                    const hostname = String(db.hostname ?? '');
                    return {
                        success: true,
                        resource: {
                            id: String(db.name ?? name),
                            name: String(db.name ?? name),
                            type: 'turso_db',
                            hostname,
                            db_url: hostname ? `libsql://${hostname}` : '',
                        },
                    };
                }

                let detail = `Turso create error ${resp.status}`;
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
                    detail: `Turso creation failed: ${(error as Error).message}`,
                };
            }
        },
    };
}
