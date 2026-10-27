/**
 * Neon provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's discovery-time connection_uri fetch
 * (provider_discovery.py:370-425 — for a Neon project,
 * GET /v2/projects/{id}/connection_uri → store `connection_uri`) and the
 * adapter resolution (neon_adapter._build_connection_string building a
 * `postgresql://...?sslmode=require` URI from inline fields, plus
 * credential_resolver.get_datasource_credentials which serves the connected
 * account's stored `connection_uri`) into the framework worker.
 *
 * Enrichment (connect): api_key + project_id → fetch the project's
 *   connection_uri and merge it into the stored config. Best-effort; any
 *   fetch/parse failure returns the input unchanged so connect still succeeds
 *   with the bare token.
 *
 * Resolution (datasource → runner): favors a stored connection_uri / explicit
 *   connectionString; otherwise synthesizes one from inline host/port/db/user/
 *   password fields (Neon requires SSL → `?sslmode=require`). Emits the
 *   `{ connectionString }` shape that postgresRunner (edge-infra) expects.
 */
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import type { DatasourceResolver, ProviderEnricher } from './types.js';

/** Neon Console API base (HTTPS — passes the SSRF guard). */
const NEON_API = 'https://console.neon.tech/api/v2';

/** Default role/db used by the product's discovery flow. */
const DEFAULT_ROLE = 'neondb_owner';
const DEFAULT_DB = 'neondb';

/**
 * Resolve a stored Neon config into the postgresRunner shape `{ connectionString }`.
 * PURE. Favors an explicit URI (Neon's `/connection_uri` response carries auth
 * + sslmode already); falls back to assembling one from inline fields, matching
 * neon_adapter._build_connection_string (sslmode=require is mandatory for Neon).
 */
export const resolveNeon: DatasourceResolver = (config) => {
    const explicitUri = String(config.connection_uri ?? config.connectionString ?? '');
    if (explicitUri) return { connectionString: explicitUri };

    const host = String(config.host ?? '');
    if (!host) return { connectionString: '' };

    const port = config.port != null && config.port !== '' ? String(config.port) : '5432';
    const database = String(config.database ?? config.db ?? '');
    const user = String(config.username ?? config.user ?? '');
    const password = String(config.password ?? '');

    // neon_adapter format: postgresql://user:password@host:port/database?sslmode=require
    const auth = user || password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : '';
    const connectionString = `postgresql://${auth}${host}:${port}${database ? `/${database}` : ''}?sslmode=require`;
    return { connectionString };
};

interface ConnectionUriResponse {
    uri?: string;
}

/**
 * Connect-time enrichment. When both an api_key and a project_id are present,
 * fetches the project's connection_uri from the Neon Console API and merges it
 * into the config as `connection_uri`. Defensive: any fetch/parse failure is
 * swallowed and the original config is returned (best-effort, matching the
 * product's per-project try/except in provider_discovery._discover_neon).
 */
export const enrichNeon: ProviderEnricher = async (config, externalFetch) => {
    const apiKey = String(config.api_key ?? config.token ?? '');
    const projectId = String(config.project_id ?? config.project_ref ?? config.id ?? '');
    if (!apiKey || !projectId) return config; // nothing to fetch without both

    const roleName = String(config.role_name ?? DEFAULT_ROLE);
    const databaseName = String(config.database_name ?? config.database ?? DEFAULT_DB);

    const url =
        `${NEON_API}/projects/${encodeURIComponent(projectId)}/connection_uri`
        + `?role_name=${encodeURIComponent(roleName)}&database_name=${encodeURIComponent(databaseName)}`;

    try {
        const resp = await guardedExternalFetch(externalFetch, url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (resp.ok) {
            const data = await resp.json() as ConnectionUriResponse;
            if (data?.uri) {
                return { ...config, connection_uri: String(data.uri), project_id: projectId };
            }
        }
    } catch {
        // best-effort — swallow
    }

    return config;
};
