/**
 * App Users routes (CF-18 Phase 2) — tenant-scoped user CRUD + invite.
 * List/create/update-role/delete. Behind default-deny auth (RULE 2).
 *
 * `userStoreFor` is the existing factory from createConsole. Passwords are hashed
 * (hashPassword) and never returned; invite generates a temp password returned ONCE.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { UserStore } from '../db/users.js';
import { hashPassword } from '@frontbase/edge-infra';

export function usersRoutes(
    userStoreFor: (tenant: string) => UserStore,
    now: () => string,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    // GET /users — list users in this tenant
    app.get('/users', async (c) => {
        const store = userStoreFor(c.get('tenant'));
        return c.json({ users: await store.listUsers() });
    });

    // POST /users — invite a new user (generates temp password returned ONCE)
    app.post('/users', async (c) => {
        const body = await c.req.json().catch(() => null) as { email?: string; role?: string } | null;
        if (!body?.email) return c.json({ error: 'validation_failed' }, 400);
        const role = body.role ?? 'owner';
        if (!['owner', 'tenant_admin'].includes(role)) return c.json({ error: 'invalid_role' }, 400);

        const store = userStoreFor(c.get('tenant'));
        // Generate a temp password (16 random bytes, base64) — returned ONCE.
        const tempPassword = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        const user = await store.createUser({
            email: body.email,
            passwordHash: await hashPassword(tempPassword),
            role,
            now: now(),
        });
        return c.json({ user, tempPassword });
    });

    // PATCH /users/:id — update role
    app.patch('/users/:id', async (c) => {
        const body = await c.req.json().catch(() => null) as { role?: string } | null;
        if (!body?.role) return c.json({ error: 'validation_failed' }, 400);
        if (!['owner', 'tenant_admin'].includes(body.role)) return c.json({ error: 'invalid_role' }, 400);

        const store = userStoreFor(c.get('tenant'));
        const existing = await store.findById(c.req.param('id'));
        if (!existing) return c.json({ error: 'not_found' }, 404);
        await store.updateRole(c.req.param('id'), body.role);
        return c.json({ ok: true });
    });

    // DELETE /users/:id
    app.delete('/users/:id', async (c) => {
        const store = userStoreFor(c.get('tenant'));
        const existing = await store.findById(c.req.param('id'));
        if (!existing) return c.json({ error: 'not_found' }, 404);
        await store.deleteUser(c.req.param('id'));
        return c.json({ ok: true });
    });

    return app;
}
