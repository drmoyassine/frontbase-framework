/**
 * M2.1.4 — THE headline security gate: cross-tenant isolation, parameterized by
 * provider (A-17). SQLite runs every commit (authoritative for ALL providers
 * because the tenant predicate is the same app-level WHERE clause on each);
 * cloud providers run the IDENTICAL assertions when credentials are present.
 *
 * Asserts: tenant A and tenant B get disjoint result sets; A can never surface
 * a B row; the executor receives only its own tenant.
 */
import { forEveryProvider, seed, asDataProvider } from './_harness.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

await forEveryProvider(async (provider, label) => {
    await seed(provider.db);
    const data = asDataProvider(provider);

    // tenant A
    const aRows = await data.query('docs.list', {}, { tenant: 'tenant-A' });
    // tenant B
    const bRows = await data.query('docs.list', {}, { tenant: 'tenant-B' });

    check(`[${label}] tenant-A sees only A's rows`, aRows.length === 2 && aRows.every((r) => r.tenant === 'tenant-A'));
    check(`[${label}] tenant-B sees only B's rows`, bRows.length === 2 && bRows.every((r) => r.tenant === 'tenant-B'));

    // disjoint — the headline
    const aIds = new Set(aRows.map((r) => r.id));
    const bIds = new Set(bRows.map((r) => r.id));
    check(`[${label}] A and B result sets are DISJOINT`, [...aIds].every((id) => !bIds.has(id)));

    // a forged tenant in request PARAMS cannot override the resolved ctx.tenant
    // (the provider always uses ctx.tenant from resolvePrincipal, never client input)
    const spoofed = await data.query('docs.list', { tenant: 'tenant-B' }, { tenant: 'tenant-A' });
    check(`[${label}] ctx.tenant wins over client-supplied param tenant`, spoofed.every((r) => r.tenant === 'tenant-A'));

    // no tenant in context → executor's requireTenant throws → opaque error
    // (defense-in-depth: a tenant-scoped query reached without a resolved tenant
    //  fails closed; never leaks rows and never reveals WHY it failed — RULE 4)
    try {
        await data.query('docs.list', {}, {});
        check(`[${label}] no resolved tenant → opaque error (no leak)`, false);
    } catch (e) {
        check(`[${label}] no resolved tenant → opaque error (no leak)`, e.message === 'query_execution_failed');
    }
});

console.log(failures === 0 ? '\nisolation: PASS ✅' : `\nisolation: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
