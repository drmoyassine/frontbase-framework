/** Shared test helpers — a controllable resolvePrincipal + console factory.
 *  M-DB.0: builds ONE DbRunner, migrates it, and shares it across tenants (so
 *  `:memory:` tests and the shared-DB isolation test both work — the tenant
 *  predicate is the only separator). */
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

export function principalFor(tenant) {
    return async () => ({ user: { id: tenant === undefined ? 'anon' : `user-${tenant}` }, tenant });
}

/**
 * Build a console (async — runs migrations first). `principal` overrides
 * resolvePrincipal entirely (use it to isolate a specific auth guard — e.g.
 * { user: null, tenant: 'X' } exercises the user guard ALONE).
 */
export async function makeConsole({ tenant, dbUrl = ':memory:', queries = {}, principal } = {}) {
    const runner = sqliteRunner(dbUrl);
    await migrateUp(runner);
    let clock = 0;
    return {
        app: createConsole({
            makeRunner: async () => runner,
            resolvePrincipal: principal ? async () => principal : principalFor(tenant),
            queries,
            now: () => `2026-07-10T00:00:${String(clock++).padStart(2, '0')}Z`,
        }),
    };
}

export async function req(app, method, path, { body, headers } = {}) {
    return app.fetch(new Request('http://console.local' + path, {
        method,
        headers: { 'content-type': 'application/json', ...(headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}
