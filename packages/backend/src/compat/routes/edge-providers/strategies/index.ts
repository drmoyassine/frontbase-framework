/**
 * Provider Test Strategy Registry and Dispatcher
 *
 * Strategy pattern for provider credential testing. A registry maps provider
 * identifier → strategy; the dispatcher looks up and delegates.
 *
 * Wave 0: 7 providers (6 Bearer + 1 Basic).
 * Wave 1: +6 providers (4 Bearer + 1 Basic + ollama/wordpress_rest custom) with
 *         discovery payloads for supabase/neon/turso.
 */
import type { ProviderTestStrategy, ProviderTestResult } from './types.js';
import type { CompatFetch } from '../../../external-http.js';
import { initBearerStrategies, bearerStrategyRegistry } from './bearer.js';
import { initBasicStrategies, basicStrategyRegistry } from './basic.js';
import { initCustomStrategies, customStrategyRegistry } from './custom.js';

/**
 * Combined registry of all provider test strategies.
 */
const STRATEGY_REGISTRY = new Map<string, ProviderTestStrategy>();

/**
 * Initialize all provider test strategies.
 *
 * Must be called during route registration with the externalFetch implementation.
 */
export function initStrategies(externalFetch: CompatFetch): void {
    initBearerStrategies(externalFetch);
    initBasicStrategies(externalFetch);
    initCustomStrategies(externalFetch);

    STRATEGY_REGISTRY.clear();
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
 */
export async function testProvider(
    provider: string,
    credentials: Record<string, unknown>,
): Promise<ProviderTestResult> {
    const strategy = STRATEGY_REGISTRY.get(provider);
    if (!strategy) {
        return { success: false, detail: `Unsupported provider: ${provider}` };
    }
    return strategy.test(credentials);
}

/**
 * List all supported provider identifiers (for diagnostics).
 */
export function listSupportedProviders(): string[] {
    return Array.from(STRATEGY_REGISTRY.keys());
}

export type { ProviderTestStrategy, ProviderTestResult } from './types.js';
