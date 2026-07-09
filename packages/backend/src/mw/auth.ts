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

/** Build the default-deny guard from a resolvePrincipal. */
export function defaultDenyAuth(resolvePrincipal: (req: Request) => Promise<Principal>): MiddlewareHandler<{ Variables: ConsoleAuthVars }> {
    return async (c, next) => {
        let principal: Principal;
        try {
            principal = await resolvePrincipal(c.req.raw);
        } catch {
            // RULE 4: never reveal why auth failed.
            return c.json({ error: 'authentication_required' }, 401);
        }
        if (!principal.user) {
            return c.json({ error: 'authentication_required' }, 401);
        }
        if (!principal.tenant) {
            return c.json({ error: 'tenant_required' }, 401);
        }
        c.set('principal', principal);
        c.set('tenant', principal.tenant);
        await next();
    };
}
