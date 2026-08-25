/**
 * `/api/tenants/*` — the console's tenant self-surface.
 *
 * The product serves `GET /api/tenants/me/plan` from its billing stack
 * (fastapi-backend routers/tenants.py) so plan-aware UI (PlanUsageSection,
 * plan-gated features) can read the tenant's current plan. The framework is
 * single-tenant per deployment with no billing stack: this resolves the
 * tenant's effective plan from the Phase2Store plans table (the same
 * first-active-plan resolution getEffectiveLimits reads) and answers in the
 * product's MyPlanResponse shape. A plan-less tenant is on the synthetic
 * Community plan — limits `{}`, every feature flag off.
 *
 * Framework-only surface: emit-openapi derives the compat spec from the
 * vendored product community spec, so this op is deliberately outside it.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store, PlanRow } from '../../db/phase2-store.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** A plan row in the product's serialize_plan field set (plan_limits.py). */
export function serializePlan(row: PlanRow, now: string): Record<string, unknown> {
    let limits: Record<string, unknown> = {};
    try { limits = row.limits ? JSON.parse(String(row.limits)) : {}; } catch { /* bad JSON → empty */ }
    return {
        id: row.id,
        slug: row.id,
        name: row.name,
        description: null,
        infra_mode: 'byo',
        price_display: null,
        price_period: null,
        price_cents: Number(row.price_cents ?? 0),
        limits,
        features: [],
        gateway_metadata: {},
        is_public: false,
        is_active: row.is_active !== 0,
        is_default: false,
        highlighted: false,
        badge: null,
        sort_order: 0,
        created_at: row.created_at ?? now,
        updated_at: row.updated_at ?? now,
    };
}

/** The plan every tenant without an assigned plan row is on — everything off. */
function communityPlan(now: string): Record<string, unknown> {
    return {
        id: 'community',
        slug: 'community',
        name: 'Community',
        description: 'Default community plan — upgrade to unlock premium features.',
        infra_mode: 'byo',
        price_display: null,
        price_period: null,
        price_cents: 0,
        limits: {},
        features: [],
        gateway_metadata: {},
        is_public: true,
        is_active: true,
        is_default: true,
        highlighted: false,
        badge: null,
        sort_order: 0,
        created_at: now,
        updated_at: now,
    };
}

export function registerTenantsRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    // GET /api/tenants/me/plan — the console's plan signal (MyPlanResponse).
    app.get('/api/tenants/me/plan', async (c) => {
        const store = p2(c.get('tenant'));
        const [limits, planRow] = await Promise.all([
            store.getEffectiveLimits(),
            store.getActivePlan(),
        ]);
        return c.json({
            plan: planRow ? serializePlan(planRow, now()) : communityPlan(now()),
            limits: limits ?? {},
            usage: {},
            pending_request: null,
        });
    });
}
