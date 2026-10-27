/**
 * `/api/admin/plans*` — the master-admin plan editor surface.
 *
 * The product's billing stack (fastapi-backend routers/admin_plans.py) serves
 * plan CRUD + the limit registry to the console's Subscription Plans admin.
 * The framework keeps the same paths and shapes so the vendored console's
 * editor works unmodified and operators have a real API unlock for plan-gated
 * features (`engine_imports` et al.) — without this, a deployed worker's plans
 * table is reachable only via direct D1 SQL. Billing-gateway sync is a no-op
 * (no gateway in self-host); tenant-addon ops stay 501 stubs.
 *
 * Framework model note: plans are per-tenant rows (id doubles as the slug —
 * serializePlan reports slug=id), so a created/updated active plan takes
 * effect immediately via getEffectiveLimits' first-active-plan resolution.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { Phase2Store } from '../../db/phase2-store.js';
import { serializePlan } from './tenants.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** The canonical catalog (product plan_limits.py LIMIT_REGISTRY + engine_imports).
 *  Add a key here to expose a new limit to the admin editor — no DB migration. */
const LIMIT_REGISTRY: Array<Record<string, unknown>> = [
    // -- Capacity --
    { key: 'projects', label: 'Projects', kind: 'int', category: 'capacity', scope: 'tenant', unit: null, default: 1 },
    { key: 'pages', label: 'Pages', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 10 },
    { key: 'workflows', label: 'Active workflows', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 5 },
    { key: 'datasources', label: 'Data sources', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 1 },
    { key: 'connected_accounts', label: 'Connected accounts', kind: 'int', category: 'capacity', scope: 'tenant', unit: null, default: 1 },
    { key: 'edge_engines', label: 'Edge engines', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    { key: 'team_members', label: 'Team members', kind: 'int', category: 'capacity', scope: 'tenant', unit: null, default: 1 },
    { key: 'edge_databases', label: 'Edge databases', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    { key: 'edge_caches', label: 'Edge caches', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    { key: 'edge_queues', label: 'Edge queues', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    { key: 'edge_vectors', label: 'Edge vector databases', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    { key: 'storage_providers', label: 'Storage providers', kind: 'int', category: 'capacity', scope: 'project', unit: null, default: 0 },
    // -- Operational (optional; dormant, UNLIMITED = disabled) --
    { key: 'deploys_monthly', label: 'Deploys / republishes per month', kind: 'int', category: 'operational', scope: 'tenant', unit: '/mo', default: -1 },
    { key: 'log_retention_hours', label: 'Log retention window (hours)', kind: 'int', category: 'operational', scope: 'tenant', unit: 'h', default: -1 },
    { key: 'shared_worker_executions_monthly', label: 'Shared-worker executions per month (free/managed)', kind: 'int', category: 'operational', scope: 'tenant', unit: '/mo', default: -1 },
    // -- Feature flags (plan-level entitlements) --
    { key: 'private_pages', label: 'Private / auth-gated pages', kind: 'bool', category: 'feature', scope: 'tenant', unit: null, default: false },
    { key: 'auth_providers', label: 'Connect auth provider', kind: 'bool', category: 'feature', scope: 'tenant', unit: null, default: false },
    { key: 'remove_branding', label: 'Remove Frontbase branding', kind: 'bool', category: 'feature', scope: 'tenant', unit: null, default: false },
    { key: 'api_access', label: 'API access (/v1)', kind: 'bool', category: 'feature', scope: 'tenant', unit: null, default: false },
    { key: 'engine_imports', label: 'Import engines', kind: 'bool', category: 'feature', scope: 'tenant', unit: null, default: false },
];
const REGISTRY_BY_KEY = new Map(LIMIT_REGISTRY.map((d) => [String(d.key), d]));

/**
 * Validate an admin-supplied limits map against the registry (product
 * validate_limits): unknown keys are rejected, values are coerced to the
 * declared kind. Returns null on a bad key/value — the route answers 400.
 */
function validateLimits(raw: unknown): Record<string, number | boolean> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean: Record<string, number | boolean> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const spec = REGISTRY_BY_KEY.get(key);
        if (!spec) return null;
        if (spec.kind === 'bool') {
            clean[key] = Boolean(value);
        } else {
            const n = Number(value);
            if (!Number.isFinite(n)) return null;
            clean[key] = Math.trunc(n);
        }
    }
    return clean;
}

export function registerAdminPlansRoutes(app: App, p2: (t: string) => Phase2Store, now: () => string): void {
    app.get('/api/admin/plans/limit-registry', (c) => c.json({ limits: LIMIT_REGISTRY }));

    app.get('/api/admin/plans', async (c) => {
        const store = p2(c.get('tenant'));
        const [rows, active] = await Promise.all([store.listPlans(), store.getActivePlan()]);
        return c.json({
            plans: rows.map((row) => ({
                ...serializePlan(row as never, now()),
                // Framework plans are per-tenant rows: "tenants using this plan"
                // is 1 while it's this tenant's active plan, else 0.
                tenant_count: active && active.id === row.id ? 1 : 0,
            })),
        });
    });

    app.post('/api/admin/plans', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            slug?: unknown; name?: unknown; limits?: unknown; is_active?: unknown; price_cents?: unknown;
        };
        const slug = typeof b.slug === 'string' ? b.slug.toLowerCase().trim() : '';
        if (!slug || !b.name) return c.json({ detail: 'slug and name are required' }, 400);
        const store = p2(c.get('tenant'));
        if (await store.getPlan(slug)) {
            return c.json({ detail: `Plan slug '${slug}' already exists` }, 409);
        }
        const limits = validateLimits(b.limits);
        if (limits === null) return c.json({ detail: 'Invalid limits payload' }, 400);
        await store.upsertPlan({
            id: slug,
            name: String(b.name),
            priceCents: typeof b.price_cents === 'number' ? b.price_cents : 0,
            interval: 'month',
            limits,
            isActive: b.is_active === undefined ? true : Boolean(b.is_active),
        }, now());
        return c.json({ plan: serializePlan(await store.getPlan(slug) as never, now()) }, 201);
    });

    app.put('/api/admin/plans/:plan_id', async (c) => {
        const b = await c.req.json().catch(() => ({})) as {
            name?: unknown; limits?: unknown; is_active?: unknown; price_cents?: unknown;
        };
        const store = p2(c.get('tenant'));
        const existing = await store.getPlan(c.req.param('plan_id'));
        if (!existing) return c.json({ detail: 'Plan not found' }, 404);
        const limits = validateLimits(b.limits);
        if (limits === null) return c.json({ detail: 'Invalid limits payload' }, 400);
        await store.upsertPlan({
            id: existing.id,
            name: typeof b.name === 'string' && b.name ? b.name : existing.name,
            priceCents: typeof b.price_cents === 'number' ? b.price_cents : Number(existing.price_cents ?? 0),
            interval: existing.interval ?? 'month',
            limits: limits && Object.keys(limits).length > 0 ? limits : (existing.limits ? JSON.parse(String(existing.limits)) : undefined),
            isActive: b.is_active === undefined ? existing.is_active !== 0 : Boolean(b.is_active),
        }, now());
        return c.json({ plan: serializePlan(await store.getPlan(existing.id) as never, now()) });
    });

    app.delete('/api/admin/plans/:plan_id', async (c) => {
        const store = p2(c.get('tenant'));
        const existing = await store.getPlan(c.req.param('plan_id'));
        if (!existing) return c.json({ detail: 'Plan not found' }, 404);
        // Product semantics: an active plan deactivates first; the second call
        // removes it. (The framework has no default-plan row to protect — the
        // community plan is synthetic.)
        if (existing.is_active !== 0) {
            await store.upsertPlan({
                id: existing.id,
                name: existing.name,
                priceCents: Number(existing.price_cents ?? 0),
                interval: existing.interval ?? 'month',
                limits: existing.limits ? JSON.parse(String(existing.limits)) : undefined,
                isActive: false,
            }, now());
            return c.json({ success: true, message: `Plan '${existing.id}' deactivated` });
        }
        await store.deletePlan(existing.id);
        return c.json({ success: true, message: `Plan '${existing.id}' permanently deleted` });
    });
}
