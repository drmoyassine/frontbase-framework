/** Shared test helpers — a controllable resolvePrincipal + console factory. */
import { createConsole } from '../dist/index.js';

export function principalFor(tenant) {
    return async () => ({ user: { id: tenant === undefined ? 'anon' : `user-${tenant}` }, tenant });
}

export function makeConsole({ tenant, dbUrl = ':memory:', queries = {} } = {}) {
    let clock = 0;
    return {
        app: createConsole({
            resolvePrincipal: principalFor(tenant),
            dbUrl,
            queries,
            now: () => `2026-07-10T00:00:${String(clock++).padStart(2, '0')}Z`,
        }),
        setTenant(t) { this.__tenant = t; },
    };
}

export async function req(app, method, path, { body, headers } = {}) {
    return app.fetch(new Request('http://console.local' + path, {
        method,
        headers: { 'content-type': 'application/json', ...(headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}
