/**
 * Provider Test Strategy Interface
 *
 * Defines the contract for provider credential testing strategies.
 * Each provider implements a strategy that knows how to test credentials
 * for its specific auth pattern and API endpoint.
 */
export interface ProviderTestStrategy {
    /**
     * Provider identifier (e.g., 'cloudflare', 'supabase', 'upstash')
     */
    readonly provider: string;

    /**
     * Test provider credentials by making an authenticated API request.
     *
     * @param credentials - Provider credential fields (snake_case from SPA)
     * @returns Test result with success flag and user-facing detail message
     */
    test(credentials: Record<string, unknown>): Promise<{success: boolean; detail: string}>;
}
