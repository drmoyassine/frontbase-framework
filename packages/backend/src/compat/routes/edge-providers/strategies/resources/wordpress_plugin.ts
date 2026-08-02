/**
 * WordPress Plugin resource strategy.
 *
 * Checks /wp-json/frontbase/v1/info (no auth) then /wp-json/frontbase/v1/discover
 * (Basic auth). Opts into redirect following (WP sites redirect). Ported from
 * provider_discovery.py :: _discover_wordpress_plugin.
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

export function createWordpressPluginResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'wordpress_plugin',
        async discover(credentials) {
            const baseUrl = String(credentials.api_url ?? credentials.base_url ?? '').replace(/\/+$/, '');
            const username = String(credentials.username ?? '');
            const appPassword = String(credentials.app_password ?? '');
            if (!baseUrl) return { success: false, detail: 'Site URL is required' };
            if (!username || !appPassword) {
                return { success: false, detail: 'Username and Application Password are required' };
            }

            try {
                // 1. Plugin installed? (no auth)
                const infoResp = await guardedExternalFetch(externalFetch, `${baseUrl}/wp-json/frontbase/v1/info`, {
                    headers: { ...BROWSER_HEADERS },
                }, { followRedirects: true });
                if (infoResp.status === 404) {
                    return {
                        success: false,
                        detail: `Plugin endpoint not found (404). Is the plugin installed and activated? Tried: ${baseUrl}/wp-json/frontbase/v1/info`,
                    };
                }
                if (!infoResp.ok) {
                    return { success: false, detail: `Plugin returned ${infoResp.status}` };
                }
                const info = await infoResp.json() as { version?: unknown };
                const pluginVersion = String(info.version ?? 'unknown');

                // 2. Verify auth via the discover endpoint
                const discoverResp = await guardedExternalFetch(externalFetch, `${baseUrl}/wp-json/frontbase/v1/discover`, {
                    headers: { ...BROWSER_HEADERS, Authorization: `Basic ${btoa(`${username}:${appPassword}`)}` },
                }, { followRedirects: true });
                if (discoverResp.status === 401) {
                    return { success: false, detail: 'Invalid credentials — check your username and Application Password' };
                }
                if (!discoverResp.ok) {
                    return { success: false, detail: `Discovery endpoint error: ${discoverResp.status}` };
                }
                const data = await discoverResp.json() as { site_name?: unknown };
                const siteName = String(data.site_name ?? 'WordPress site');
                const resource: DiscoveredResource = {
                    id: 'site',
                    name: `${siteName} (v${pluginVersion}) — ${baseUrl}`,
                    type: 'wordpress_site',
                    api_url: baseUrl,
                    base_url: baseUrl,
                    username,
                };
                return { success: true, resources: [resource] };
            } catch (error) {
                return { success: false, detail: `Error reaching WordPress: ${(error as Error).message}` };
            }
        },
    };
}
