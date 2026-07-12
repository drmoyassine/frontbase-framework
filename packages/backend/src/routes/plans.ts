/**
 * Plans routes (Phase 3b / F8) — tenant-scoped billing-tier CRUD.
 * Behind default-deny auth (RULE 2); opaque errors (RULE 4).
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import type { Phase2Store } from '../db/phase2-store.js';

export function plansRoutes(
    storeFor: (tenant: string) => Phase2Store,
    now: () => string,
): Hono<{ Variables: ConsoleAuthVars }> {
    const app = new Hono<{ Variables: ConsoleAuthVars }>();

    app.get('/plans', async (c) => {
        const store = storeFor(c.get('tenant'));
        const plans = await store.listPlans();
        // Parse the limits JSON for the client.
        return c.json({
            plans: plans.map((p) => ({
                ...p,
                limits: p.limits ? JSON.parse(String(p.limits)) : null,
            })),
        });
    });

    app.put('/plans/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        const body = await c.req.json().catch(() => null) as { name?: string; priceCents?: number; interval?: string; limits?: Record<string, unknown>; isActive?: boolean } | null;
        if (!body?.name) return c.json({ error: 'validation_failed' }, 400);
        await store.upsertPlan({
            id: c.req.param('id'),
            name: body.name,
            priceCents: body.priceCents ?? 0,
            interval: body.interval ?? 'month',
            limits: body.limits,
            isActive: body.isActive,
        }, now());
        return c.json({ ok: true });
    });

    app.delete('/plans/:id', async (c) => {
        const store = storeFor(c.get('tenant'));
        await store.deletePlan(c.req.param('id'));
        return c.json({ ok: true });
    });

    return app;
}
