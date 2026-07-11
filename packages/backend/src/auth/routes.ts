/**
 * Auth routes (M-ID.1.5, D7) — login / logout (mount BEFORE default-deny) + me
 * (mount AFTER — needs the resolved principal). D8: no endpoint returns password_hash.
 * login/logout/me live under /api/console (the console mount point).
 */
import { Hono } from 'hono';
import type { UserStore } from '../db/users.js';
import { verifyPassword, issueSession } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../mw/auth.js';

const COOKIE = 'fb_session';
const MAX_AGE = 604800; // 7 days

export interface AuthRouteDeps {
    /** Build a UserStore for a tenant (login uses '_default'). */
    userStoreFor: (tenant: string) => UserStore;
    sessionSecret: string;
}

/** login + logout — mounted BEFORE default-deny. */
export function authRoutes(deps: AuthRouteDeps): Hono {
    const app = new Hono();

    app.post('/login', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string };
        // RULE 4: identical response for unknown email vs wrong password.
        const store = deps.userStoreFor('_default');
        const user = body.email ? await store.findByEmailForVerify(body.email) : null;
        const ok = user && body.password ? await verifyPassword(body.password, user.passwordHash) : false;
        if (!user || !ok) return c.json({ error: 'invalid_credentials' }, 401);

        const token = await issueSession(
            { sub: user.id, email: user.email, role: user.role, tenant_slug: user.tenantSlug },
            deps.sessionSecret,
            Math.floor(Date.now() / 1000),
        );
        c.header('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
        return c.json({ user: { id: user.id, email: user.email, role: user.role } }); // D8: no hash
    });

    app.post('/logout', (c) => {
        c.header('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
        return c.json({ ok: true });
    });

    return app;
}

/** /me — mounted AFTER default-deny (principal already resolved). D8: no hash. */
export function meRoute(): Hono<{ Variables: ConsoleAuthVars }> {
    return new Hono<{ Variables: ConsoleAuthVars }>().get('/me', (c) => {
        const p = c.get('principal');
        const u = p.user as { id: string; email?: string; role?: string } | null;
        return c.json({ user: u ? { id: u.id, email: u.email, role: u.role } : null });
    });
}
