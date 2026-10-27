/**
 * WordPress resource strategy (shared by wordpress, wordpress_rest, wordpress_graphql).
 *
 * Authenticates via Basic (username:app_password) against the standard wp/v2
 * endpoint and returns a synthetic site resource. Real WP sites redirect
 * frequently (www↔apex, trailing slash, http→https), so this opts into
 * guardedExternalFetch's redirect following — every hop is re-validated against
 * the SSRF guard, so a public site URL can't redirect to a private IP.
 *
 * Ported from the product reference (provider_discovery.py :: _discover_wordpress).
 * Field names match exactly. app_password is NEVER echoed back (secret).
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    DiscoveredResource,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

const BROWSER_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
};

async function discoverWordpress(
    externalFetch: CompatFetch,
    credentials: Record<string, unknown>,
): Promise<DiscoveryResult> {
    const baseUrl = String(credentials.api_url ?? credentials.base_url ?? '').replace(/\/+$/, '');
    const username = String(credentials.username ?? '');
    const appPassword = String(credentials.app_password ?? '');
    if (!baseUrl) return { success: false, detail: 'Site URL is required' };

    const headers: Record<string, string> = {
        ...BROWSER_HEADERS,
        Authorization: `Basic ${btoa(`${username}:${appPassword}`)}`,
    };

    try {
        const resp = await guardedExternalFetch(externalFetch, `${baseUrl}/wp-json/wp/v2/users/me`, {
            headers,
        }, { followRedirects: true });
        if (resp.status === 401) return { success: false, detail: 'Invalid WordPress credentials' };
        if (!resp.ok) return { success: false, detail: `WordPress API error: ${resp.status}` };
        const data = await resp.json() as { name?: unknown };
        const siteName = String(data.name ?? 'WordPress User');
        const resource: DiscoveredResource = {
            id: 'site',
            name: `${siteName} — ${baseUrl}`,
            type: 'wordpress_site',
            api_url: baseUrl,
            base_url: baseUrl, // legacy alias for REST accounts
            username,
        };
        return { success: true, resources: [resource] };
    } catch (error) {
        return { success: false, detail: `Error reaching WordPress: ${(error as Error).message}` };
    }
}

export function createWordpressResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'wordpress',
        async discover(credentials) {
            return discoverWordpress(externalFetch, credentials);
        },
    };
}

export function createWordpressRestResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'wordpress_rest',
        async discover(credentials) {
            return discoverWordpress(externalFetch, credentials);
        },
    };
}

export function createWordpressGraphqlResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'wordpress_graphql',
        async discover(credentials) {
            return discoverWordpress(externalFetch, credentials);
        },
    };
}
