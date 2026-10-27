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
    workflows: 5,
    datasources: 1,
    connected_accounts: 1,
    deploys_monthly: 50,
    team_members: 1,
    projects: 1,
    edge_engines: 0,
    private_pages: false,
    api_access: false,
    remove_branding: false,
    engine_imports: false,
    log_retention_hours: 720,
    shared_worker_executions_monthly: 1000,
    agent_credits_daily: 5,
    agent_credits_monthly: 0,
};

export interface CatalogPlan {
    id: string;
    name: string;
    priceCents: number;
    interval: string;
    limits: Record<string, number | boolean>;
    description: string;
    features: string[];
    infraMode: 'managed' | 'byo';
    stripePriceId?: string;
    highlighted?: boolean;
    badge?: string;
    sortOrder: number;
}

const BASIC_LIMITS = {
    projects: 3, pages: 50, workflows: 25, datasources: 3, connected_accounts: 3,
    edge_engines: 1, team_members: 3, deploys_monthly: 500, log_retention_hours: 2160,
    shared_worker_executions_monthly: 10000, agent_credits_daily: 5, agent_credits_monthly: 500,
    private_pages: true, auth_providers: true, remove_branding: true, api_access: true,
};
const PRO_LIMITS = {
    projects: 3, pages: 200, workflows: 50, datasources: 10, connected_accounts: 10,
    edge_engines: 3, team_members: 10, deploys_monthly: 5000, log_retention_hours: 8760,
    shared_worker_executions_monthly: -1, agent_credits_daily: 20, agent_credits_monthly: 2000,
    private_pages: true, auth_providers: true, remove_branding: true, api_access: true,
};

/** Existing Frontbase live Stripe catalog and product plan limits (A-26). */
export const PLAN_CATALOG: CatalogPlan[] = [
    { id: FREE_PLAN_ID, name: 'Free', priceCents: 0, interval: 'month', limits: FREE_PLAN_LIMITS,
        description: 'Get started on shared infrastructure.', features: ['10 pages, 5 workflows', 'Community / shared workers', 'Public pages only'], infraMode: 'managed', sortOrder: 0 },
    { id: 'basic', name: 'Basic', priceCents: 199, interval: 'month', limits: BASIC_LIMITS,
        description: 'Pro features on Frontbase-managed infrastructure — no setup.', features: ['Managed dedicated engine + state DB', 'Private / auth-gated pages', 'Connect auth providers', 'No infra setup'], infraMode: 'managed', stripePriceId: 'price_1TrSYzPclg9BuO7fJ0s6qjdJ', highlighted: true, badge: 'Best value', sortOrder: 1 },
    { id: 'pro', name: 'Pro', priceCents: 2900, interval: 'month', limits: PRO_LIMITS,
        description: 'Pro features on your own infrastructure.', features: ['Bring your own edge', '200 pages, 50 workflows', 'Private pages & auth'], infraMode: 'byo', stripePriceId: 'price_1TrSe3Pclg9BuO7fZBCB1tw2', sortOrder: 2 },
];

export function catalogPlan(id: string): CatalogPlan | undefined {
    return PLAN_CATALOG.find((plan) => plan.id === id);
}

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
