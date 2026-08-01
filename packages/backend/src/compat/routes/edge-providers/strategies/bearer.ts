/**
 * Bearer Token Provider Test Strategy
 *
 * Handles providers that authenticate via Bearer tokens in the Authorization header.
 * Most edge providers use this pattern: cloudflare, supabase, vercel, netlify, deno, neon.
 */
import type { ProviderTestStrategy } from './types.js';
import type { CompatFetch } from '../../../external-http.js';

interface BearerConfig {
    readonly endpoint: string;
    readonly tokenKeys: readonly string[];
}

export class BearerTokenStrategy implements ProviderTestStrategy {
    readonly provider: string;
    readonly #endpoint: string;
    readonly #tokenKeys: readonly string[];
    readonly #externalFetch: CompatFetch;

    constructor(provider: string, config: BearerConfig, externalFetch: CompatFetch) {
        this.provider = provider;
        this.#endpoint = config.endpoint;
        this.#tokenKeys = config.tokenKeys;
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<{success: boolean; detail: string}> {
        // Extract token using fallback chain - the SPA sends snake_case keys
        // (api_token, access_token, api_key) but we accept camelCase variants too.
        const token = String(
            credentials.api_token ?? credentials.access_token ?? credentials.api_key ??
            credentials.token ?? credentials.accessToken ?? credentials.apiToken ??
            credentials.personal_token ?? '',
        );

        if (!token) {
            return { success: false, detail: 'No credentials stored for this provider' };
        }

        try {
            // Import guardedExternalFetch dynamically to avoid circular dependency
            const { guardedExternalFetch } = await import('../../../external-http.js');
            const response = await guardedExternalFetch(this.#externalFetch, this.#endpoint, {
                headers: { Authorization: `Bearer ${token}` },
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
 * Registry of Bearer token providers.
 * Key is provider identifier, value is the strategy instance.
 */
export const bearerStrategyRegistry = new Map<string, BearerTokenStrategy>();

/**
 * Initialize Bearer token strategies with provider configurations.
 *
 * This function must be called with the externalFetch implementation during
 * route registration. It populates the bearerStrategyRegistry with all
 * Bearer-auth providers.
 */
export function initBearerStrategies(externalFetch: CompatFetch): void {
    const providers: Array<[string, BearerConfig]> = [
        ['cloudflare', {
            endpoint: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
            tokenKeys: ['api_token', 'token', 'accessToken', 'apiToken'],
        }],
        ['supabase', {
            endpoint: 'https://api.supabase.com/v1/projects',
            tokenKeys: ['access_token', 'token', 'accessToken'],
        }],
        ['vercel', {
            endpoint: 'https://api.vercel.com/v2/user',
            tokenKeys: ['api_token', 'token', 'accessToken', 'apiToken'],
        }],
        ['netlify', {
            endpoint: 'https://api.netlify.com/api/v1/user',
            tokenKeys: ['api_token', 'token', 'accessToken', 'apiToken'],
        }],
        ['deno', {
            endpoint: 'https://api.deno.com/v1/organizations',
            tokenKeys: ['access_token', 'personal_token', 'token', 'accessToken'],
        }],
        ['neon', {
            endpoint: 'https://console.neon.tech/api/v2/projects',
            tokenKeys: ['api_key', 'token', 'apiKey'],
        }],
    ];

    for (const [provider, config] of providers) {
        bearerStrategyRegistry.set(provider, new BearerTokenStrategy(provider, config, externalFetch));
    }
}
