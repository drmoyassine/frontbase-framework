/**
 * Cloudflare provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's connect-time account_id detection (edge_providers.py:341-360
 * + cloudflare_api.detect_account_id) and the D1 adapter resolution
 * (credential_resolver.get_datasource_credentials) into the framework worker.
 *
 * Enrichment (connect): with the stored `api_token`, call
 *   GET https://api.cloudflare.com/client/v4/accounts?per_page=1
 * take the first account's id (+ name), and merge `account_id` (+ `account_name`)
 * into the config as cleartext metadata. Best-effort; failures return the input
 * unchanged so connect still succeeds with the bare token (matching the product,
 * which logs a warning and keeps the account on success/failure alike).
 *
 * Resolution (datasource → runner): { account_id|accountId, database_id|databaseId,
 *   api_token|apiToken } → { accountId, databaseId, apiToken } as expected by
 *   d1RunnerFromRest (edge-infra runners.ts). The api_token comes from the
 *   account, accountId from enrichment (cleartext metadata), databaseId is
 *   chosen by the user/resource.
 *
 * PRODUCT FIELD SEMANTICS:
 *   - secrets (PROVIDER_SECRET_KEYS): `api_token` → encrypted at rest.
 *   - metadata (PROVIDER_METADATA_KEYS): `account_id` → cleartext for UI display.
 *   - get_datasource_credentials returns `{ ...metadata, ...creds }`, so a D1
 *     datasource bound to a Cloudflare connected account yields `{ account_id,
 *     api_token }` plus the user-chosen `database_id`.
 */
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import type { DatasourceResolver, ProviderEnricher } from './types.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * Resolve a stored Cloudflare/D1 config into the d1RunnerFromRest shape.
 * PURE. Maps both the connect-payload field names (snake_case) and the runner
 * field names (camelCase) into the canonical runner shape.
 */
export const resolveCloudflare: DatasourceResolver = (config) => {
    const accountId = String(config.accountId ?? config.account_id ?? '');
    const databaseId = String(config.databaseId ?? config.database_id ?? '');
    const apiToken = String(config.apiToken ?? config.api_token ?? '');
    return { accountId, databaseId, apiToken };
};

interface CfAccount { id?: string; name?: string }
interface CfAccountsResponse { result?: CfAccount[]; success?: boolean }

/**
 * Connect-time enrichment. Detects the first Cloudflare account id from the
 * stored api_token and merges it (plus the account name, if present) into the
 * config as cleartext metadata. Defensive: any fetch/parse failure is swallowed
 * and the original config is returned (best-effort, matching the product).
 */
export const enrichCloudflare: ProviderEnricher = async (config, externalFetch) => {
    const apiToken = String(config.api_token ?? '');
    if (!apiToken) return config; // nothing to detect without a token

    const merged: Record<string, unknown> = { ...config };

    // GET /client/v4/accounts?per_page=1 → { result: [{ id, name }, ...] }
    try {
        const resp = await guardedExternalFetch(
            externalFetch,
            `${CF_API}/accounts?per_page=1`,
            { headers: { Authorization: `Bearer ${apiToken}` } },
        );
        if (resp.ok) {
            const data = await resp.json() as CfAccountsResponse;
            const accounts = Array.isArray(data?.result) ? data.result : [];
            const first = accounts[0];
            if (first?.id) {
                merged.account_id = String(first.id);
                if (first.name) merged.account_name = String(first.name);
            }
        }
    } catch {
        // best-effort — swallow (network error, non-HTTPS, SSRF guard, etc.)
    }

    return merged;
};
