/**
 * Setup wizard API (M-ID.3 + M3.DB picker). These routes mount OUTSIDE default-deny
 * — they're the pre-init bootstrap (no session exists yet). Guards:
 *   - POST /setup only if NO users exist AND setupToken matches (double guard, RULE 8).
 *   - Once a user exists, both endpoints return 410 already_initialized.
 *   - POST /setup/db validates the driver + credentials by probing (M3.DB.2, RULE 4).
 */
import { Hono } from 'hono';
import type { UserStore } from '../db/users.js';
import type { DbRunner } from '@frontbase/edge-infra';
import { buildDataProvider, sqliteRunner } from '@frontbase/edge-infra';
import { seedOwner } from '../auth/seed.js';
import { migrateUp } from '../db/migrations.js';

export interface SetupRouteDeps {
    userStoreFor: (tenant: string) => UserStore;
    /** A deploy secret (SETUP_TOKEN). Required for POST /setup. */
    setupToken?: string;
    /** Replace the runner (DB picker: POST /setup/db rebuilds it). */
    setRunner?: (runner: DbRunner) => void;
    now: () => string;
}

export function setupRoutes(deps: SetupRouteDeps): Hono {
    const app = new Hono();

    // GET /setup/status — is first-run setup needed?
    app.get('/setup/status', async (c) => {
        const store = deps.userStoreFor('_default');
        const needsSetup = (await store.countUsers()) === 0;
        return c.json({ needsSetup });
    });

    // POST /setup — seed the first admin (owner or master_admin). Double guard:
    // no users + setupToken. Once initialized → 410 (RULE 8 mutation target).
    app.post('/setup', async (c) => {
        const store = deps.userStoreFor('_default');
        if ((await store.countUsers()) > 0) return c.json({ error: 'already_initialized' }, 410);
        const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string; setupToken?: string; role?: string };
        if (!body.email || !body.password) return c.json({ error: 'validation_failed' }, 400);
        if (deps.setupToken && body.setupToken !== deps.setupToken) return c.json({ error: 'invalid_setup_token' }, 403);

        const role = body.role ?? 'owner';
        await seedOwner(store, { email: body.email, password: body.password, now: deps.now(), role });
        return c.json({ ok: true, user: { email: body.email, role } });
    });

    // POST /setup/db — DB picker (M3.DB.1/2). Validates driver+credentials by
    // probing SELECT 1, then migrates. RULE 4: opaque failure (never echo the driver error).
    app.post('/setup/db', async (c) => {
        const body = await c.req.json().catch(() => ({})) as { driver?: string; url?: string; authToken?: string; accountId?: string; databaseId?: string; apiToken?: string; connectionString?: string };
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
