/**
 * Role-based access control (M-ID.2, D4/D10). `canActOnTenant` is the single
 * authorization predicate: master_admin crosses tenants; tenant_admin is confined.
 * `requireRole` is the middleware for master-admin-only routes (provisioning).
 *
 * RULE 8: the cross-tenant isolation gate proves dropping canActOnTenant goes RED.
 */
import type { MiddlewareHandler } from 'hono';
import type { Principal } from '@frontbase/edge-core';
import type { ConsoleAuthVars } from '../mw/auth.js';

/** Can `principal` act on `targetTenant`? master_admin = any; others = own only. */
export function canActOnTenant(principal: Principal, targetTenant: string): boolean {
    const role = (principal.user as { role?: string } | null)?.role;
    if (role === 'master_admin') return true;
    return principal.tenant === targetTenant;
}

/** Middleware: reject if the principal's role isn't one of `roles`. */
export function requireRole(...roles: string[]): MiddlewareHandler<{ Variables: ConsoleAuthVars }> {
    return async (c, next) => {
        const p = c.get('principal');
        const role = (p.user as { role?: string } | null)?.role;
        if (!role || !roles.includes(role)) {
            return c.json({ error: 'forbidden' }, 403);
        }
        await next();
    };
}
