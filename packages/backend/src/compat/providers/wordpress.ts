/**
 * WordPress provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's connect-time validation (provider_discovery.py:428-560 —
 * validates by hitting {base_url}/wp-json/wp/v2/users/me with Basic Auth, and
 * the plugin variant that first checks /wp-json/frontbase/v1/info) and the
 * adapter credential resolution (wordpress_api_adapter.__init__ lines 36-58 +
 * wordpress_plugin_adapter.__init__) into the framework worker.
 *
 * Three datasource kinds collapse onto this module via the registry
 * (index.ts): wordpress_rest, wordpress_graphql, wordpress_plugin (+ bare
 * wordpress). All three authenticate with Basic Auth (username:app_password)
 * against the same site URL, so they share one resolver + enricher.
 *
 * RUNNER NEEDS: WordPress datasources are served by the bespoke HTTP handlers
 *   in sync.ts (wordpressConfig()), NOT datasourceRunner. That helper reads
 *   `api_url ?? base_url ?? url` and `app_password ?? api_key ?? password`, so
 *   resolveWordPress normalizes onto those canonical keys + ensures api_url
 *   carries a scheme (httpx/the worker fetch reject scheme-less URLs — product
 *   bugs BACKEND-C / BACKEND-E).
 *
 * CONTRACT:
 *   resolveWordPress(config): PURE. { api_url|base_url|url → api_url (scheme
 *     ensured, trailing slashes trimmed; base_url mirrored as legacy alias),
 *     app_password|api_key|password → app_password, username, api_mode? }.
 *   enrichWordPress(config, externalFetch): best-effort validation. Pings
 *     {api_url}/wp-json/wp/v2/users/me with Basic Auth (following redirects —
 *     WP sites commonly 301 to a canonical host); on success merges site_name.
 *     Any fetch/parse failure returns the input config unchanged so connect
 *     still succeeds with the bare credentials (matches _discover_wordpress).
 *
 * Uses guardedExternalFetch (HTTPS-only, SSRF-guarded) for all HTTP.
 */
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import type { DatasourceResolver, ProviderEnricher } from './types.js';

/**
 * Resolve a stored WordPress config into the canonical shape the framework's
 * sync.ts wordpressConfig() helper reads. PURE.
 *
 * Field aliases mirror the product adapters: `api_url` is preferred (GraphQL +
 * plugin accounts), `base_url` is the legacy REST alias, `url` is the generic
 * datasource key. App passwords arrive under `app_password` (Connected
 * Accounts), `api_key` (legacy plugin rows), or `password` (legacy REST rows).
 */
export const resolveWordPress: DatasourceResolver = (config) => {
    const apiUrl = ensureScheme(
        String(config.api_url ?? config.base_url ?? config.url ?? ''),
    ).replace(/\/+$/, '');
    const appPassword = String(
        config.app_password ?? config.api_key ?? config.password ?? '',
    );
    const username = String(config.username ?? '');
    const apiMode = config.api_mode;

    const resolved: Record<string, unknown> = {
        api_url: apiUrl,
        app_password: appPassword,
        username,
    };
    // Mirror base_url for parity with the product's discovery echo (it returns
    // both api_url + base_url so legacy REST consumers keep resolving the host).
    if (apiUrl) resolved.base_url = apiUrl;
    if (apiMode) resolved.api_mode = String(apiMode);
    return resolved;
};

/**
 * Connect-time enrichment. Validates the credentials by pinging the standard
 * WordPress "who am I" endpoint and merges the site name. Best-effort: any
 * fetch/parse failure is swallowed and the original config is returned, so
 * connect still succeeds with the bare credentials (matching the product's
 * _discover_wordpress behavior).
 *
 * WordPress sites frequently 301 to a canonical host (http→https, non-www→www,
 * trailing slash), so redirects are opted into and re-validated hop-by-hop via
 * guardedExternalFetch's followRedirects path.
 */
export const enrichWordPress: ProviderEnricher = async (config, externalFetch) => {
    const apiUrl = ensureScheme(
        String(config.api_url ?? config.base_url ?? config.url ?? ''),
    ).replace(/\/+$/, '');
    const username = String(config.username ?? '');
    const appPassword = String(
        config.app_password ?? config.api_key ?? config.password ?? '',
    );
    // Nothing to validate without a reachable URL + a complete Basic Auth pair.
    if (!apiUrl || !username || !appPassword) return config;

    try {
        const resp = await guardedExternalFetch(
            externalFetch,
            `${apiUrl}/wp-json/wp/v2/users/me`,
            { headers: { Authorization: basicAuthHeader(username, appPassword) } },
            { followRedirects: true },
        );
        // Best-effort: an invalid-creds / error response returns input unchanged
        // (matches _discover_wordpress failing closed without mutating config).
        if (!resp.ok) return config;
        const data = await resp.json() as { name?: unknown; slug?: unknown };
        if (!data || typeof data !== 'object') return config;

        // Success — merge the normalized URL/credentials + the site identity.
        const merged: Record<string, unknown> = {
            ...config,
            api_url: apiUrl,
            base_url: apiUrl,
            username,
            app_password: appPassword,
        };
        if (typeof data.name === 'string' && data.name) {
            merged.site_name = data.name;
        }
        if (typeof data.slug === 'string' && data.slug) {
            merged.wp_user_slug = data.slug;
        }
        return merged;
    } catch {
        // best-effort — swallow (SSRF guard / network / timeout / parse error
        // all return the input config unchanged so connect still succeeds).
        return config;
    }
};

/**
 * Prepend https:// to a bare host. WordPress (httpx in the product, fetch in
 * the worker) rejects URLs without an http(s):// scheme; bare hosts pasted from
 * the browser address bar are common. Mirrors adapter __init__ normalization.
 */
function ensureScheme(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

/**
 * Build a WordPress Basic Auth header from a username + application password.
 *
 * Application passwords issued by WordPress look like `xxxx xxxx xxxx xxxx`
 * (no colon), so the standard form is `username:app_password`. The product
 * adapter (_get_auth_header) additionally tolerates a pasted `user:secret`
 * pair by using the value as-is when it already contains a colon — we mirror
 * that so both storage shapes authenticate.
 */
function basicAuthHeader(username: string, appPassword: string): string {
    const identity = !appPassword.includes(':') && username
        ? `${username}:${appPassword}`
        : appPassword;
    return `Basic ${btoa(identity)}`;
}
