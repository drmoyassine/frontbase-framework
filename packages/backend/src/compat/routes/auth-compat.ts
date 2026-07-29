/**
 * CF-22 P2 Wave 3 — the Authentication tag (18 ops). Login/logout/signup/forgot/
 * reset/invite/accept/check-slug are UNAUTHENTICATED (the host mounts this whole
 * function BEFORE defaultDenyAuth so those routes bypass the guard). The me +
 * security endpoints are authenticated in the product and community worker.
 * `me` reads the principal established by defaultDenyAuth; blocklist, bot
 * protection, WAF, metrics, and audit logs use tenant-scoped persisted settings.
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
import type { Context, Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { UserStore } from '../../db/users.js';
import type { TenantStore } from '../../db/tenants.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import type { CommunityInviteStore, KeyValueStore, PasswordResetStore } from '../store.js';
import {
    zAcceptInviteRequest,
    zAuthenticationCheckSlugPath,
    zAuthenticationGetInvitePath,
    zBotProtectionUpdateRequest,
    zForgotPasswordRequest,
    zIpBlockRequest,
    zLoginRequest,
    zResetPasswordRequest,
    zSignupRequest,
    zWafUpdateRequest,
} from '../zod.gen.js';
import { hashPassword, verifyPassword, issueSession } from '@frontbase/edge-infra';

// A well-formed PBKDF2 hash of a random value — verified against on unknown-email
// logins so response time doesn't reveal whether the email exists (MED-5). Iters
// MUST match PBKDF2_ITERATIONS (100k); a higher count throws on Workers.
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

type App = Hono<{ Variables: ConsoleAuthVars }>;
const validationError = {
    detail: [{ type: 'value_error', loc: ['body'], msg: 'Validation failed', input: null }],
};
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

function userPayload(
    user: { id: string; email: string; role: string; tenantSlug: string },
    now: string,
    message: string,
): Record<string, unknown> {
    return {
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            is_master: user.role === 'master_admin',
            created_at: now,
            updated_at: now,
            tenant_id: user.tenantSlug,
            tenant_slug: user.tenantSlug,
        },
        message,
    };
}

async function setSession(
    c: Context<{ Variables: ConsoleAuthVars }>,
    user: { id: string; email: string; role: string; tenantSlug: string },
    sessionSecret: string,
    sessionVersion = 0,
): Promise<void> {
    const token = await issueSession(
        {
            sub: user.id,
            email: user.email,
            role: user.role,
            tenant_slug: user.tenantSlug,
            session_version: sessionVersion,
        },
        sessionSecret,
        Math.floor(Date.now() / 1000),
    );
    c.header('Set-Cookie', SESSION_COOKIE(token));
}

/**
 * UNAUTHENTICATED auth ops (login/logout/signup/forgot/reset/invite/accept/
 * check-slug). MUST be registered BEFORE defaultDenyAuth so they bypass the guard
 * — a user cannot present a session to log in.
 */
export function registerAuthCompatUnauthRoutes(
    app: App,
    userStoreFor: (t: string) => UserStore,
    tenants: TenantStore,
    invites: CommunityInviteStore,
    passwordResets: PasswordResetStore,
    sessionSecret: string,
    now: () => string,
    deliverPasswordReset?: (email: string, token: string) => Promise<void>,
): void {
    // Product contract includes explicit preflight operations for these routes.
    app.options('/api/auth/login', async (c) => {
        await userStoreFor('_default').findByEmailAnyTenant('');
        return c.body(null, 200);
    });
    app.options('/api/auth/signup', async (c) => {
        await userStoreFor('_default').findByEmailAnyTenant('');
        return c.body(null, 200);
    });
    // POST /api/auth/login
    app.post('/api/auth/login', async (c) => {
        const parsed = zLoginRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        const body = parsed.data;
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

        await setSession(
            c,
            matched,
            sessionSecret,
            await userStoreFor(matched.tenantSlug).getSessionVersion(matched.id),
        );
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
    // POST /api/auth/signup — community-local account + workspace identity.
    app.post('/api/auth/signup', async (c) => {
        const parsed = zSignupRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        const email = parsed.data.email.trim().toLowerCase();
        const tenantSlug = parsed.data.slug.trim().toLowerCase();
        if ((await userStoreFor('_default').findByEmailAnyTenant(email)).length > 0) {
            return c.json({ detail: 'An account with this email already exists' }, 409);
        }
        if (await tenants.tenantExists(tenantSlug)) {
            return c.json({ detail: `Slug '${tenantSlug}' is already taken` }, 409);
        }
        const timestamp = now();
        await tenants.createTenant(tenantSlug, parsed.data.workspace_name, timestamp);
        let user;
        try {
            user = await userStoreFor(tenantSlug).createUser({
                id: parsed.data.user_id ?? undefined,
                email,
                passwordHash: await hashPassword(parsed.data.password),
                role: 'owner',
                tenantSlug,
                now: timestamp,
            });
        } catch (error) {
            await tenants.deleteTenant(tenantSlug);
            throw error;
        }
        await setSession(c, user, sessionSecret);
        return c.json({
            ...userPayload(user, timestamp, 'Workspace created'),
            tenant: { id: tenantSlug, slug: tenantSlug, name: parsed.data.workspace_name },
        });
    });
    // GET /api/auth/check-slug/{slug}
    app.get('/api/auth/check-slug/:slug', async (c) => {
        const parsed = zAuthenticationCheckSlugPath.safeParse({ slug: c.req.param('slug') });
        if (!parsed.success) return c.json(validationError, 422);
        const slug = parsed.data.slug.trim().toLowerCase();
        return c.json({ available: !await tenants.tenantExists(slug), slug });
    });
    // POST /api/auth/forgot-password — opaque/non-enumerating response. A host
    // injects delivery (email, queue, local admin bridge); raw tokens never persist.
    app.post('/api/auth/forgot-password', async (c) => {
        const parsed = zForgotPasswordRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        if (deliverPasswordReset) {
            const candidates = await userStoreFor('_default').findByEmailAnyTenant(parsed.data.email);
            for (const user of candidates) {
                const token = await passwordResets.create(user, now());
                try {
                    await deliverPasswordReset(user.email, token);
                } catch {
                    // Preserve the non-enumerating response and never leak delivery details.
                }
            }
        }
        return c.json({ success: true, message: 'If the email is registered, a password reset link has been sent.' });
    });
    // POST /api/auth/reset-password — hashed token, expiry, single-use credential
    // mutation, and session-generation bump.
    app.post('/api/auth/reset-password', async (c) => {
        const parsed = zResetPasswordRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        const capability = await passwordResets.consume(parsed.data.email, parsed.data.token, now());
        if (!capability) return c.json({ detail: 'Invalid or expired reset token' }, 400);
        await userStoreFor(capability.tenantSlug).updatePasswordAndInvalidateSessions(
            capability.userId,
            await hashPassword(parsed.data.password),
            now(),
        );
        return c.json({ success: true, message: 'Password has been successfully reset. You can now log in.' });
    });
    // GET /api/auth/invite/{token}
    app.get('/api/auth/invite/:token', async (c) => {
        const parsed = zAuthenticationGetInvitePath.safeParse({ token: c.req.param('token') });
        if (!parsed.success) return c.json(validationError, 422);
        const invite = await invites.getPending(parsed.data.token, now());
        if (!invite) return c.json({ detail: 'Invite is invalid, accepted, or expired' }, 404);
        return c.json({
            email: invite.email,
            role: invite.role,
            tenant_name: invite.tenantName,
            tenant_slug: invite.tenantSlug,
        });
    });
    // POST /api/auth/accept-invite — one-time local invite consumption.
    app.post('/api/auth/accept-invite', async (c) => {
        const parsed = zAcceptInviteRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        const pending = await invites.getPending(parsed.data.token, now());
        if (!pending) return c.json({ detail: 'Invite is invalid, accepted, or expired' }, 404);
        if ((await userStoreFor('_default').findByEmailAnyTenant(pending.email)).length > 0) {
            return c.json({ detail: 'An account with this email already exists' }, 409);
        }
        const timestamp = now();
        const user = await userStoreFor(pending.tenantSlug).createUser({
            email: pending.email,
            passwordHash: await hashPassword(parsed.data.password),
            role: pending.role,
            tenantSlug: pending.tenantSlug,
            now: timestamp,
        });
        const consumed = await invites.consume(parsed.data.token, timestamp);
        if (!consumed) {
            await userStoreFor(pending.tenantSlug).deleteUser(user.id);
            return c.json({ detail: 'Invite is invalid, accepted, or expired' }, 409);
        }
        await setSession(c, user, sessionSecret);
        return c.json(userPayload(user, timestamp, 'Invitation accepted'));
    });
}

/**
 * AUTHENTICATED auth ops (me + the security console: blocklist / bot-protection /
 * WAF / audit-logs). MUST be registered AFTER defaultDenyAuth — these read/modify
 * security state and are admin-only in the product (RULE 2). Registering them
 * before the guard would expose the IP blocklist, WAF toggle, and audit logs to
 * anonymous callers.
 */
export function registerAuthCompatAuthedRoutes(
    app: App,
    kvFor: (tenant: string) => KeyValueStore,
    secretCipher: SecretCipher,
    now: () => string,
): void {
    const BOT_DEFAULTS = {
        enabled: false,
        provider: 'cloudflare',
        site_key: '',
        secret_key: '',
        protect_login: true,
        protect_forgot_password: true,
        recaptcha_v3_threshold: 0.5,
        widget_theme: 'auto',
        widget_size: 'normal',
        auto_ban_lockout_hours: 24,
    };
    const audit = async (tenant: string, action: string, details: unknown): Promise<void> => {
        const store = kvFor(tenant);
        const entries = await store.getJson<Record<string, unknown>[]>('auth_security_audit', []);
        entries.unshift({
            id: crypto.randomUUID(),
            action,
            details,
            created_at: now(),
            user_id: null,
            ip_address: null,
            user_agent: null,
        });
        await store.setJson('auth_security_audit', entries.slice(0, 100), now());
    };
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
    // GET /api/auth/security/audit-logs
    app.get('/api/auth/security/audit-logs', async (c) => {
        const entries = await kvFor(c.get('tenant')).getJson<Record<string, unknown>[]>('auth_security_audit', []);
        const limit = Math.max(0, Number(c.req.query('limit') ?? 50));
        return c.json(entries.slice(0, limit));
    });
    // GET /api/auth/security/blocklist
    app.get('/api/auth/security/blocklist', async (c) =>
        c.json(await kvFor(c.get('tenant')).getJson<Record<string, unknown>[]>('auth_security_blocklist', [])));
    // POST /api/auth/security/blocklist
    app.post('/api/auth/security/blocklist', async (c) => {
        const parsed = zIpBlockRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        const store = kvFor(c.get('tenant'));
        const entries = await store.getJson<Record<string, unknown>[]>('auth_security_blocklist', []);
        const ban = { id: crypto.randomUUID(), ...parsed.data, created_at: now() };
        entries.unshift(ban);
        await store.setJson('auth_security_blocklist', entries, now());
        await audit(c.get('tenant'), 'ip_blocked', ban);
        return c.json({ success: true, message: `Successfully blocked ${parsed.data.ip_or_range}` });
    });
    // DELETE /api/auth/security/blocklist/{ban_id}
    app.delete('/api/auth/security/blocklist/:ban_id', async (c) => {
        const store = kvFor(c.get('tenant'));
        const entries = await store.getJson<Record<string, unknown>[]>('auth_security_blocklist', []);
        const banId = c.req.param('ban_id');
        const kept = entries.filter((entry) => entry.id !== banId);
        if (kept.length === entries.length) return c.json({ detail: 'Ban not found' }, 404);
        await store.setJson('auth_security_blocklist', kept, now());
        await audit(c.get('tenant'), 'ip_unblocked', { id: banId });
        return c.json({ success: true, message: 'IP unblocked' });
    });
    // GET /api/auth/security/bot-protection
    app.get('/api/auth/security/bot-protection', async (c) =>
        c.json(await kvFor(c.get('tenant')).getJson('auth_security_bot', BOT_DEFAULTS)));
    // POST /api/auth/security/bot-protection
    app.post('/api/auth/security/bot-protection', async (c) => {
        const parsed = zBotProtectionUpdateRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        if (parsed.data.secret_key) {
            const ciphertext = await secretCipher.encrypt(parsed.data.secret_key);
            if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_cipher_unavailable');
            await kvFor(c.get('tenant')).setJson('auth_security_bot_secret', ciphertext, now());
        }
        await kvFor(c.get('tenant')).setJson(
            'auth_security_bot',
            { ...parsed.data, secret_key: '' },
            now(),
        );
        await audit(c.get('tenant'), 'bot_protection_updated', { enabled: parsed.data.enabled });
        return c.json({ success: true });
    });
    // GET /api/auth/security/bot-protection/metrics
    app.get('/api/auth/security/bot-protection/metrics', async (c) => {
        const bans = await kvFor(c.get('tenant')).getJson<unknown[]>('auth_security_blocklist', []);
        return c.json({ solve_rate: 0, total_challenges: 0, blocked_solves: 0, banned_ips: bans.length });
    });
    // GET /api/auth/security/waf
    app.get('/api/auth/security/waf', async (c) =>
        c.json(await kvFor(c.get('tenant')).getJson('auth_security_waf', { enabled: false })));
    // POST /api/auth/security/waf
    app.post('/api/auth/security/waf', async (c) => {
        const parsed = zWafUpdateRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json(validationError, 422);
        await kvFor(c.get('tenant')).setJson('auth_security_waf', parsed.data, now());
        await audit(c.get('tenant'), 'waf_updated', parsed.data);
        return c.json({ success: true, enabled: parsed.data.enabled });
    });
}
