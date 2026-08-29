/**
 * A-25 Phase 4 — the GLOBAL plan catalog (product parity: the platform's plan
 * catalog + `tenant.plan` soft FK). Catalog rows live in the EXISTING `plans`
 * table with `tenant_slug = '_global'` — the composite PK (id, tenant_slug)
 * already makes them unique, so there is NO DDL. The `_global` namespace is
 * reserved by tenancy/host.ts, so no real tenant can ever collide with it.
 *
 * Seeding happens at WORKER BOOT in cloud mode ONLY (never in MIGRATIONS —
 * test/plan-limits.mjs asserts a planless tenant is unlimited, and a
 * migration-seeded catalog would change self-host semantics).
 */
import type { DbRunner } from '@frontbase/edge-infra';

export const PLAN_CATALOG_TENANT = '_global';

/** The product's free plan, verbatim semantics: counts + boolean feature flags. */
export const FREE_PLAN_ID = 'free';

export const FREE_PLAN_LIMITS: Record<string, number | boolean> = {
    pages: 10,
    deploys_monthly: 50,
    team_members: 1,
    projects: 1,
    edge_engines: 0,
    private_pages: false,
    api_access: false,
    remove_branding: false,
    engine_imports: false,
};

export interface CatalogPlan {
    id: string;
    name: string;
    priceCents: number;
    interval: string;
    limits: Record<string, number | boolean>;
}

/** The Phase-4 catalog: free tier only (paid tiers are Phase 5). */
export const PLAN_CATALOG: CatalogPlan[] = [
    { id: FREE_PLAN_ID, name: 'Free', priceCents: 0, interval: 'month', limits: FREE_PLAN_LIMITS },
];

/**
 * Idempotent catalog seed — INSERT only the ids that don't exist yet, so a
 * re-boot never resets an operator-tuned row. Cloud boot only.
 */
export async function seedPlanCatalog(runner: DbRunner, now: string): Promise<string[]> {
    const seeded: string[] = [];
    for (const plan of PLAN_CATALOG) {
        const existing = await runner.query(
            'SELECT id FROM plans WHERE tenant_slug = ? AND id = ? LIMIT 1',
            [PLAN_CATALOG_TENANT, plan.id],
        );
        if (existing.length > 0) continue;
        await runner.exec(
            'INSERT INTO plans (id, tenant_slug, name, price_cents, interval, limits, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)',
            [plan.id, PLAN_CATALOG_TENANT, plan.name, plan.priceCents, plan.interval, JSON.stringify(plan.limits), now, now],
        );
        seeded.push(plan.id);
    }
    return seeded;
}

/**
 * Read one catalog plan's limits by id ('_global' namespace). Returns null when
 * the plan id is unknown (⇒ unlimited — same contract as no plan at all).
 */
export async function catalogPlanLimits(
    runner: DbRunner,
    planId: string,
): Promise<Record<string, number | boolean> | null> {
    const rows = await runner.query(
        'SELECT limits FROM plans WHERE tenant_slug = ? AND id = ? AND is_active = 1 LIMIT 1',
        [PLAN_CATALOG_TENANT, planId],
    );
    const raw = rows[0]?.limits;
    if (raw == null) return null;
    try {
        const parsed = JSON.parse(String(raw));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, number | boolean>
            : null;
    } catch { return null; }
}

/**
 * The plan id assigned to a tenant (tenants.plan, migration v20). Null on
 * self-host / unassigned — the unlimited case.
 */
export async function tenantPlanId(runner: DbRunner, tenant: string): Promise<string | null> {
    const rows = await runner.query('SELECT plan FROM tenants WHERE slug = ? LIMIT 1', [tenant]);
    const plan = rows[0]?.plan;
    return plan == null ? null : String(plan);
}
