/**
 * Auth routes (M-ID.1.5, D7) — login / logout (mount BEFORE default-deny) + me
 * (mount AFTER — needs the resolved principal). D8: no endpoint returns password_hash.
 * login/logout/me live under /api/console (the console mount point).
 */
import { Hono } from 'hono';
import type { UserStore } from '../db/users.js';
import { verifyPassword, issueSession } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../mw/auth.js';

const COOKIE = 'frontbase_session';
const MAX_AGE = 604800; // 7 days
// A well-formed PBKDF2 hash of a random value — verified against on unknown-email
// logins so the response time doesn't reveal whether the email exists (MED-5).
// Iters MUST match the live PBKDF2_ITERATIONS (100k) — a higher count here would
// throw NotSupportedError on Workers for every unknown-email login (the cap is 100k).
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export interface AuthRouteDeps {
    /** Build a UserStore for a tenant. Login uses the '_default' store's runner but
     *  looks up the email across ALL tenants (owner/_default, master_admin/_root, tenant_admins). */
    userStoreFor: (tenant: string) => UserStore;
    sessionSecret: string;
}

/** login + logout — mounted BEFORE default-deny. */
export function authRoutes(deps: AuthRouteDeps): Hono {
    const app = new Hono();

    app.post('/login', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string };
        // Login is cross-tenant by nature: a master_admin lives in _root, a
        // tenant_admin in its own tenant, an owner in _default. Look the email up
        // across all tenants (CRIT-1 fix), then verify the password.
        const candidates = body.email ? await deps.userStoreFor('_default').findByEmailAnyTenant(body.email) : [];
        let matched: (typeof candidates)[number] | null = null;
        if (body.password) {
            for (const u of candidates) {
                if (await verifyPassword(body.password, u.passwordHash)) { matched = u; break; }
            }
        }
        // MED-5: always run at least one verify (constant work) so unknown-email and
        // wrong-password take a comparable time — no user enumeration by timing.
        if (candidates.length === 0) { await verifyPassword(body.password ?? '', DUMMY_HASH); }
        // RULE 4: identical response for unknown email vs wrong password.
        if (!matched) return c.json({ error: 'invalid_credentials' }, 401);

        const token = await issueSession(
            {
                sub: matched.id,
                email: matched.email,
                role: matched.role,
                tenant_slug: matched.tenantSlug,
                session_version: await deps.userStoreFor(matched.tenantSlug).getSessionVersion(matched.id),
            },
            deps.sessionSecret,
            Math.floor(Date.now() / 1000),
        );
        c.header('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
        return c.json({ user: { id: matched.id, email: matched.email, role: matched.role } }); // D8: no hash
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
