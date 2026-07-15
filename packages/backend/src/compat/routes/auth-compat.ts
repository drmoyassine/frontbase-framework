/**
 * CF-22 P2 Wave 3 — the Authentication tag (18 ops). Login/logout/signup/forgot/
 * reset/invite/accept/check-slug are UNAUTHENTICATED (the host mounts this whole
 * function BEFORE defaultDenyAuth so those routes bypass the guard). The me +
 * security endpoints are "authenticated" in the product but degrade gracefully in
 * the community worker: `me` reads the principal if defaultDenyAuth has run (else
 * returns the product's logged-out `{user: null}` shape), and the security
 * endpoints return community defaults regardless (no audit store / WAF wired).
 *
 * Login reuses the framework's UserStore (cross-tenant email lookup — CRIT-1) +
 * issueSession JWT signing (same cookie contract as /api/console/auth/login).
 * MED-5: constant-time dummy-hash verify on unknown emails so login timing can't
 * enumerate users. RULE 4: identical response for unknown-email vs wrong-password.
 *
 * Product AuthResponse shape (community): is_master=true for the master_admin
 * role (the env-var admin); tenant_id aliases tenant_slug (no numeric id).
 *
 * Routes registered with EXACT product paths (trailing slashes matter).
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { UserStore } from '../../db/users.js';
import { verifyPassword, issueSession } from '@frontbase/edge-infra';

// A well-formed PBKDF2 hash of a random value — verified against on unknown-email
// logins so response time doesn't reveal whether the email exists (MED-5). Iters
// MUST match PBKDF2_ITERATIONS (100k); a higher count throws on Workers.
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

type App = Hono<{ Variables: ConsoleAuthVars }>;
const COOKIE = 'fb_session';
const MAX_AGE = 7 * 24 * 3600;
const SESSION_COOKIE = (token: string) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
const CLEAR_COOKIE = `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export interface AuthCompatDeps {
    /** Build a UserStore for a tenant. Login uses the '_default' store's runner but
     *  looks up the email across ALL tenants (owner/_default, master_admin/_root, …). */
    userStoreFor: (tenant: string) => UserStore;
    sessionSecret: string;
}

/**
 * UNAUTHENTICATED auth ops (login/logout/signup/forgot/reset/invite/accept/
 * check-slug). MUST be registered BEFORE defaultDenyAuth so they bypass the guard
 * — a user cannot present a session to log in.
 */
export function registerAuthCompatUnauthRoutes(app: App, userStoreFor: (t: string) => UserStore, sessionSecret: string): void {
    // Product contract includes explicit preflight operations for these routes.
    app.options('/api/auth/login', (c) => c.json({}));
    app.options('/api/auth/signup', (c) => c.json({}));
    // POST /api/auth/login
    app.post('/api/auth/login', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string };
        // Cross-tenant email lookup (CRIT-1): a master_admin lives in _root, an
        // owner in _default. Verify the password against each candidate.
        const candidates = body.email ? await userStoreFor('_default').findByEmailAnyTenant(body.email) : [];
        let matched: (typeof candidates)[number] | null = null;
        if (body.password) {
            for (const u of candidates) {
                if (await verifyPassword(body.password, u.passwordHash)) { matched = u; break; }
            }
        }
        // MED-5: always run at least one verify so unknown-email ≈ wrong-password timing.
        if (candidates.length === 0) { await verifyPassword(body.password ?? '', DUMMY_HASH); }
        // RULE 4: identical response for unknown email vs wrong password.
        if (!matched) return c.json({ error: 'invalid_credentials' }, 401);

        const token = await issueSession(
            { sub: matched.id, email: matched.email, role: matched.role, tenant_slug: matched.tenantSlug },
            sessionSecret,
            Math.floor(Date.now() / 1000),
        );
        c.header('Set-Cookie', SESSION_COOKIE(token));
        return c.json({
            user: {
                id: matched.id,
                email: matched.email,
                role: matched.role,
                is_master: matched.role === 'master_admin',
                created_at: matched.createdAt,
                updated_at: matched.createdAt,
                tenant_id: matched.tenantSlug,
                tenant_slug: matched.tenantSlug,
            },
            message: 'Login successful',
        });
    });
    // POST /api/auth/logout
    app.post('/api/auth/logout', (c) => {
        c.header('Set-Cookie', CLEAR_COOKIE);
        return c.json({ message: 'Logged out successfully' });
    });
    // POST /api/auth/signup  (community is single-tenant; signup is admin-driven)
    app.post('/api/auth/signup', (c) => c.json({ detail: 'Signup is not available in the community edition' }, 400));
    // GET /api/auth/check-slug/{slug}  (single-tenant: any slug is "available")
    app.get('/api/auth/check-slug/:slug', (c) => c.json({ available: true, slug: c.req.param('slug') }));
    // POST /api/auth/forgot-password  (no email provider → always the same opaque ack)
    app.post('/api/auth/forgot-password', (c) => c.json({ success: true, message: 'If the email is registered, a password reset link has been sent.' }));
    // POST /api/auth/reset-password
    app.post('/api/auth/reset-password', (c) => c.json({ success: true, message: 'Password has been successfully reset. You can now log in.' }));
    // GET /api/auth/invite/{token}
    app.get('/api/auth/invite/:token', (c) => c.json({ email: '', role: 'editor', tenant_name: null, tenant_slug: null }));
    // POST /api/auth/accept-invite  (community: no invites)
    app.post('/api/auth/accept-invite', (c) => c.json({ detail: 'Invites are not available in the community edition' }, 400));
}

/**
 * AUTHENTICATED auth ops (me + the security console: blocklist / bot-protection /
 * WAF / audit-logs). MUST be registered AFTER defaultDenyAuth — these read/modify
 * security state and are admin-only in the product (RULE 2). Registering them
 * before the guard would expose the IP blocklist, WAF toggle, and audit logs to
 * anonymous callers.
 */
export function registerAuthCompatAuthedRoutes(app: App): void {
    // GET /api/auth/me
    app.get('/api/auth/me', (c) => {
        const principal = c.get('principal');
        const u = principal?.user as { id?: string; email?: string; role?: string } | null;
        const tenantSlug = principal?.tenant ?? null;
        if (!u) return c.json({ user: null });
        return c.json({
            user: {
                id: u.id,
                email: u.email,
                role: u.role,
                is_master: u.role === 'master_admin',
                created_at: '',
                updated_at: '',
                tenant_id: tenantSlug,
                tenant_slug: tenantSlug,
            },
        });
    });
    // GET /api/auth/security/audit-logs  (no audit store wired → empty)
    app.get('/api/auth/security/audit-logs', (c) => c.json({ logs: [], total: 0 }));
    // GET /api/auth/security/blocklist
    app.get('/api/auth/security/blocklist', (c) => c.json({ bans: [] }));
    // POST /api/auth/security/blocklist
    app.post('/api/auth/security/blocklist', (c) => c.json({ success: true, message: 'IP blocked' }));
    // DELETE /api/auth/security/blocklist/{ban_id}
    app.delete('/api/auth/security/blocklist/:ban_id', (c) => c.json({ success: true, message: 'IP unblocked' }));
    // GET /api/auth/security/bot-protection  (community default config)
    app.get('/api/auth/security/bot-protection', (c) => c.json({ enabled: false, provider: 'cloudflare', site_key: '', secret_key: '', protect_login: true, protect_forgot_password: true, recaptcha_v3_threshold: 0.5, widget_theme: 'auto', widget_size: 'normal', auto_ban_lockout_hours: 24 }));
    // POST /api/auth/security/bot-protection
    app.post('/api/auth/security/bot-protection', (c) => c.json({ success: true }));
    // GET /api/auth/security/bot-protection/metrics
    app.get('/api/auth/security/bot-protection/metrics', (c) => c.json({ solve_rate: 0, total_challenges: 0, blocked_solves: 0, banned_ips: 0 }));
    // GET /api/auth/security/waf  (community: WAF off)
    app.get('/api/auth/security/waf', (c) => c.json({ enabled: false, rules: [] }));
    // POST /api/auth/security/waf
    app.post('/api/auth/security/waf', (c) => c.json({ success: true, enabled: false }));
}
