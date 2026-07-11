/**
 * Tenant provisioning routes (M-ID.2, D10). master_admin creates a tenant + its
 * tenant_admin with a generated temp password returned ONCE (never stored plaintext,
 * never logged). Behind requireRole('master_admin').
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { TenantStore } from '../db/tenants.js';
import type { UserStore } from '../db/users.js';
import type { DbRunner } from '@frontbase/edge-infra';
import { hashPassword } from '@frontbase/edge-infra';
import { requireRole } from '../auth/roles.js';
import { TenantStore as TS } from '../db/tenants.js';

export function tenantsRoutes(
    runner: () => DbRunner,
    userStoreFor: (tenant: string) => UserStore,
    now: () => string,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    // POST /tenants — master_admin only: create tenant + seed its admin.
    app.post('/tenants', requireRole('master_admin'), async (c) => {
        const body = await c.req.json().catch(() => ({})) as { name?: string; adminEmail?: string };
        if (!body.name || !body.adminEmail) return c.json({ error: 'validation_failed' }, 400);

        const r = runner();
        const tenants = new TS(r);
        const slug = body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (await tenants.tenantExists(slug)) return c.json({ error: 'tenant_exists' }, 409);

        await tenants.createTenant(slug, body.name, now());
        // Generate a temp password (16 random bytes, base64) — returned ONCE.
        const tempPassword = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        const adminStore = userStoreFor(slug);
        await adminStore.createUser({
            email: body.adminEmail,
            passwordHash: await hashPassword(tempPassword),
            role: 'tenant_admin',
            now: now(),
            tenantSlug: slug,
        });

        return c.json({ tenant: { slug, name: body.name }, admin: { email: body.adminEmail, tempPassword } });
    });

    // GET /tenants — master_admin only: list all tenants.
    app.get('/tenants', requireRole('master_admin'), async (c) => {
        const tenants = new TS(runner());
        return c.json({ tenants: await tenants.listTenants() });
    });

    return app;
}
