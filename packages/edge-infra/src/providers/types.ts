/**
 * Provider type aliasing — RULE 6 (single-owner types). edge-core owns the
 * contracts; edge-infra imports and re-exports them. No structurally-similar
 * redeclarations (a redeclared type compiles in isolation and breaks at the
 * integration boundary — the DEV-1 class of bug).
 */
export type {
    DataProvider,
} from '@frontbase/edge-core';
export type {
    SiteManifest,
    RegisteredQuery,
    QueryContext,
    Principal,
} from '@frontbase/edge-core';

/**
 * The SQL runner a registered query's `execute` uses via `ctx.db`. This is the
 * ONLY data-access surface executors get — they write parameterized SQL and the
 * tenant predicate (Decision A-17: app-level `WHERE tenant = ctx.tenant`).
 */
export interface DbRunner {
    /** Run parameterized SQL; returns rows as plain objects. */
    query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    /** Run a statement (DDL/DML); returns the number of affected rows where the
     *  driver reports it (0 otherwise). */
    exec(sql: string, params?: unknown[]): Promise<number>;
}

/** A DataProvider that also exposes its raw client for tests/seeding. */
export interface DataProviderWithClient {
    kind: string;
    query: (queryId: string, params?: Record<string, unknown>, ctx?: import('@frontbase/edge-core').QueryContext) => Promise<Record<string, unknown>[]>;
    /** The underlying SQL runner — tests seed real rows through it. */
    db: DbRunner;
}

/** Enrich a QueryContext with the DB runner executors call. */
export type EnrichedQueryContext = import('@frontbase/edge-core').QueryContext & { db: DbRunner };
