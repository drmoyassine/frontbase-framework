/**
 * `/api/admin/tenants*` — the platform-admin tenant management surface (A-25
 * Phase 4, WA4). Product reference: fastapi-backend/app/routers/tenant_admin.py
 * — list / detail / create / update / soft-suspend / add-user, every handler
 * gated on the MASTER admin (the product's ADMIN_USERS dict; the framework's
 * `master_admin` role). The `/api/admin/` prefix guard in app.ts only requires
 * ANY admin role — an `owner` must not list other tenants' workspaces — so each
 * handler here re-checks master_admin itself.
 *
 * Framework model mapping (plan correction 3 — no projects table; membership
 * rows ARE the users table):
 *   - `id` aliases the slug (tenants.slug is the PK; console passes it back).
 *   - `member_count`/`members` come from `users` WHERE tenant_slug = slug.
 *   - `project_count`/`project_id` are 0/null — there is no project row.
 *   - `app_users` is 0 — the product counted the tenant's connected Supabase
 *     auth users; the framework has no per-tenant Supabase project.
 *   - `owner_last_login_at` is null — the framework users table has no
 *     last-login column yet (honest absence, not a fabricated timestamp).
 *   - `usage_stats.executions_limit` resolves from the `_global` plan catalog
 *     (`shared_worker_executions_monthly`); no catalog row ⇒ -1 (unlimited),
 *     exactly the product's BYO-tier resolution.
 */
import type { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { hashPassword } from '@frontbase/edge-infra';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { TenantStore } from '../../db/tenants.js';
import type { UserStore } from '../../db/users.js';
import type { PagesStore } from '../pages-store.js';
import { FRAMEWORK_RESERVED_SLUGS, SLUG_RE } from '../../tenancy/host.js';
import { catalogPlanLimits } from '../plans/catalog.js';
import {
    fastApiValidationError,
} from '../request-validation.js';
import {
    zCreateTenantRequest,
    zCreateTenantUserRequest,
    zUpdateTenantRequest,
} from '../zod.gen.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

/** MASTER-ONLY gate. Returns the error response, or null when the caller is
 *  the master admin. Mirrors product require_master_admin: 401 unauthenticated,
 *  403 authenticated-but-not-master ("Master admin required"). */
function requireMaster(c: { get(name: 'principal'): unknown }): { status: 401 | 403; body: { detail: string } } | null {
    const principal = c.get('principal') as { user?: { role?: string } | null } | undefined;
    const user = principal?.user;
    if (!user || typeof user !== 'object') return { status: 401, body: { detail: 'Not authenticated' } };
    if (user.role !== 'master_admin') return { status: 403, body: { detail: 'Master admin required' } };
    return null;
}

/** Product _usage_stats: pct capped at 100, 0 when the limit is not positive. */
function usageStats(current: number, limit: number): Record<string, number> {
    return {
        executions_current: current,
        executions_limit: limit,
        executions_percentage: limit > 0 ? Math.min(100, (current / limit) * 100) : 0.0,
    };
}

/** Product _executions_limit_for: the plan's monthly shared-worker execution
 *  cap; unknown/absent plan ⇒ -1 (UNLIMITED, rendered ∞ by the console). */
async function executionsLimitFor(runner: DbRunner, plan: string | null): Promise<number> {
    if (!plan) return -1;
    const limits = await catalogPlanLimits(runner, plan.toLowerCase()).catch(() => null);
    const raw = limits?.shared_worker_executions_monthly;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : -1;
}

/** UTC start of the month containing `at` (product: datetime(y, m, 1, tz=utc)). */
function startOfMonth(at: string): string {
    const ref = new Date(at);
    if (Number.isNaN(ref.getTime())) return '1970-01-01T00:00:00.000Z';
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)).toISOString();
}

interface TenantAggregates {
    memberCount: Map<string, number>;
    ownerEmail: Map<string, string>;
    pages: Map<string, number>;
    workflows: Map<string, number>;
    executions: Map<string, number>;
}

/** Cross-tenant aggregate counts for the list/detail surfaces — one GROUP BY
 *  per table instead of a query per tenant (the product loops per tenant). */
async function tenantAggregates(runner: DbRunner, monthStart: string): Promise<TenantAggregates> {
    const countBy = (rows: Array<Record<string, unknown>>): Map<string, number> => {
        const map = new Map<string, number>();
        for (const row of rows) map.set(String(row.tenant_slug), Number(row.n));
        return map;
    };
    const [members, owners, pages, workflows, executions] = await Promise.all([
        runner.query("SELECT tenant_slug, COUNT(*) AS n FROM users WHERE tenant_slug NOT LIKE '\\_%' ESCAPE '\\' GROUP BY tenant_slug"),
        runner.query("SELECT tenant_slug, email, ROW_NUMBER() OVER (PARTITION BY tenant_slug ORDER BY created_at, rowid) AS rn FROM users WHERE role = 'owner' AND tenant_slug NOT LIKE '\\_%' ESCAPE '\\'"),
        runner.query("SELECT tenant_slug, COUNT(*) AS n FROM compat_pages WHERE deleted_at IS NULL GROUP BY tenant_slug"),
        runner.query('SELECT tenant_slug, COUNT(*) AS n FROM workflows GROUP BY tenant_slug'),
        runner.query('SELECT tenant_slug, COUNT(*) AS n FROM workflow_executions WHERE started_at >= ? GROUP BY tenant_slug', [monthStart]),
    ]);
    const ownerEmail = new Map<string, string>();
    for (const row of owners) {
        if (Number(row.rn) === 1) ownerEmail.set(String(row.tenant_slug), String(row.email));
    }
    return {
        memberCount: countBy(members),
        ownerEmail,
        pages: countBy(pages),
        workflows: countBy(workflows),
        executions: countBy(executions),
    };
}

export function registerAdminTenantsRoutes(
    app: App,
    runner: DbRunner,
    tenants: TenantStore,
    userStoreFor?: (tenant: string) => UserStore,
    pagesFor?: (tenant: string) => PagesStore,
    now: () => string = () => new Date().toISOString(),
): void {
    // GET /api/admin/tenants/ — every tenant with counts + usage.
    app.get('/api/admin/tenants/', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        const rows = await tenants.listTenants();
        const monthStart = startOfMonth(now());
        const agg = await tenantAggregates(runner, monthStart);
        const full = await Promise.all(rows.map((row) => tenants.getTenant(row.slug)));
        const list = [];
        for (const t of full) {
            if (!t) continue;
            const plan = (t.plan ?? 'free').toLowerCase();
            const current = agg.executions.get(t.slug) ?? 0;
            list.push({
                id: t.slug,
                slug: t.slug,
                name: t.name,
                plan: t.plan ?? 'free',
                status: t.status ?? 'active',
                member_count: agg.memberCount.get(t.slug) ?? 0,
                created_at: t.createdAt,
                owner_last_login_at: null,
                owner_email: agg.ownerEmail.get(t.slug) ?? null,
                project_count: 0,
                active_resources: {
                    pages: agg.pages.get(t.slug) ?? 0,
                    workflows: agg.workflows.get(t.slug) ?? 0,
                    app_users: 0,
                },
                usage_stats: usageStats(current, await executionsLimitFor(runner, plan)),
            });
        }
        return c.json({ tenants: list });
    });

    // GET /api/admin/tenants/{tenant_id} — detail with the member list.
    app.get('/api/admin/tenants/:tenant_id', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        const tenantId = c.req.param('tenant_id');
        const tenant = await tenants.getTenant(tenantId);
        if (!tenant) return c.json({ detail: 'Tenant not found' }, 404);
        const monthStart = startOfMonth(now());
        const agg = await tenantAggregates(runner, monthStart);
        // Member rows with timestamps come straight from the table — listUsers'
        // public shape carries no created_at, and the detail view shows it.
        const memberRows = await runner.query(
            'SELECT id, email, role, created_at FROM users WHERE tenant_slug = ? ORDER BY created_at',
            [tenantId],
        );
        const memberList = memberRows.map((row) => ({
            id: String(row.id),
            user_id: String(row.id),
            email: String(row.email),
            role: String(row.role),
            created_at: String(row.created_at),
        }));
        const plan = (tenant.plan ?? 'free').toLowerCase();
        return c.json({
            tenant: {
                id: tenant.slug,
                slug: tenant.slug,
                name: tenant.name,
                plan: tenant.plan ?? 'free',
                status: tenant.status ?? 'active',
                member_count: memberList.length,
                created_at: tenant.createdAt,
                members: memberList,
                project_id: null,
                owner_last_login_at: null,
                owner_email: agg.ownerEmail.get(tenant.slug) ?? null,
                project_count: 0,
                active_resources: {
                    pages: agg.pages.get(tenant.slug) ?? 0,
                    workflows: agg.workflows.get(tenant.slug) ?? 0,
                    app_users: 0,
                },
                usage_stats: usageStats(agg.executions.get(tenant.slug) ?? 0, await executionsLimitFor(runner, plan)),
            },
        });
    });

    // POST /api/admin/tenants/ — provision a workspace (201). Product validates
    // its OWN way here (lowercase-then-check — unlike signup's raw-then-check),
    // with a shorter length message and NO reserved-slug guard. The framework
    // adds one narrow guard: the internal `_`-scopes + brand slug must never be
    // creatable — a tenant row there would shadow operator infrastructure.
    app.post('/api/admin/tenants/', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        const input = await c.req.json().catch(() => null);
        const parsed = zCreateTenantRequest.safeParse(input);
        if (!parsed.success) return c.json(fastApiValidationError('body', input, parsed.error.issues), 422);
        const slug = parsed.data.slug.toLowerCase().trim();
        if (slug.length < 3 || slug.length > 50) {
            return c.json({ detail: 'Slug must be 3-50 characters' }, 400);
        }
        if (!SLUG_RE.test(slug)) {
            return c.json({ detail: 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen' }, 400);
        }
        if (FRAMEWORK_RESERVED_SLUGS.has(slug)) {
            return c.json({ detail: `'${slug}' is a reserved name` }, 400);
        }
        if (await tenants.tenantExists(slug)) {
            return c.json({ detail: `Slug '${slug}' is already taken` }, 409);
        }
        const timestamp = now();
        await tenants.createTenant(slug, parsed.data.name, timestamp);
        await tenants.updateTenant(slug, { plan: parsed.data.plan, status: 'active' });
        // The workspace is live on creation — same contract as signup (WA3):
        // the default project's analog is the published homepage.
        await pagesFor?.(slug).ensureHomepage(timestamp);
        return c.json({
            tenant: {
                id: slug,
                slug,
                name: parsed.data.name,
                plan: parsed.data.plan,
                status: 'active',
                project_id: null,
            },
        }, 201);
    });

    // POST /api/admin/tenants/{tenant_id}/users — add a member. The ONLY path
    // that adds a 2nd+ member (signup creates the owner), so the free plan's
    // team_members cap lands here, deliberately exceedable via override_limit.
    app.post('/api/admin/tenants/:tenant_id/users', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        if (!userStoreFor) return c.json({ detail: 'User store unavailable' }, 501);
        const tenantId = c.req.param('tenant_id');
        const tenant = await tenants.getTenant(tenantId);
        if (!tenant) return c.json({ detail: 'Tenant not found' }, 404);
        const input = await c.req.json().catch(() => null);
        const parsed = zCreateTenantUserRequest.safeParse(input);
        if (!parsed.success) return c.json(fastApiValidationError('body', input, parsed.error.issues), 422);
        const body = parsed.data;
        // Free-tier seat cap (product F1). No plan ⇒ unlimited (framework
        // contract — plan-limits.mjs); the catalog's free plan caps at 1.
        if (!body.override_limit) {
            const limits = tenant.plan ? await catalogPlanLimits(runner, tenant.plan).catch(() => null) : null;
            const rawLimit = limits?.team_members;
            const teamLimit = typeof rawLimit === 'number' ? rawLimit : Number(rawLimit);
            const count = (await runner.query('SELECT COUNT(*) AS n FROM users WHERE tenant_slug = ?', [tenantId]))[0];
            const memberCount = Number(count?.n ?? 0);
            if (Number.isFinite(teamLimit) && memberCount >= teamLimit) {
                return c.json({
                    detail: `Tenant '${tenant.slug}' is on plan '${tenant.plan}', which allows `
                        + `${teamLimit} team member(s). Upgrade the plan or pass override_limit=true.`,
                }, 403);
            }
        }
        const email = body.email.trim().toLowerCase();
        if ((await userStoreFor('_default').findByEmailAnyTenant(email)).length > 0) {
            return c.json({ detail: `User with email '${email}' already exists` }, 409);
        }
        const timestamp = now();
        const user = await userStoreFor(tenantId).createUser({
            email,
            passwordHash: await hashPassword(body.password),
            role: body.role,
            now: timestamp,
        });
        return c.json({
            user: {
                id: user.id,
                email: user.email,
                username: body.username ?? email.split('@')[0],
                tenant_id: tenantId,
                role: user.role,
            },
        }, 201);
    });

    // PUT /api/admin/tenants/{tenant_id} — set name/plan/status.
    app.put('/api/admin/tenants/:tenant_id', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        const tenantId = c.req.param('tenant_id');
        const tenant = await tenants.getTenant(tenantId);
        if (!tenant) return c.json({ detail: 'Tenant not found' }, 404);
        const input = await c.req.json().catch(() => null);
        const parsed = zUpdateTenantRequest.safeParse(input);
        if (!parsed.success) return c.json(fastApiValidationError('body', input, parsed.error.issues), 422);
        const updated = await tenants.updateTenant(tenantId, {
            ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
            ...(parsed.data.plan != null ? { plan: parsed.data.plan } : {}),
            ...(parsed.data.status != null ? { status: parsed.data.status } : {}),
        });
        return c.json({
            success: true,
            tenant: {
                id: updated?.slug ?? tenantId,
                name: updated?.name ?? tenant.name,
                plan: updated?.plan ?? (tenant.plan ?? 'free'),
                status: updated?.status ?? (tenant.status ?? 'active'),
            },
        });
    });

    // DELETE /api/admin/tenants/{tenant_id} — SOFT delete: suspend, never drop
    // tenant data (hard delete + export is Phase 5).
    app.delete('/api/admin/tenants/:tenant_id', async (c) => {
        const denied = requireMaster(c);
        if (denied) return c.json(denied.body, denied.status);
        const tenantId = c.req.param('tenant_id');
        const tenant = await tenants.getTenant(tenantId);
        if (!tenant) return c.json({ detail: 'Tenant not found' }, 404);
        await tenants.updateTenant(tenantId, { status: 'suspended' });
        return c.json({ success: true, message: `Tenant '${tenant.slug}' suspended` });
    });
}
