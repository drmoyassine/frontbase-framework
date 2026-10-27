/**
 * Custom Provider Test Strategies
 *
 * Providers whose auth/endpoint patterns don't fit the Bearer or Basic mold:
 *  - ollama: no auth, dynamic endpoint from credentials.base_url
 *  - wordpress_rest: HTTP Basic (username:app_password), dynamic api_url
 *  - postgres/mysql: unclosable (raw TCP wire protocol) — documented limitation
 *  - google_sheets: OAuth flow, not a credential test — Wave 4 territory
 */
import type { ProviderTestStrategy, ProviderTestResult } from './types.js';
import type { CompatFetch } from '../../../external-http.js';
import { guardedExternalFetch } from '../../../external-http.js';

/**
 * Ollama — local LLM server, no auth. Endpoint is dynamic: {base_url}/api/tags.
 */
export class OllamaStrategy implements ProviderTestStrategy {
    readonly provider = 'ollama';
    readonly #externalFetch: CompatFetch;

    constructor(externalFetch: CompatFetch) {
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<ProviderTestResult> {
        const baseUrl = String(credentials.base_url ?? 'http://localhost:11434').replace(/\/+$/, '');
        try {
            const response = await guardedExternalFetch(this.#externalFetch, `${baseUrl}/api/tags`, {});
            return {
                success: response.ok,
                detail: response.ok ? 'Connection verified' : `Provider returned ${response.status}`,
            };
        } catch (error) {
            return { success: false, detail: `Provider connection failed: ${(error as Error).message}` };
        }
    }
}

/**
 * WordPress REST — HTTP Basic with username:app_password, dynamic api_url.
 */
export class WpRestStrategy implements ProviderTestStrategy {
    readonly provider = 'wordpress_rest';
    readonly #externalFetch: CompatFetch;

    constructor(externalFetch: CompatFetch) {
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<ProviderTestResult> {
        const apiUrl = String(credentials.api_url ?? '').replace(/\/+$/, '');
        const username = String(credentials.username ?? '');
        const appPassword = String(credentials.app_password ?? '');
        if (!apiUrl || !username || !appPassword) {
            return { success: false, detail: 'No credentials stored for this provider' };
        }
        try {
            const response = await guardedExternalFetch(this.#externalFetch, `${apiUrl}/wp-json/wp/v2/users/me`, {
                headers: { Authorization: `Basic ${btoa(`${username}:${appPassword}`)}` },
            });
            return {
                success: response.ok,
                detail: response.ok ? 'Connection verified' : `Provider returned ${response.status}`,
            };
        } catch (error) {
            return { success: false, detail: `Provider connection failed: ${(error as Error).message}` };
        }
    }
}

/**
 * Unsupported strategy — returns a clear "Unsupported" message.
 * Used for unclosable providers (postgres/mysql raw TCP) and OAuth providers
 * (google_sheets) that don't support a credential test.
 */
export class UnsupportedStrategy implements ProviderTestStrategy {
    readonly provider: string;
    readonly #detail: string;

    constructor(provider: string, detail?: string) {
        this.provider = provider;
        this.#detail = detail ?? `Unsupported provider: ${provider}`;
    }

    async test(): Promise<ProviderTestResult> {
        return { success: false, detail: this.#detail };
    }
}

/**
 * Registry of custom providers.
 */
export const customStrategyRegistry = new Map<string, ProviderTestStrategy>();

/**
 * Initialize custom strategy registry.
 */
export function initCustomStrategies(externalFetch: CompatFetch): void {
    // Real implementations
    customStrategyRegistry.set('ollama', new OllamaStrategy(externalFetch));
    customStrategyRegistry.set('wordpress_rest', new WpRestStrategy(externalFetch));

    // Google Sheets connects via OAuth, not a credential test.
    customStrategyRegistry.set('google_sheets', new UnsupportedStrategy(
        'google_sheets',
        'Google Sheets connects via OAuth — use the Connect button in the Datasources screen',
    ));

    // Generic database providers require raw TCP (wire protocol) — unclosable in a
    // fetch-only worker. See community-worker-unclosable-parity.md.
    const tcpHint = 'Generic postgres requires a TCP connection — use Supabase or Neon for HTTP-based postgres';
    const mysqlHint = 'Generic mysql requires a TCP connection — use a hosted provider for HTTP access';
    customStrategyRegistry.set('postgres', new UnsupportedStrategy('postgres', tcpHint));
    customStrategyRegistry.set('mysql', new UnsupportedStrategy('mysql', mysqlHint));
}
