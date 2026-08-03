/**
 * Credential resolver — the framework port of the product's
 * credential_resolver.get_datasource_credentials + per-adapter hydration.
 *
 * PURE transform: takes a stored datasource config (already merged with the
 * connected-account config by the caller) and returns the runner-shaped config
 * for `datasourceRunner(kind, …)`. Centralizes the per-kind field mapping so the
 * ~20 datasourceRunner call sites in sync.ts need NO per-provider branching.
 *
 * The connected-account merge (reading EdgeProviderAccount by provider_account_id)
 * happens in the sync.ts call-site helper, NOT here (it needs DB access).
 */
import { RESOLVERS } from './providers/index.js';

/** Resolve a datasource config into the runner-specific shape. PURE. */
export function resolveDatasourceConfig(
    kind: string,
    config: Record<string, unknown>,
): Record<string, unknown> {
    const resolve = RESOLVERS[kind];
    return resolve ? resolve(config) : config;
}
