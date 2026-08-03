/**
 * Bearer Token Provider Test Strategy
 *
 * Handles providers that authenticate via Bearer tokens (or x-api-key for Anthropic).
 * Most edge providers use this pattern. Supports:
 *  - Custom headers (e.g. Anthropic's x-api-key + anthropic-version)
 *  - Discovery parsers (e.g. Supabase projects, Neon orgs/projects, Turso db_name)
 */
import type { ProviderTestStrategy, ProviderTestResult } from './types.js';
import type { CompatFetch } from '../../../external-http.js';
import { guardedExternalFetch } from '../../../external-http.js';

interface BearerConfig {
    readonly endpoint: string;
    readonly tokenKeys: readonly string[];
    /** Extra headers to send (e.g. Anthropic's anthropic-version). Auth header added separately. */
    readonly extraHeaders?: Record<string, string>;
    /** Auth scheme: 'bearer' (default) or 'x-api-key' (Anthropic). */
    readonly authScheme?: 'bearer' | 'x-api-key';
    /** Optional discovery parser — reads the response JSON and returns discovery fields. */
    readonly parseDiscovery?: (json: unknown) => Partial<ProviderTestResult>;
}

export class BearerTokenStrategy implements ProviderTestStrategy {
    readonly provider: string;
    readonly #endpoint: string;
    readonly #tokenKeys: readonly string[];
    readonly #extraHeaders: Record<string, string>;
    readonly #authScheme: 'bearer' | 'x-api-key';
    readonly #parseDiscovery?: (json: unknown) => Partial<ProviderTestResult>;
    readonly #externalFetch: CompatFetch;

    constructor(provider: string, config: BearerConfig, externalFetch: CompatFetch) {
        this.provider = provider;
        this.#endpoint = config.endpoint;
        this.#tokenKeys = config.tokenKeys;
        this.#extraHeaders = config.extraHeaders ?? {};
        this.#authScheme = config.authScheme ?? 'bearer';
        this.#parseDiscovery = config.parseDiscovery;
        this.#externalFetch = externalFetch;
    }

    async test(credentials: Record<string, unknown>): Promise<ProviderTestResult> {
        // Extract token using fallback chain - the SPA sends snake_case keys
        // (api_token, access_token, api_key) but we accept camelCase variants too.
        let token = '';
        for (const key of this.#tokenKeys) {
            const v = credentials[key];
            if (typeof v === 'string' && v) { token = v; break; }
            if (v !== undefined && v !== null && String(v)) { token = String(v); break; }
        }

        if (!token) {
            return { success: false, detail: 'No credentials stored for this provider' };
        }

        const headers: Record<string, string> = { ...this.#extraHeaders };
        if (this.#authScheme === 'x-api-key') {
            headers['x-api-key'] = token;
        } else {
            headers.Authorization = `Bearer ${token}`;
        }

        try {
            const response = await guardedExternalFetch(this.#externalFetch, this.#endpoint, { headers });

            if (!response.ok) {
                return { success: false, detail: `Provider returned ${response.status}` };
            }

            const base: ProviderTestResult = { success: true, detail: 'Connection verified' };

            // Parse discovery payloads when the provider supports them
            if (this.#parseDiscovery) {
                try {
                    const json = await response.json();
                    return { ...base, ...this.#parseDiscovery(json) };
                } catch {
                    // JSON parse failed — still a successful connection, just no discovery
                    return base;
                }
            }
            return base;
        } catch (error) {
            return { success: false, detail: `Provider connection failed: ${(error as Error).message}` };
        }
    }
}

// ---------------------------------------------------------------------------
// Discovery parsers
// ---------------------------------------------------------------------------

/**
 * Supabase: surface the project list so the SPA can prompt for a project.
 *
 * The Supabase Management API `GET /v1/projects` returns a BARE JSON array,
 * not `{projects: [...]}`. Accept both shapes for robustness (the bare-array
 * form is what the live API returns; the wrapped form is defensive).
 */
function parseSupabaseDiscovery(json: unknown): Partial<ProviderTestResult> {
    const arr = Array.isArray(json)
        ? json
        : (json as { projects?: unknown[] })?.projects;
    if (!Array.isArray(arr)) return {};
    return {
        projects: arr.map((p) => {
            const row = p as Record<string, unknown>;
            return {
                ref: String(row.id ?? row.ref ?? ''),
                name: String(row.name ?? ''),
                region: String(row.region ?? ''),
                status: String(row.status ?? ''),
            };
        }),
    };
}

/** Neon: surface orgs and projects (projects discovered across all orgs). */
function parseNeonDiscovery(json: unknown): Partial<ProviderTestResult> {
    const arr = (json as { projects?: unknown[] })?.projects;
    if (!Array.isArray(arr)) return {};
    return {
        neon_projects: arr.map((p) => {
            const row = p as Record<string, unknown>;
            return {
                id: String(row.id ?? ''),
                name: String(row.name ?? ''),
                region: String(row.region_id ?? row.region ?? ''),
            };
        }),
    };
}

/** Turso: surface the first database name for auto-detection. */
function parseTursoDiscovery(json: unknown): Partial<ProviderTestResult> {
    const arr = (json as { databases?: unknown[] })?.databases;
    if (!Array.isArray(arr) || arr.length === 0) return {};
    const first = arr[0] as Record<string, unknown>;
    const name = String(first.Name ?? first.name ?? '');
    return name ? { db_name: name } : {};
}

/**
 * Registry of Bearer token providers.
 */
export const bearerStrategyRegistry = new Map<string, BearerTokenStrategy>();

/**
 * Initialize Bearer token strategies with provider configurations.
 */
export function initBearerStrategies(externalFetch: CompatFetch): void {
    const providers: Array<[string, BearerConfig]> = [
        // --- Wave 0: original 6 Bearer providers ---
        ['cloudflare', {
            endpoint: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
            tokenKeys: ['api_token', 'token', 'accessToken', 'apiToken'],
        }],
        ['supabase', {
            endpoint: 'https://api.supabase.com/v1/projects',
            tokenKeys: ['access_token', 'token', 'accessToken'],
            parseDiscovery: parseSupabaseDiscovery,
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
            parseDiscovery: parseNeonDiscovery,
        }],
        // --- Wave 1: LLM + database providers ---
        ['openai', {
            endpoint: 'https://api.openai.com/v1/models',
            tokenKeys: ['api_key', 'token', 'apiKey'],
        }],
        ['anthropic', {
            endpoint: 'https://api.anthropic.com/v1/models',
            tokenKeys: ['api_key', 'token', 'apiKey'],
            authScheme: 'x-api-key',
            extraHeaders: { 'anthropic-version': '2023-06-01' },
        }],
        ['resend', {
            endpoint: 'https://api.resend.com/domains',
            tokenKeys: ['api_key', 'token', 'apiKey'],
        }],
        ['turso', {
            endpoint: 'https://api.turso.tech/v1/organizations/me/databases',
            tokenKeys: ['db_token', 'token', 'api_token'],
            parseDiscovery: parseTursoDiscovery,
        }],
    ];

    for (const [provider, config] of providers) {
        bearerStrategyRegistry.set(provider, new BearerTokenStrategy(provider, config, externalFetch));
    }
}
