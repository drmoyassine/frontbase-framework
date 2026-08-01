/**
 * Provider Test Strategy Registry and Dispatcher
 *
 * This module provides the strategy pattern implementation for provider credential testing.
 * It maintains a registry of ProviderTestStrategy instances and dispatches test requests
 * to the appropriate strategy based on provider identifier.
 *
 * Architecture:
 * - ProviderTestStrategy interface defines the contract
 * - Auth-family split: bearer.ts, basic.ts, custom.ts
 * - Central registry (STRATEGY_REGISTRY) maps provider → strategy
 * - testProvider() dispatcher looks up strategy by provider and delegates
 *
 * Wave 0 implements 7 providers (6 Bearer + 1 Basic).
 * Wave 1+ will add more providers to their respective auth-family registries.
 */
import type { ProviderTestStrategy } from './types.js';
import type { CompatFetch } from '../../../external-http.js';
import { initBearerStrategies, bearerStrategyRegistry } from './bearer.js';
import { initBasicStrategies, basicStrategyRegistry } from './basic.js';
import { initCustomStrategies, customStrategyRegistry } from './custom.js';

/**
 * Combined registry of all provider test strategies.
 *
 * This map merges all auth-family registries into a single lookup table.
 * Key is provider identifier (e.g., 'cloudflare'), value is the strategy instance.
 */
const STRATEGY_REGISTRY = new Map<string, ProviderTestStrategy>();

/**
 * Initialize all provider test strategies.
 *
 * This function must be called during route registration with the externalFetch
 * implementation. It populates the combined STRATEGY_REGISTRY with all providers.
 *
 * @param externalFetch - The fetch implementation for external HTTP calls
 */
export function initStrategies(externalFetch: CompatFetch): void {
    // Initialize auth-family registries
    initBearerStrategies(externalFetch);
    initBasicStrategies(externalFetch);
    initCustomStrategies();

    // Merge all registries into combined registry
    for (const [provider, strategy] of bearerStrategyRegistry) {
        STRATEGY_REGISTRY.set(provider, strategy);
    }
    for (const [provider, strategy] of basicStrategyRegistry) {
        STRATEGY_REGISTRY.set(provider, strategy);
    }
    for (const [provider, strategy] of customStrategyRegistry) {
        STRATEGY_REGISTRY.set(provider, strategy);
    }
}

/**
 * Test provider credentials using the strategy pattern.
 *
 * This dispatcher looks up the appropriate strategy by provider identifier
 * and delegates the credential test to that strategy.
 *
 * @param provider - Provider identifier (e.g., 'cloudflare', 'supabase')
 * @param credentials - Provider credential fields (snake_case from SPA)
 * @returns Test result with success flag and user-facing detail message
 */
export async function testProvider(
    provider: string,
    credentials: Record<string, unknown>,
): Promise<{success: boolean; detail: string}> {
    const strategy = STRATEGY_REGISTRY.get(provider);

    if (!strategy) {
        return { success: false, detail: `Unsupported provider: ${provider}` };
    }

    return strategy.test(credentials);
}

/**
 * List all supported provider identifiers.
 *
 * Useful for diagnostics and UI generation.
 *
 * @returns Array of provider identifiers that have registered strategies
 */
export function listSupportedProviders(): string[] {
    return Array.from(STRATEGY_REGISTRY.keys());
}

/**
 * Re-export the ProviderTestStrategy interface for external use.
 */
export type { ProviderTestStrategy } from './types.js';
