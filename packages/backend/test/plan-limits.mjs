/**
 * Plan-limit enforcement gate (Phase 3c / F8c). Proves the `pages` and `users`
 * limits are enforced: operations over the cap return 402 limit_exceeded, and
 * unlimited (-1) / no-plan tenants are unaffected. Re-publishing an existing
 * page never trips the pages limit.
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    queries: {},
    now: () => `2026-07-12T00:00:${String(clock++).padStart(2, '0')}Z`,
});

const req = (method, path, body) => app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
}));

// ---- 1. No plan → unlimited (publish works freely) ----
const layout = JSON.stringify({ root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Hi' } }] });
await req('PUT', '/drafts/p1', { layoutData: layout });
const pub1 = await req('POST', '/publish/p1', { title: 'P1' });
check('publish works with no plan (unlimited)', pub1.status === 200);

// ---- 2. Assign a tight plan: 1 page, 1 user ----
await req('PUT', '/plans/mini', { name: 'Mini', priceCents: 100, limits: { pages: 1, users: 1 } });

// p1 already published (1 page) → a SECOND new publish should be blocked.
await req('PUT', '/drafts/p2', { layoutData: layout });
const pub2 = await req('POST', '/publish/p2', { title: 'P2' });
const pub2Body = await pub2.json();
check('2nd publish over pages=1 limit → 402', pub2.status === 402);
check('402 → limit_exceeded + limit:pages', pub2Body.error === 'limit_exceeded' && pub2Body.limit === 'pages');

// ---- 3. Re-publishing the EXISTING page p1 is allowed (not a new slot) ----
const repub = await req('POST', '/publish/p1', { title: 'P1 v2' });
check('re-publish existing page allowed (no new slot)', repub.status === 200);

// ---- 4. users limit: first invite consumes the slot; a second is blocked. ----
const invite1 = await req('POST', '/users', { email: 'a@x.com', role: 'owner' });
check('first user invite allowed (users=1)', invite1.status === 200);
const invite2 = await req('POST', '/users', { email: 'b@x.com', role: 'owner' });
check('second invite over users=1 → 402', invite2.status === 402);

// ---- 5. -1 (unlimited) lifts the cap ----
await req('PUT', '/plans/mini', { name: 'Mini', priceCents: 100, limits: { pages: -1, users: -1 } });
const pub3 = await req('POST', '/publish/p2', { title: 'P2' });
check('unlimited pages (-1) → publish allowed', pub3.status === 200);

console.log(failures === 0 ? '\nplan-limits: PASS ✅' : `\nplan-limits: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
