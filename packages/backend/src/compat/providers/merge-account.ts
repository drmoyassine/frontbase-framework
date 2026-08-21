/**
 * Shared datasource-config hydration (used by the sync AND database compat
 * routes). Datasource rows persist only `provider_account_id` + the fields the
 * SPA sent — the secrets themselves stay on the connected account row and are
 * merged back at read time (product parity: no secret duplication, survives
 * key rotation).
 *
 * Routes that build a runner from a stored datasource config MUST hydrate via
 * this helper. Reading the raw stored config yields an empty url/key for
 * account-backed datasources, and the supabase runner then fails at request
 * time with `Invalid URL string` (it does not validate at construction).
 */
import { enrichProviderConfig } from '../connect-enrichment.js';
import type { CompatFetch } from '../external-http.js';

export type AccountConfigFor = (
    tenant: string,
    accountId: string,
) => Promise<Record<string, unknown> | null>;

/**
 * Merge a connected account's stored config into a datasource config when the
 * datasource references one via `provider_account_id`, then lazily enrich.
 * The per-kind transform (service_role_key→serviceKey, etc.) is applied inside
 * datasourceRunner. Framework port of get_datasource_credentials hydration.
 *
 * Lazy enrichment: accounts created before the connect-time enrichers shipped
 * (or whose provider has since rotated keys) may lack the resolved secret
 * (e.g. Supabase service_role_key). When the merged config carries the
 * enrichment inputs (access_token + project_ref) but not the secret, the
 * kind's enricher fetches it on demand — best-effort, idempotent (enrichers
 * skip when the secret is already present). This makes pre-existing accounts
 * resolve without a re-connect.
 */
export async function mergeAccountConfig(
    accountConfigFor: AccountConfigFor | undefined,
    externalFetch: CompatFetch,
    tenant: string,
    kind: string,
    config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const accountId = String(config?.provider_account_id ?? '');
    let merged = config;
    if (accountId && accountConfigFor) {
        const accountConfig = await accountConfigFor(tenant, accountId).catch(() => null);
        if (accountConfig) merged = { ...accountConfig, ...config };
    }
    // Lazy enrich (idempotent — no-op when the secret is already present).
    merged = await enrichProviderConfig(kind, merged, externalFetch).catch(() => merged);
    return merged;
}
