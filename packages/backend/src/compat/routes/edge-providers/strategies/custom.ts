/**
 * Custom Provider Test Strategy Placeholder
 *
 * This module contains placeholder implementations for providers that either:
 * 1. Require non-fetch-based testing (postgres, mysql - wire protocol)
 * 2. Are not yet implemented (will be filled in by Wave 1+)
 *
 * Wave 1+ will replace these UnsupportedStrategy instances with real implementations.
 */
import type { ProviderTestStrategy } from './types.js';

/**
 * Unsupported strategy - returns "Unsupported provider" error.
 * Used as a placeholder for providers not yet implemented in the community worker.
 */
export class UnsupportedStrategy implements ProviderTestStrategy {
    readonly provider: string;

    constructor(provider: string) {
        this.provider = provider;
    }

    async test(_credentials: Record<string, unknown>): Promise<{success: boolean; detail: string}> {
        return { success: false, detail: `Unsupported provider: ${this.provider}` };
    }
}

/**
 * Registry of custom/unsupported providers.
 *
 * This registry will be populated with real strategies in Wave 1+ as we
 * implement additional providers. For now, it serves as a placeholder
 * to maintain the registry structure.
 */
export const customStrategyRegistry = new Map<string, ProviderTestStrategy>();

/**
 * Initialize custom strategy registry with placeholders.
 *
 * Wave 1 will replace these placeholders with real implementations.
 */
export function initCustomStrategies(): void {
    // Generic database providers (raw TCP wire protocol - unclosable in fetch-only worker)
    // See community-worker-unclosable-parity.md for details
    customStrategyRegistry.set('postgres', new UnsupportedStrategy('postgres'));
    customStrategyRegistry.set('mysql', new UnsupportedStrategy('mysql'));

    // Providers not yet implemented (will be added in Wave 1+)
    customStrategyRegistry.set('google_sheets', new UnsupportedStrategy('google_sheets'));
    customStrategyRegistry.set('wordpress_rest', new UnsupportedStrategy('wordpress_rest'));
}
