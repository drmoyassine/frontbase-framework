/**
 * Setup wizard API (M-ID.3 + M3.DB picker). These routes mount OUTSIDE default-deny
 * — they're the pre-init bootstrap (no session exists yet). Guards:
 *   - Both /setup and /setup/db are LOCKED once any user exists (410) — they are
 *     first-run-only. This is the hard boundary that stops a running instance from
 *     being re-bootstrapped or having its DB swapped (SEC audit CRIT-2/CRIT-3).
 *   - POST /setup requires the SETUP_TOKEN (a deploy secret). If no SETUP_TOKEN is
 *     configured, setup is DISABLED entirely (fail closed) — you can't bootstrap an
 *     admin without proving deploy-time access.
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
    /** Deploy secret (SETUP_TOKEN). REQUIRED — if absent, /setup is disabled (fail closed). */
    setupToken?: string;
    /** The role the first admin is seeded as (from ADMIN_ROLE at deploy). NOT from the request. */
    seedRole?: string;
    /** Replace the runner (DB picker: POST /setup/db rebuilds it). Pre-init only. */
    setRunner?: (runner: DbRunner) => void;
    now: () => string;
}

export function setupRoutes(deps: SetupRouteDeps): Hono {
    const app = new Hono();

    // Is first-run setup still available? (No users yet.)
    async function isInitialized(): Promise<boolean> {
        return (await deps.userStoreFor('_default').countUsers()) > 0
            || (await deps.userStoreFor('_root').countUsers()) > 0;
    }

    // GET /setup/status — is first-run setup needed?
    app.get('/setup/status', async (c) => {
        return c.json({ needsSetup: !(await isInitialized()) });
    });

    // POST /setup — seed the first admin. First-run only (410 once any user exists),
    // SETUP_TOKEN required (fail closed if unset), role fixed by deploy (not the body).
    app.post('/setup', async (c) => {
        if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);
        // Fail closed: no SETUP_TOKEN configured → setup is disabled.
        if (!deps.setupToken) return c.json({ error: 'setup_disabled' }, 403);
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string; setupToken?: string };
        if (!body.email || !body.password) return c.json({ error: 'validation_failed' }, 400);
        if (body.setupToken !== deps.setupToken) return c.json({ error: 'invalid_setup_token' }, 403);

        // The role comes from deploy config (ADMIN_ROLE), NEVER the request body —
        // a caller cannot escalate themselves to master_admin (SEC audit CRIT-2).
        const role = deps.seedRole ?? 'owner';
        const tenantSlug = role === 'master_admin' ? '_root' : '_default';
        await seedOwner(deps.userStoreFor(tenantSlug), { email: body.email, password: body.password, now: deps.now(), role, tenantSlug });
        return c.json({ ok: true, user: { email: body.email, role } });
    });

    // POST /setup/db — DB picker. First-run ONLY (locked once initialized), and
    // SETUP_TOKEN required (same deploy-time proof as /setup). This prevents an
    // anonymous caller from swapping a live instance's database (SEC audit CRIT-3).
    app.post('/setup/db', async (c) => {
        if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);
        if (!deps.setupToken) return c.json({ error: 'setup_disabled' }, 403);
        const body = await c.req.json().catch(() => ({})) as { driver?: string; url?: string; authToken?: string; accountId?: string; databaseId?: string; apiToken?: string; connectionString?: string; setupToken?: string };
        if (body.setupToken !== deps.setupToken) return c.json({ error: 'invalid_setup_token' }, 403);
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
