/**
 * CF-22 Gate 1 — `x-implemented` is derived, not declared.
 *
 * Until now a hand-maintained registry of 285 op keys decided both which ops got
 * a 501 stub and what the emitted spec claimed. Nothing verified it against the
 * app: an op listed there but never wired would emit a spec advertising an
 * endpoint that 404s, and every gate would stay green.
 *
 * `routedOps(app)` reads Hono's route table instead, so "implemented" means "a
 * handler is registered" by construction. These cases prove the properties that
 * makes safe.
 */
import { Hono } from 'hono';
import { createCompatApp, routedOps, implementedOps, opKey, productOps } from '../dist/compat/app.js';
import { canonicalSlashVariant } from '../dist/compat/spec.js';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { sqliteRunner } from '@frontbase/edge-infra';

let failures = 0;
const check = (label, fn) => {
    try { fn() ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${e.message}`); }
};

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const build = (extra = {}) => createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'o', email: 'o@x.com', role: 'master_admin' }, tenant: '_default' }),
    now: () => '2026-01-01T00:00:00.000Z',
    ...extra,
});

const full = await build({ sessionSecret: 's'.repeat(32), userStoreFor: (t) => new UserStore(runner, t) });
const derived = implementedOps(full);
const contract = new Set(productOps().map((o) => opKey(o.method, o.path)));

console.log('routed-ops — x-implemented is derived from real handlers:');

check('derives a non-trivial set of the contract surface', () => derived.size > 250 && derived.size <= contract.size);

check('every derived op exists in the vendored contract (no invented endpoints)',
    () => [...derived].every((k) => contract.has(k)));

// The failure this replaces: a registry entry with no handler behind it.
check('an op with no registered handler is NOT reported as implemented', () => {
    const bare = new Hono();
    bare.get('/api/variables/', (c) => c.json({}));
    const only = routedOps(bare);
    return only.size === 1 && only.has(opKey('GET', '/api/variables/'));
});

// Middleware is registered as ALL /* and must never be mistaken for an endpoint.
check('middleware and wildcard mounts are excluded', () => {
    const mw = new Hono();
    mw.use('*', async (_c, next) => next());
    mw.all('/api/*', (c) => c.json({}));
    return routedOps(mw).size === 0;
});

// A path registered with a param name the contract does not use is a real bug
// (the client calls the contract's path). It must not count as implemented.
check('a mismatched param name does not count as implemented', () => {
    const wrong = new Hono();
    wrong.get('/api/variables/:wrong_name', (c) => c.json({}));
    return routedOps(wrong).size === 0;
});

// Config-dependence is a property, not an accident: the auth surface only exists
// when its deps are supplied, and the derived set must reflect that honestly.
const unconfigured = await build();
check('unconfigured app derives strictly fewer ops than the configured one', () => {
    const lean = implementedOps(unconfigured);
    return lean.size < derived.size
        && !lean.has(opKey('GET', '/api/auth/me'))
        && derived.has(opKey('GET', '/api/auth/me'));
});

// The trap this file caught while being written: a 501 stub is a Hono route like
// any other, so deriving from a FINISHED app counts stubs as implemented. Today
// the configured app registers zero stubs (its only unimplemented op is GET /,
// which registerStubs deliberately skips), so the mistake is latent — it would
// activate the moment re-vendoring introduces an op with no handler. The
// unconfigured app DOES stub ~20 auth ops, so it exercises the real thing.
check('the captured set excludes 501 stubs layered on afterwards', () => {
    const captured = implementedOps(unconfigured);
    const afterStubs = routedOps(unconfigured); // includes the stubs
    return afterStubs.size > captured.size
        && afterStubs.has(opKey('GET', '/api/auth/me'))   // stubbed, so routed
        && !captured.has(opKey('GET', '/api/auth/me'));   // but NOT implemented
});

// A literal path the console calls WITHOUT its trailing slash can be swallowed by a
// templated sibling: `/api/variables/registry` matches `/api/variables/{variable_id}`,
// so the slash reconciler saw "this matches the contract" and left it alone, and the
// by-id handler answered 404 for a variable named "registry". It reached a live
// deployment because every in-process gate requests the EXACT contract path, and the
// browser suite never opened the two screens involved.
//
// Checked across the whole contract rather than the two known cases, so re-vendoring
// cannot introduce a third silently.
check('no literal path is shadowed by a templated sibling', () => {
    const unique = [...new Set([...productOps()].map((op) => op.path))];
    const templates = unique.filter((p) => p.includes('{')).map((p) => new RegExp(
        `^${p.replace(/\{[^}]+\}/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .split(' ').join('[^/]+')}$`,
    ));
    const broken = [];
    for (const literal of unique.filter((p) => !p.includes('{'))) {
        const variant = literal.endsWith('/') ? literal.slice(0, -1) : `${literal}/`;
        if (!templates.some((re) => re.test(variant))) continue;
        // Shadowed — the reconciler must still resolve it to the literal.
        if (canonicalSlashVariant(variant) !== literal) broken.push(variant);
    }
    if (broken.length) console.log(`     shadowed and unreconciled: ${broken.join(', ')}`);
    return broken.length === 0;
});

console.log(failures === 0 ? '\nrouted-ops: PASS ✅' : `\nrouted-ops: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
