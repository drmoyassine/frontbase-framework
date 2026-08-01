/**
 * Provider Test Strategy Interface
 *
 * Defines the contract for provider credential testing strategies.
 * Each provider implements a strategy that knows how to test credentials
 * for its specific auth pattern and API endpoint.
 */

/**
 * Test result with optional discovery payloads.
 *
 * The base {success, detail} is the universal contract the SPA binds to
 * (the badge text). The optional discovery fields let providers surface
 * account resources during the connect flow so the SPA can prompt the
 * user to pick one (e.g. a Supabase project, a Neon org/project).
 */
export interface ProviderTestResult {
    success: boolean;
    detail: string;
    // Discovery payloads (provider-specific)
    projects?: Array<{ ref: string; name: string; region: string; status: string }>;
    neon_orgs?: Array<{ id: string; name: string }>;
    neon_projects?: Array<{ id: string; name: string; region: string }>;
    db_name?: string;
}

export interface ProviderTestStrategy {
    /**
     * Provider identifier (e.g., 'cloudflare', 'supabase', 'upstash')
     */
    readonly provider: string;

    /**
     * Test provider credentials by making an authenticated API request.
     *
     * @param credentials - Provider credential fields (snake_case from SPA)
     * @returns Test result with success flag, user-facing detail, and optional discovery
     */
    test(credentials: Record<string, unknown>): Promise<ProviderTestResult>;
}
