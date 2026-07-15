/**
 * CF-22 P1 / D2 — table-driven 501 stubs for every vendored community operation
 * that is NOT in the IMPLEMENTED registry. One `registerStubs` call wires all of
 * them; adding a stub is automatic (re-vendor the contract), removing one is a
 * deliberate deletion the drift gate catches as a MISSING endpoint.
 *
 * Stubs sit behind defaultDenyAuth (applied in the app factory) so RULE 2 holds
 * from day one even for unimplemented routes. Each returns 501 with the op key
 * so a caller (or the conformance suite) sees exactly what's pending.
 */
import { Hono } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import { productOps, toHonoPath, opKey } from './spec.js';

type HonoMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
const STUB_STATUS = 501;

/** Register a 501 stub for every product op NOT in `implemented`. Returns the
 *  set of op keys actually stubbed (for the drift-gate burn-down). */
export function registerStubs(
    app: Hono<{ Variables: ConsoleAuthVars }>,
    implemented: Set<string>,
): Set<string> {
    const stubbed = new Set<string>();
    for (const op of productOps()) {
        const key = opKey(op.method, op.path);
        if (implemented.has(key)) continue; // real handler owns this op
        // The bare GET / is the engine's eSSR root — never stub it (the engine owns it).
        if (op.method === 'get' && op.path === '/') continue;
        stubbed.add(key);
        const route = toHonoPath(op.path); // {id} → :id, drop trailing slash
        // app.on(method, path, handler) — uniform across verbs.
        app.on(op.method.toUpperCase() as HonoMethod, route, (c) =>
            c.json({ detail: 'not_implemented', op: key }, STUB_STATUS),
        );
    }
    return stubbed;
}
