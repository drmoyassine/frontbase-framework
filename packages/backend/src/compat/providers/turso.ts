/**
 * Turso provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's Turso semantics into the framework worker:
 *   - Resolution: a Turso datasource picks ONE database and needs its libsql
 *     `url` + auth `token`. The runner (sqliteRunner over libsql) expects
 *     `{ url, authToken }`. See product db_connection_tester._test_turso
 *     (inline `db_url` + `db_token`) and routers/edge_providers.py:595-742,
 *     where the per-account manual DB registry stores entries shaped
 *     `{ id, name, url, token, last_tested, test_ok }`.
 *   - Enrichment (connect): Turso accounts MAY pre-store a `databases` JSON
 *     array (manual registry, mutated via the /turso-databases CRUD endpoints).
 *     There is NO mandatory connect-time fetch. If, however, the config carries
 *     an account-level `api_token`, we MAY list databases via the Management API
 *     (GET /v1/organizations then GET /v1/organizations/{org}/databases — see
 *     product services/provider_discovery.py:334-367) and merge a discovered
 *     `databases` array. Best-effort; any fetch/parse failure returns the input
 *     unchanged so connect still succeeds with the bare token.
 *
 * RUNNER NEEDS (datasource-runner.ts `turso` case → sqliteRunner): `{ url, authToken }`.
 *
 * Use guardedExternalFetch for any HTTP. Keep resolveTurso PURE.
 */
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import type { DatasourceResolver, ProviderEnricher } from './types.js';

const TURSO_API = 'https://api.turso.tech/v1';

/**
 * Resolve a stored Turso config into the sqliteRunner shape `{ url, authToken }`.
 * PURE. Honors both the connect-payload field names (`db_url` + `db_token`) and
 * the registry-entry field names (`url` + `token`), and falls back into a stored
 * `databases` array (selected by `db_id` / `db_name`) when direct fields are
 * absent — i.e. an account-level config was handed to the resolver.
 */
export const resolveTurso: DatasourceResolver = (config) => {
    const url = String(config.db_url ?? config.url ?? '');
    let token = String(config.token ?? config.db_token ?? config.authToken ?? '');

    // Fallback: an account-level config may carry the registry array + a
    // selector (db_id / db_name) instead of flattened fields.
    if (!url && Array.isArray(config.databases)) {
        const selectorId = String(config.db_id ?? '');
        const selectorName = String(config.db_name ?? '');
        const match = (config.databases as Array<Record<string, unknown>>).find((d) => {
            const id = String(d?.id ?? '');
            const name = String(d?.name ?? '');
            return (selectorId !== '' && id === selectorId)
                || (selectorName !== '' && name === selectorName);
        });
        if (match) {
            // url is recomputed from the matched entry above; resolve token too.
            const entryUrl = String(match.url ?? match.db_url ?? '');
            const entryToken = String(match.token ?? match.db_token ?? '');
            return { url: entryUrl, authToken: token || entryToken };
        }
    }

    return { url, authToken: token };
};

interface TursoOrg { slug?: string; name?: string }
interface TursoDb { hostname?: string; name?: string; Name?: string; group?: string; regions?: unknown[] }

/**
 * Connect-time enrichment. Discovers databases via the Turso Management API and
 * merges them into the config as a `databases` array. Defensive: any fetch/parse
 * failure is swallowed and the original config is returned (best-effort — the
 * product's default is a manual registry, and connect must still succeed).
 *
 * Requires an account-level `api_token`; without it there is nothing to enrich
 * and the config is returned unchanged. Will NOT overwrite a pre-existing
 * `databases` array (the manual registry is the source of truth). When `org` /
 * `org_slug` is present, only that organization's databases are listed; otherwise
 * every visible organization is enumerated (matching provider_discovery.py).
 */
export const enrichTurso: ProviderEnricher = async (config, externalFetch) => {
    const apiToken = String(config.api_token ?? '');
    if (!apiToken) return config; // manual registry — nothing to fetch at connect
    // Don't clobber a pre-existing manual DB registry.
    if (Array.isArray(config.databases) && config.databases.length > 0) return config;

    const merged: Record<string, unknown> = { ...config };

    try {
        // GET /v1/organizations → [{ slug, name }, ...]
        const orgResp = await guardedExternalFetch(externalFetch, `${TURSO_API}/organizations`, {
            headers: { Authorization: `Bearer ${apiToken}` },
        });
        if (!orgResp.ok) return config;
        const orgsRaw = await orgResp.json() as unknown;
        const orgs: TursoOrg[] = Array.isArray(orgsRaw) ? (orgsRaw as TursoOrg[]) : [];

        const desiredOrg = String(config.org ?? config.org_slug ?? '');
        const databases: Record<string, unknown>[] = [];

        for (const org of orgs) {
            const slug = String(org?.slug ?? org?.name ?? '');
            if (!slug) continue;
            if (desiredOrg && slug !== desiredOrg) continue;

            // GET /v1/organizations/{org}/databases → { databases: [...] } | [...]
            try {
                const dbResp = await guardedExternalFetch(
                    externalFetch,
                    `${TURSO_API}/organizations/${encodeURIComponent(slug)}/databases`,
                    { headers: { Authorization: `Bearer ${apiToken}` } },
                );
                if (!dbResp.ok) continue;
                const dbPayload = await dbResp.json() as unknown;
                const dbListRaw = Array.isArray(dbPayload)
                    ? dbPayload
                    : (dbPayload as Record<string, unknown> | null)?.databases;
                const dbList: unknown[] = Array.isArray(dbListRaw) ? dbListRaw : [];
                for (const entry of dbList) {
                    const d = (entry ?? {}) as TursoDb;
                    const hostname = String(d.hostname ?? '');
                    const name = String(d.name ?? d.Name ?? '');
                    databases.push({
                        id: name || hostname,
                        name,
                        url: hostname ? `libsql://${hostname}` : '',
                        org: slug,
                        group: d.group ?? '',
                        regions: Array.isArray(d.regions) ? d.regions : [],
                    });
                }
            } catch {
                // best-effort per org — keep iterating the remaining orgs
            }
        }

        if (databases.length > 0) merged.databases = databases;
    } catch {
        // best-effort — swallow; return input unchanged
    }

    return merged;
};
