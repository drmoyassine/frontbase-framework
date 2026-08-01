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

// ---------------------------------------------------------------------------
// Resource discovery / creation / engine listing
// ---------------------------------------------------------------------------

/**
 * A discovered provider resource — normalized shape the SPA renders.
 * `id` + `name` + `type` are universal; the rest are provider-specific
 * optional fields the SPA reads to wire up storage forms and dedupe
 * already-imported resources. Field names must match the product exactly
 * (the SPA dedupes on rest_url / endpoint / db_url / hostname / etc.).
 */
export interface DiscoveredResource {
    id: string;
    name: string;
    type: string;
    // Turso / Neon / postgres
    hostname?: string;
    db_url?: string;
    org?: string;
    group?: string;
    regions?: string[];
    token?: string;
    last_tested?: string;
    test_ok?: boolean;
    // Neon / postgres
    region?: string;
    pg_version?: string;
    connection_uri?: string;
    // Upstash Redis
    endpoint?: string;
    rest_url?: string;
    rest_token?: string;
    // QStash
    signing_key?: string;
    next_signing_key?: string;
    // WordPress
    api_url?: string;
    username?: string;
    // Google Sheets
    webAppUrl?: string;
    spreadsheetId?: string;
    // Cloudflare-specific url handles (d1://, kv://, cfq://, r2://)
    [key: string]: unknown;
}

/** A remotely-listed engine/function the SPA can import. `name` is the key. */
export interface EngineInfo {
    name: string;
    url?: string;
    provider?: string;
    deployed_at?: string;
    created_at?: string;
    [key: string]: unknown;
}

export interface DiscoveryResult {
    success: boolean;
    detail?: string;
    resources?: DiscoveredResource[];
}

export interface CreateResourceResult {
    success: boolean;
    detail?: string;
    resource?: DiscoveredResource;
}

export interface ListEnginesResult {
    success: boolean;
    detail?: string;
    engines?: EngineInfo[];
}

/**
 * Resource strategy — optional per-provider capability for listing/provisioning
 * account resources. Providers that don't support an op simply omit the method;
 * the dispatcher returns a product-faithful {success:false, detail} for them.
 *
 * `credentials` are already DECRYPTED by the route handler (via
 * store.getEdgeResourceConfig) — strategies never touch ciphertext.
 */
export interface ProviderResourceStrategy {
    readonly provider: string;
    discover?(credentials: Record<string, unknown>): Promise<DiscoveryResult>;
    createResource?(
        credentials: Record<string, unknown>,
        resourceType: string,
        name: string,
        region?: string,
    ): Promise<CreateResourceResult>;
    listEngines?(credentials: Record<string, unknown>): Promise<ListEnginesResult>;
}
