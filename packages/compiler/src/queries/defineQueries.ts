/**
 * Query authoring API — Decision A-16 (registered-query model).
 *
 * Code-first (M1.2 MVP): projects export `defineQueries({...})`; the compiler's
 * registrar collects these into the site manifest at build time. The builder UI
 * (Phase 2) emits the SAME manifest artifact at publish time — one registry.
 *
 * `execute` is server-side only (runs with edge secrets). The browser / SW
 * projection strips it — the SW sees only `{queryId, params, scope, ttl}`.
 */
import type { ZodTypeAny } from 'zod';

/** Execution context handed to a query on the edge. */
export interface QueryContext {
    request?: Request;
    user?: unknown | null;
    tenant?: string;
}

export interface QueryDef<P = Record<string, unknown>> {
    /** Zod schema; the Edge Data Proxy validates params before execution (400 on failure). */
    params?: ZodTypeAny;
    scope?: 'public' | 'tenant' | 'user';
    ttlSeconds?: number;
    /** Server-side executor (edge only). Never ships to the browser. */
    execute: (params: P, ctx: QueryContext) => Promise<Record<string, unknown>[]>;
    /** Static rows — static sites/tests, used when `execute` is absent. */
    rows?: Record<string, unknown>[];
}

/**
 * Authoring entry point. Returns the definitions verbatim — the registrar
 * does the manifest assembly. Provided so projects have a stable import and
 * the compiler can detect query modules by this call site.
 */
export function defineQueries<P extends Record<string, QueryDef>>(
    defs: P,
): P {
    return defs;
}

export type QueryRegistry = Record<string, QueryDef>;
