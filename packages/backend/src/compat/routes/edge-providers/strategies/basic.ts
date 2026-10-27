/**
 * HTTP Basic Provider Test Strategy
 *
 * Handles providers that authenticate via HTTP Basic authentication.
 * - Upstash: email:api_token (both from credentials)
 * - Mailgun: "api":api_key (constant username "api", region-specific host)
 */
import type { ProviderTestStrategy, ProviderTestResult } from './types.js';
import type { CompatFetch } from '../../../external-http.js';
import { guardedExternalFetch } from '../../../external-http.js';

interface BasicConfig {
    readonly endpoint: string;
    readonly tokenKey: string;
    /** Credentials key holding the username. If absent, uses `fixedUsername`. */
    readonly usernameKey?: string;
    /** Fixed username (e.g. Mailgun's "api") when not sourced from credentials. */
    readonly fixedUsername?: string;
    /** Dynamic host builder (e.g. Mailgun's region-specific api.{region}.mailgun.net). */
    readonly buildEndpoint?: (credentials: Record<string, unknown>) => string;
}

export class BasicAuthStrategy implements ProviderTestStrategy {
    readonly provider: string;
    readonly #config: BasicConfig;
    readonly #externalFetch: CompatFetch;

    constructor(provider: string, config: BasicConfig, externalFetch: CompatFetch) {
        this.provider = provider;
        this.#config = config;
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<ProviderTestResult> {
        const token = credentials[this.#config.tokenKey];
        const username = this.#config.fixedUsername
            ?? (this.#config.usernameKey ? credentials[this.#config.usernameKey] : undefined);

        if (!token || !username) {
            return { success: false, detail: 'No credentials stored for this provider' };
        }

        const endpoint = this.#config.buildEndpoint
            ? this.#config.buildEndpoint(credentials)
            : this.#config.endpoint;

        try {
            const response = await guardedExternalFetch(this.#externalFetch, endpoint, {
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
 */
export const basicStrategyRegistry = new Map<string, BasicAuthStrategy>();

/**
 * Initialize HTTP Basic strategies with provider configurations.
 */
export function initBasicStrategies(externalFetch: CompatFetch): void {
    const providers: Array<[string, BasicConfig]> = [
        ['upstash', {
            endpoint: 'https://api.upstash.com/v2/redis/databases',
            tokenKey: 'api_token',
            usernameKey: 'email',
        }],
        // Mailgun authenticates with HTTP Basic using the constant username "api"
        // and the API key as the password. Host is region-specific:
        // api.eu.mailgun.net (EU) or api.mailgun.net (US default).
        ['mailgun', {
            endpoint: 'https://api.mailgun.net/v3/domains',
            tokenKey: 'api_key',
            fixedUsername: 'api',
            buildEndpoint: (creds) => {
                const region = String(creds.region ?? 'us').toLowerCase();
                const host = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
                const domain = String(creds.domain ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                return domain ? `${host}/v3/domains/${domain}` : `${host}/v3/domains`;
            },
        }],
    ];

    for (const [provider, config] of providers) {
        basicStrategyRegistry.set(provider, new BasicAuthStrategy(provider, config, externalFetch));
    }
}
