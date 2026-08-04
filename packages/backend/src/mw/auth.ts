/**
 * Default-DENY auth middleware (RULE 2). Runs resolvePrincipal and REJECTS any
 * request without an authenticated principal, then attaches {user, tenant} to
 * the Hono context. Applied to the WHOLE console router — a new route can't
 * forget the guard. Routes needing a specific role declare it; the default is
 * authenticated + tenant-scoped.
 */
import type { MiddlewareHandler } from 'hono';
import type { Principal } from '@frontbase/edge-core';

export interface ConsoleAuthVars { principal: Principal; tenant: string; }

/**
 * Reject a JWT issued before the user's latest credential reset. Tokens created
 * before session_version existed are generation 0 and remain backward-compatible
 * until the first reset advances the stored generation.
 */
export function withSessionVersion(
    resolvePrincipal: (req: Request) => Promise<Principal>,
    currentVersion: (tenant: string, userId: string) => Promise<number>,
): (req: Request) => Promise<Principal> {
    return async (req) => {
        const principal = await resolvePrincipal(req);
        const user = principal.user as { id?: string; sub?: string; session_version?: number } | null;
        const userId = user?.id ?? user?.sub;
        if (!userId || !principal.tenant) return principal;
        const stored = await currentVersion(principal.tenant, userId);
        const claimed = Number(user?.session_version ?? 0);
        return stored === claimed ? principal : { user: null, tenant: undefined };
    };
}

/** Build the default-deny guard from a resolvePrincipal. */
export function defaultDenyAuth(resolvePrincipal: (req: Request) => Promise<Principal>): MiddlewareHandler<{ Variables: ConsoleAuthVars }> {
    return async (c, next) => {
        let principal: Principal;
        try {
            principal = await resolvePrincipal(c.req.raw);
        } catch {
            // RULE 4: never reveal why auth failed. Match product format for parity.
            return c.json({ detail: 'Authentication required' }, 401);
        }
        if (!principal.user) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        if (!principal.tenant) {
            return c.json({ detail: 'Authentication required' }, 401);
        }
        c.set('principal', principal);
        c.set('tenant', principal.tenant);
        await next();
    };
}
