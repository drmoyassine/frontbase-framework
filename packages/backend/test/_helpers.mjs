/** Shared test helpers — a controllable resolvePrincipal + console factory. */
import { createConsole } from '../dist/index.js';

export function principalFor(tenant) {
    return async () => ({ user: { id: tenant === undefined ? 'anon' : `user-${tenant}` }, tenant });
}

/**
 * Build a console. `principal` overrides resolvePrincipal entirely (use it to
 * isolate a specific auth guard — e.g. { user: null, tenant: 'X' } exercises the
 * user guard ALONE, since the tenant guard would otherwise be the one rejecting).
 */
export function makeConsole({ tenant, dbUrl = ':memory:', queries = {}, principal } = {}) {
    let clock = 0;
    return {
        app: createConsole({
            resolvePrincipal: principal ? async () => principal : principalFor(tenant),
            dbUrl,
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
