/**
 * HTTP Basic Provider Test Strategy
 *
 * Handles providers that authenticate via HTTP Basic authentication (username:password).
 * Upstash is the primary example - it uses email:api_token encoded in Basic auth.
 */
import type { ProviderTestStrategy } from './types.js';
import type { CompatFetch } from '../../../external-http.js';

interface BasicConfig {
    readonly endpoint: string;
    readonly tokenKey: string;
    readonly usernameKey: string;
}

export class BasicAuthStrategy implements ProviderTestStrategy {
    readonly provider: string;
    readonly #endpoint: string;
    readonly #tokenKey: string;
    readonly #usernameKey: string;
    readonly #externalFetch: CompatFetch;

    constructor(provider: string, config: BasicConfig, externalFetch: CompatFetch) {
        this.provider = provider;
        this.#endpoint = config.endpoint;
        this.#tokenKey = config.tokenKey;
        this.#usernameKey = config.usernameKey;
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<{success: boolean; detail: string}> {
        const token = credentials[this.#tokenKey];
        const username = credentials[this.#usernameKey];

        if (!token || !username) {
            return { success: false, detail: 'No credentials stored for this provider' };
        }

        try {
            // Import guardedExternalFetch dynamically to avoid circular dependency
            const { guardedExternalFetch } = await import('../../../external-http.js');
            const response = await guardedExternalFetch(this.#externalFetch, this.#endpoint, {
                headers: {
                    Authorization: `Basic ${btoa(`${String(username)}:${String(token)}`)}`,
                },
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
 * Registry of HTTP Basic providers.
 * Key is provider identifier, value is the strategy instance.
 */
export const basicStrategyRegistry = new Map<string, BasicAuthStrategy>();

/**
 * Initialize HTTP Basic strategies with provider configurations.
 *
 * This function must be called with the externalFetch implementation during
 * route registration. It populates the basicStrategyRegistry with all
 * Basic-auth providers.
 */
export function initBasicStrategies(externalFetch: CompatFetch): void {
    const providers: Array<[string, BasicConfig]> = [
        ['upstash', {
            endpoint: 'https://api.upstash.com/v2/redis/databases',
            tokenKey: 'api_token',
            usernameKey: 'email',
        }],
    ];

    for (const [provider, config] of providers) {
        basicStrategyRegistry.set(provider, new BasicAuthStrategy(provider, config, externalFetch));
    }
}
