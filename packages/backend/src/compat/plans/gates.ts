/**
 * A-25 Phase 4 WA5 — the cloud plan gates. Free-tier enforcement lives in the
 * ROUTES (publish/engines/api-keys/invites), but the comparisons live HERE so
 * RULE 8 can mutate one narrow function per gate and watch the suite go red.
 *
 * Contract (plan §WA5): gates fire ONLY when the tenant has effective limits
 * (`getEffectiveLimits` non-null — the `_limits` setting, a per-tenant plan
 * row, or the `_global` catalog row for `tenants.plan`); null ⇒ unlimited ⇒
 * every gate off. `master_admin` bypasses every gate (product parity); -1 on a
 * numeric key means unlimited for that key; boolean feature flags gate with
 * 403 "not available on your current plan", numeric caps with 402
 * `limit_exceeded`.
 */
import type { DbRunner } from '@frontbase/edge-infra';

export type PlanLimits = Record<string, number | boolean>;

/** The caller's role off the request principal (undefined when anonymous). */
export function principalRole(c: { get(name: 'principal'): unknown }): string | undefined {
    const principal = c.get('principal') as { user?: { role?: string } | null } | undefined;
    const user = principal?.user;
    return user && typeof user === 'object' ? user.role : undefined;
}

/** Effective limits for THIS caller: the master admin is never gated (product
 *  master bypass); everyone else gets the tenant's limits (null ⇒ unlimited). */
export async function planLimitsForCaller(
    limitsFor: (tenant: string) => Promise<PlanLimits | null>,
    tenant: string,
    role: string | undefined,
): Promise<PlanLimits | null> {
    if (role === 'master_admin') return null;
    return await limitsFor(tenant);
}

/** UTC start of the month containing `at` — the window for monthly counters. */
export function startOfMonth(at: string): string {
    const ref = new Date(at);
    if (Number.isNaN(ref.getTime())) return '1970-01-01T00:00:00.000Z';
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1)).toISOString();
}

/** Published-version count for the tenant in the calendar month containing
 *  `at` (compat_page_versions rows labeled `Published …`). The documented
 *  approximation of "deploys" — publish() writes one such row per publish. */
export async function deploysThisMonth(runner: DbRunner, tenant: string, at: string): Promise<number> {
    const rows = await runner.query(
        "SELECT COUNT(*) AS n FROM compat_page_versions WHERE tenant_slug = ? AND label LIKE 'Publish%' AND created_at >= ?",
        [tenant, startOfMonth(at)],
    );
    return Number(rows[0]?.n ?? 0);
}

/**
 * The publish gate (`pages` + `deploys_monthly`) — returns the 402 body when
 * the publish must be refused, null when it may proceed.
 *
 * `pages`: a tenant OVER cap may not publish (their existing pages stay live —
 * no retroactive takedown — but anything pushing the footprint further is
 * locked). Holding exactly `cap` pages is allowed: the plan promises `cap`
 * pages, so page #`cap` publishes fine.
 * `deploys_monthly`: the (cap+1)-th publish in the calendar month is refused.
 */
export function publishGate(
    limits: PlanLimits | null,
    pageCount: number,
    deploysThisMonth: number,
): Record<string, unknown> | null {
    if (!limits) return null;
    const pages = limits.pages;
    if (typeof pages === 'number' && pages !== -1 && pageCount > pages) {
        return { detail: 'limit_exceeded', limit: 'pages' };
    }
    const deploys = limits.deploys_monthly;
    if (typeof deploys === 'number' && deploys !== -1 && deploysThisMonth >= deploys) {
        return { detail: 'limit_exceeded', limit: 'deploys_monthly' };
    }
    return null;
}

/**
 * The `edge_engines` cap at engine CREATE time (POST /api/edge-engines/ and
 * /deploy): creating one more engine must exceed the cap. The free plan's
 * `edge_engines: 0` means every stored-engine create is refused — the worker's
 * built-in system edge is unaffected (it is synthesized, never stored).
 */
export function engineCapExceeded(limits: PlanLimits | null, storedEngines: number): boolean {
    const cap = limits?.edge_engines;
    return typeof cap === 'number' && cap !== -1 && storedEngines >= cap;
}

/**
 * The `team_members` cap at invite time: inviting must exceed the cap (a
 * tenant already at `cap` members cannot invite one more).
 */
export function teamCapExceeded(limits: PlanLimits | null, memberCount: number): boolean {
    const cap = limits?.team_members;
    return typeof cap === 'number' && cap !== -1 && memberCount >= cap;
}

/** `private_pages: false` ⇒ the tenant may not make a page private (403). */
export function privatePagesBlocked(limits: PlanLimits | null): boolean {
    return limits?.private_pages === false;
}

/** `api_access: false` ⇒ the tenant may not mint edge API keys (403). */
export function apiAccessBlocked(limits: PlanLimits | null): boolean {
    return limits?.api_access === false;
}
