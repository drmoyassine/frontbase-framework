/**
 * IAuthProvider — Auth Provider Interface
 * 
 * Adapter pattern for pluggable auth providers (Supabase, Clerk, Auth0, etc.).
 * Same design as IStateProvider (storage) and ICacheProvider (cache).
 * 
 * Each provider implements:
 * - getUserFromRequest: Verify session → return user or null
 * - refreshSession: Refresh expired tokens → return Set-Cookie headers
 * 
 * The shared Hono middleware calls these methods — provider-agnostic.
 */

// =============================================================================
// Types
// =============================================================================

export interface UserContext {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    phone?: string;
    company?: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface SessionRefreshResult {
    /** Verified user, or null if no valid session */
    user: UserContext | null;
    /** Set-Cookie headers to apply to the response (for token refresh) */
    setCookieHeaders: string[];
    /** Access token for client-side use (e.g., Realtime subscriptions) */
    accessToken?: string;
}

// =============================================================================
// Interface
// =============================================================================

export interface IAuthProvider {
    /**
     * Verify session from request cookies/headers and return user context.
     * Must validate the token server-side (not just decode it).
     */
    getUserFromRequest(request: Request): Promise<UserContext | null>;

    /**
     * Refresh expired tokens and return updated cookies.
     * Called by middleware on every page navigation.
     * Returns the current user (if any) + any Set-Cookie headers for the response.
     */
    refreshSession(request: Request): Promise<SessionRefreshResult>;
}
