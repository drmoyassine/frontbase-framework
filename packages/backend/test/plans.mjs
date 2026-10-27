/**
 * Plans gate (Phase 3b / F8). CRUD over billing tiers, limits JSON round-trip.
 */
import { makeConsole, req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const { app } = await makeConsole({ tenant: 'tenant-A' });

// ---- 1. Create a plan ----
const put = await req(app, 'PUT', '/plans/starter', {
    body: { name: 'Starter', priceCents: 1900, interval: 'month', limits: { pages: 10, users: 3 } },
});
check('PUT plan → 200', put.status === 200);

// ---- 2. List parses limits JSON ----
const list = await req(app, 'GET', '/plans');
const listBody = await list.json();
check('plan listed', listBody.plans.length === 1);
check('plan name', listBody.plans[0].name === 'Starter');
check('price_cents stored', listBody.plans[0].price_cents === 1900);
check('limits parsed to object', listBody.plans[0].limits.pages === 10);

// ---- 3. Update (upsert) ----
await req(app, 'PUT', '/plans/starter', {
    body: { name: 'Starter Pro', priceCents: 2900, interval: 'month', limits: { pages: 25, users: 5 } },
});
const updated = await (await req(app, 'GET', '/plans')).json();
check('upsert updates name', updated.plans[0].name === 'Starter Pro');
check('upsert updates price', updated.plans[0].price_cents === 2900);
check('no duplicate (upsert not insert)', updated.plans.length === 1);

// ---- 4. Second plan ----
await req(app, 'PUT', '/plans/enterprise', {
    body: { name: 'Enterprise', priceCents: 9900, interval: 'year', limits: { pages: -1, users: -1 } },
});
const two = await (await req(app, 'GET', '/plans')).json();
check('two plans now', two.plans.length === 2);

// ---- 5. Validation: missing name → 400 ----
const bad = await req(app, 'PUT', '/plans/bad', { body: { priceCents: 100 } });
check('missing name → 400', bad.status === 400);

// ---- 6. Delete ----
await req(app, 'DELETE', '/plans/starter');
const after = await (await req(app, 'GET', '/plans')).json();
check('plan deleted', after.plans.length === 1 && after.plans[0].id === 'enterprise');

console.log(failures === 0 ? '\nplans: PASS ✅' : `\nplans: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
