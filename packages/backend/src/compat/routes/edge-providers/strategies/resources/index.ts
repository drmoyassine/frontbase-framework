/**
 * Provider Resource Strategy Registry + Dispatchers
 *
 * Parallel to the test-strategy registry, this maps provider → resource
 * strategy (discover / createResource / listEngines). Providers that don't
 * support an op simply omit the method; the dispatcher returns a
 * product-faithful {success:false, detail} so the SPA falls through
 * gracefully (it reads data.detail on failure).
 *
 * `credentials` passed in are ALREADY DECRYPTED by the route handler.
 * All HTTP goes through guardedExternalFetch (https-only, no redirects,
 * private-IP blocked) — fine for Tier 1's fixed API hostnames.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    CreateResourceResult,
    ListEnginesResult,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';

import { createCloudflareResourceStrategy } from './cloudflare.js';
import { createUpstashResourceStrategy } from './upstash.js';
import { createTursoResourceStrategy } from './turso.js';
import { createNeonResourceStrategy } from './neon.js';
import { createSupabaseResourceStrategy } from './supabase.js';
import { createVercelResourceStrategy } from './vercel.js';
import { createDenoResourceStrategy } from './deno.js';
import { createNetlifyResourceStrategy } from './netlify.js';
import {
    createWordpressResourceStrategy,
    createWordpressRestResourceStrategy,
    createWordpressGraphqlResourceStrategy,
} from './wordpress.js';
import { createWordpressPluginResourceStrategy } from './wordpress_plugin.js';
import { createGoogleSheetsResourceStrategy } from './google_sheets.js';

const resourceStrategies = new Map<string, ProviderResourceStrategy>();

/** Populate the registry. Called once during route registration. */
export function initResourceStrategies(externalFetch: CompatFetch): void {
    resourceStrategies.clear();
    const factories: Array<(f: CompatFetch) => ProviderResourceStrategy> = [
        createCloudflareResourceStrategy,
        createUpstashResourceStrategy,
        createTursoResourceStrategy,
        createNeonResourceStrategy,
        createSupabaseResourceStrategy,
        createVercelResourceStrategy,
        createDenoResourceStrategy,
        createNetlifyResourceStrategy,
        // Tier 2 (tenant-controlled URLs; opts into per-hop-revalidated redirect following)
        createWordpressResourceStrategy,
        createWordpressRestResourceStrategy,
        createWordpressGraphqlResourceStrategy,
        createWordpressPluginResourceStrategy,
        createGoogleSheetsResourceStrategy,
    ];
    for (const factory of factories) {
        const strategy = factory(externalFetch);
        resourceStrategies.set(strategy.provider, strategy);
    }
}

/** List providers with resource support (diagnostics). */
export function listResourceProviders(): string[] {
    return Array.from(resourceStrategies.keys());
}

export async function discoverResources(
    provider: string,
    credentials: Record<string, unknown>,
): Promise<DiscoveryResult> {
    const strategy = resourceStrategies.get(provider);
    if (!strategy?.discover) {
        return { success: false, detail: `Discovery not supported for provider: ${provider}` };
    }
    return strategy.discover(credentials);
}

export async function createProviderResource(
    provider: string,
    credentials: Record<string, unknown>,
    resourceType: string,
    name: string,
    region?: string,
): Promise<CreateResourceResult> {
    const strategy = resourceStrategies.get(provider);
    if (!strategy?.createResource) {
        return {
            success: false,
            detail: `Resource creation not supported for ${provider}/${resourceType}`,
        };
    }
    return strategy.createResource(credentials, resourceType, name, region);
}

export async function listEnginesForProvider(
    provider: string,
    credentials: Record<string, unknown>,
): Promise<ListEnginesResult> {
    const strategy = resourceStrategies.get(provider);
    if (!strategy?.listEngines) {
        return { success: false, detail: `Engine listing not supported for ${provider}`, engines: [] };
    }
    return strategy.listEngines(credentials);
}
