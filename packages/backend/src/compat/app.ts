/**
 * CF-22 P1 / D2 — the product-compatible console surface.
 *
 * `createCompatApp()` returns a Hono app serving the product's /api/* paths:
 * real handlers for IMPLEMENTED ops (P1: the `variables` tag) and 501 stubs for
 * every other vendored community op. The whole surface sits behind defaultDenyAuth
 * (RULE 2 from day one). RULE 4 (opaque errors) via onError.
 *
 * The host mounts this SEPARATELY from the existing /api/console surface (the
 * product paths /api/<domain>/... are siblings of /api/console), coexisting
 * until P3 cuts the console SPA over to it. Migrations (incl. v7
 * template_variables) must be applied on the runner by the host before use, as
 * with createConsole.
 */
import { Hono } from 'hono';
import type { DbRunner } from '@frontbase/edge-infra';
import { defaultDenyAuth, type ConsoleAuthVars } from '../mw/auth.js';
import { opaqueErrors } from '../mw/errors.js';
import { registerStubs } from './stubs.js';
import { IMPLEMENTED } from './registry.js';
import { registerVariablesRoutes } from './routes/variables.js';
import { TemplateVariableStore } from './store.js';

export interface CreateCompatAppDeps {
    /** Build the DbRunner (env-aware). Called lazily; the app caches one runner. */
    makeRunner: () => Promise<DbRunner> | DbRunner;
    /** Resolve the calling principal (default-deny requires a real one). */
    resolvePrincipal: (req: Request) => Promise<{ user: unknown; tenant: string }>;
    /** Clock (deterministic in tests). Default: () => new Date().toISOString(). */
    now?: () => string;
}

export async function createCompatApp(deps: CreateCompatAppDeps): Promise<Hono<{ Variables: ConsoleAuthVars }>> {
    const now = deps.now ?? (() => new Date().toISOString());
    const runner = await deps.makeRunner();

    // Per-tenant template-variable store (migration v7). Single-tenant in
    // practice (community edition); the tenant comes from the auth context.
    const varStores = new Map<string, TemplateVariableStore>();
    const varStoreFor = (tenant: string): TemplateVariableStore => {
        let s = varStores.get(tenant);
        if (!s) { s = new TemplateVariableStore(runner, tenant); varStores.set(tenant, s); }
        return s;
    };

    const app = new Hono<{ Variables: ConsoleAuthVars }>();
    app.onError(opaqueErrors);

    // Everything requires an authenticated, tenant-scoped principal. Registered
    // BEFORE the routes: in Hono, app.use('*') guards only routes registered
    // after it. (P1 scope: every compat op is authed. Unauthenticated product
    // ops like /api/auth/login land in P2; their stubs currently 401, which is
    // safe — they're not implemented yet.)
    app.use('*', defaultDenyAuth(deps.resolvePrincipal as (req: Request) => Promise<any>));

    // Real handlers for implemented ops (P1: variables). Registered with the
    // exact product paths on the main app (no sub-app mount — that mismatches
    // trailing slashes, which the product client calls verbatim).
    registerVariablesRoutes(app, varStoreFor, now);

    // 501 stubs for every other vendored community op.
    registerStubs(app, IMPLEMENTED);

    return app;
}

export { IMPLEMENTED } from './registry.js';
export { buildFrameworkSpec, productOps, productSpec, productTag, opKey, toHonoPath } from './spec.js';
export { TemplateVariableStore } from './store.js';
export type { TemplateVariable } from './store.js';
