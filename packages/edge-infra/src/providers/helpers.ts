/**
 * Tenant-scoping helpers — Decision A-17. The guarantee is application-level
 * (every registered query's `execute` writes `WHERE tenant = ctx.tenant`); this
 * is defense-in-depth behind the proxy's `enforceScope`.
 */
import type { QueryContext } from '@frontbase/edge-core';

/**
 * Throw if a tenant/user-scoped query reached execution without a resolved
 * tenant. Behind `enforceScope` (proxy) this should never fire — but a provider
 * that bypasses the proxy (e.g. the console calling directly) must still check.
 * The thrown error is caught by the provider and surfaced as an opaque 500.
 */
export function requireTenant(ctx: QueryContext | undefined): string {
    const tenant = ctx?.tenant;
    if (!tenant) {
        // Opaque — never reveal that the issue is a missing tenant vs anything else.
        throw new Error('principal_context_required');
    }
    return tenant;
}

/** Defensive copy of rows — RULE 3: never hand out shared/cached references. */
export function copyRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((r) => ({ ...r }));
}
