/**
 * Setup wizard API (M-ID.3 + M3.DB picker). These routes mount OUTSIDE default-deny
 * — they're the pre-init bootstrap (no session exists yet). Guards:
 *   - Both /setup and /setup/db are LOCKED once any user exists (410) — they are
 *     first-run-only. This is the hard boundary that stops a running instance from
 *     being re-bootstrapped or having its DB swapped (SEC audit CRIT-2/CRIT-3).
 *   - POST /setup requires SETUP_TOKEN. Without it, setup is disabled (fail
 *     closed) so the first public visitor cannot claim a fresh deployment.
 *   - POST /setup/claim exchanges the deploy link's URL-fragment capability for
 *     a short-lived HttpOnly cookie. The raw claim is removed from browser
 *     history before the administrator form is shown.
 *   - The seeded role is fixed by deploy (ADMIN_ROLE via seedRole), NOT chosen by
 *     the request body — a public caller cannot mint themselves master_admin.
 *   - POST /setup/db validates the driver + credentials by probing (M3.DB.2, RULE 4).
 */
import { Hono } from 'hono';
import type { UserStore } from '../db/users.js';
import type { DbRunner } from '@frontbase/edge-infra';
import { buildDataProvider } from '@frontbase/edge-infra';
import { seedOwner } from '../auth/seed.js';
import { migrateUp } from '../db/migrations.js';

export interface SetupRouteDeps {
    userStoreFor: (tenant: string) => UserStore;
    /** Deploy secret (SETUP_TOKEN). If unset, browser setup is disabled. */
    setupToken?: string;
    /** ISO expiry for the deploy-time setup capability. Legacy explicit tokens
     *  without an expiry remain accepted, but every issued browser cookie is
     *  still short-lived. */
    setupExpiresAt?: string;
    /** The role the first admin is seeded as (from ADMIN_ROLE at deploy). NOT from the request. */
    seedRole?: string;
    /** Replace the runner (DB picker: POST /setup/db rebuilds it). Pre-init only. */
    setRunner?: (runner: DbRunner) => void;
    /** Atomic single-winner lock for first-admin creation across isolates. */
    claimInitialization?: (at: string) => Promise<boolean>;
    /** Release the lock only when creation fails before a user is persisted. */
    releaseInitialization?: () => Promise<void>;
    now: () => string;
}

export function setupRoutes(deps: SetupRouteDeps): Hono {
    const app = new Hono();
    const CLAIM_COOKIE = 'fb_setup_claim';
    const CLAIM_COOKIE_SECONDS = 15 * 60;

    const clockMs = () => Date.parse(deps.now());
    const configuredExpiryMs = () => {
        if (!deps.setupExpiresAt) return Number.POSITIVE_INFINITY;
        const parsed = Date.parse(deps.setupExpiresAt);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const setupExpired = () => Number.isFinite(configuredExpiryMs()) && clockMs() >= configuredExpiryMs();
    const cookieValue = (header: string | undefined, name: string): string | undefined => {
        for (const part of (header ?? '').split(';')) {
            const [key, ...value] = part.trim().split('=');
            if (key === name) return decodeURIComponent(value.join('='));
        }
        return undefined;
    };
    const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const sign = async (payload: string): Promise<string> => {
        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(deps.setupToken ?? ''),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
    };
    const constantTimeEqual = (left: string, right: string): boolean => {
        let different = left.length ^ right.length;
        const length = Math.max(left.length, right.length);
        for (let i = 0; i < length; i++) different |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
        return different === 0;
    };
    const tokenMatches = async (candidate: string | undefined): Promise<boolean> => {
        if (!candidate || !deps.setupToken) return false;
        const digest = async (value: string) =>
            new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
        const actual = await digest(candidate);
        const expected = await digest(deps.setupToken);
        let different = actual.length ^ expected.length;
        for (let i = 0; i < Math.max(actual.length, expected.length); i++) different |= (actual[i] || 0) ^ (expected[i] || 0);
        return different === 0;
    };
    const hasValidClaimCookie = async (request: Request): Promise<boolean> => {
        if (!deps.setupToken || setupExpired()) return false;
        const raw = cookieValue(request.headers.get('cookie') ?? undefined, CLAIM_COOKIE);
        if (!raw) return false;
        const separator = raw.indexOf('.');
        if (separator < 1) return false;
        const expiresMs = Number(raw.slice(0, separator));
        const signature = raw.slice(separator + 1);
        if (!Number.isFinite(expiresMs) || clockMs() >= expiresMs || expiresMs > configuredExpiryMs()) return false;
        return constantTimeEqual(signature, await sign(String(expiresMs)));
    };
    const claimCookie = async (requestUrl: string): Promise<string> => {
        const expiresMs = Math.min(clockMs() + CLAIM_COOKIE_SECONDS * 1000, configuredExpiryMs());
        const value = `${expiresMs}.${await sign(String(expiresMs))}`;
        const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
        const maxAge = Math.max(1, Math.floor((expiresMs - clockMs()) / 1000));
        return `${CLAIM_COOKIE}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Strict; Path=/api/console/setup; Max-Age=${maxAge}`;
    };
    const clearClaimCookie = (requestUrl: string): string => {
        const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';
        return `${CLAIM_COOKIE}=; HttpOnly${secure}; SameSite=Strict; Path=/api/console/setup; Max-Age=0`;
    };

    // Is first-run setup still available? (No users yet.)
    async function isInitialized(): Promise<boolean> {
        return (await deps.userStoreFor('_default').countUsers()) > 0
            || (await deps.userStoreFor('_root').countUsers()) > 0;
    }

    // GET /setup/status — is first-run setup needed and is setup enabled?
    app.get('/setup/status', async (c) => {
        const initialized = await isInitialized();
        return c.json({
            needsSetup: !initialized,
            setupEnabled: !initialized && Boolean(deps.setupToken) && !setupExpired(),
            setupTokenRequired: Boolean(deps.setupToken),
            setupExpired: !initialized && Boolean(deps.setupToken) && setupExpired(),
        });
    });

    // POST /setup/claim — consume the URL-fragment capability and issue a
    // short-lived, path-scoped HttpOnly setup cookie. The capability never
    // appears in a query string, referrer, Worker URL, or browser storage.
    app.post('/setup/claim', async (c) => {
        if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);
        if (!deps.setupToken) return c.json({ error: 'setup_disabled' }, 403);
        if (setupExpired()) return c.json({ error: 'setup_link_expired' }, 403);
        const body = await c.req.json().catch(() => ({})) as { setupToken?: string };
        if (!(await tokenMatches(body.setupToken))) return c.json({ error: 'invalid_setup_token' }, 403);
        c.header('Set-Cookie', await claimCookie(c.req.url));
        return c.json({ ok: true });
    });

    // POST /setup — seed the first admin. First-run only (410 once any user exists).
    // Browser bootstrap is fail-closed without a deploy-time token.
    app.post('/setup', async (c) => {
        if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);
        if (!deps.setupToken) return c.json({ error: 'setup_disabled' }, 403);
        if (setupExpired()) return c.json({ error: 'setup_link_expired' }, 403);
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string; setupToken?: string };
        if (!body.email || !body.password) return c.json({ error: 'validation_failed' }, 400);
        const authorized = await hasValidClaimCookie(c.req.raw) || await tokenMatches(body.setupToken);
        if (!authorized) return c.json({ error: 'invalid_setup_token' }, 403);

        // The role comes from deploy config (ADMIN_ROLE), NEVER the request body —
        // a caller cannot escalate themselves to master_admin (SEC audit CRIT-2).
        const role = deps.seedRole ?? 'owner';
        const tenantSlug = role === 'master_admin' ? '_root' : '_default';
        const claimed = deps.claimInitialization ? await deps.claimInitialization(deps.now()) : true;
        if (!claimed) return c.json({ error: 'already_initialized' }, 410);
        try {
            const result = await seedOwner(deps.userStoreFor(tenantSlug), { email: body.email, password: body.password, now: deps.now(), role, tenantSlug });
            if (!result.seeded) return c.json({ error: 'already_initialized' }, 410);
        } catch (error) {
            await deps.releaseInitialization?.();
            throw error;
        }
        c.header('Set-Cookie', clearClaimCookie(c.req.url));
        return c.json({ ok: true, user: { email: body.email, role } });
    });

    // POST /setup/db — DB picker. First-run ONLY (locked once initialized).
    // The DB picker is also fail-closed without the deploy-time setup token.
    app.post('/setup/db', async (c) => {
        if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);
        if (!deps.setupToken) return c.json({ error: 'setup_disabled' }, 403);
        if (setupExpired()) return c.json({ error: 'setup_link_expired' }, 403);
        const body = await c.req.json().catch(() => ({})) as { driver?: string; url?: string; authToken?: string; accountId?: string; databaseId?: string; apiToken?: string; connectionString?: string; setupToken?: string };
        const authorized = await hasValidClaimCookie(c.req.raw) || await tokenMatches(body.setupToken);
        if (!authorized) return c.json({ error: 'invalid_setup_token' }, 403);
        const driver = body.driver ?? 'sqlite';
        let runner: DbRunner;
        try {
            const provider = buildDataProvider(
                { version: 'probe', pages: {}, queries: {} },
                {
                    driver,
                    sqliteUrl: body.url,
                    tursoUrl: body.url, tursoAuthToken: body.authToken,
                    d1AccountId: body.accountId, d1DatabaseId: body.databaseId, d1ApiToken: body.apiToken,
                    postgresUrl: body.connectionString,
                },
            );
            runner = provider.db;
            // Probe: a real round-trip proves the credentials work.
            await runner.exec('CREATE TABLE IF NOT EXISTS _fb_probe (id INTEGER)');
            await runner.exec('DELETE FROM _fb_probe');
            await migrateUp(runner);
        } catch {
            return c.json({ error: 'db_connection_failed' }, 400); // RULE 4: opaque
        }
        deps.setRunner?.(runner);
        return c.json({ ok: true, driver });
    });

    return app;
}
