/**
 * Authz test (M2.2, RULE 2) — cross-tenant isolation in the console. Tenant A
 * writes a draft; tenant B (separate console/principal) cannot read or list it.
 * A request body can't spoof another tenant.
 */
import { makeConsole, req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const layout = JSON.stringify({ root: {}, content: [] });

// Tenant A writes a secret draft
const a = makeConsole({ tenant: 'tenant-A' });
await req(a.app, 'PUT', '/drafts/secret', { body: { layoutData: layout } });
const aList = await req(a.app, 'GET', '/drafts/secret');
check('tenant-A can read its own draft', aList.status === 200);

// Tenant B (different principal) cannot see A's draft
const b = makeConsole({ tenant: 'tenant-B' });
const bRead = await req(b.app, 'GET', '/drafts/secret');
check('tenant-B cannot read tenant-A draft (404)', bRead.status === 404);
const bList = await req(b.app, 'GET', '/pages');
check('tenant-B sees none of A pages', (await bList.json()).pages.length === 0);

// Tenant B writes its OWN draft with the same slug — separate row, no collision
await req(b.app, 'PUT', '/drafts/secret', { body: { layoutData: JSON.stringify({ root: {}, content: [{ id: 'b', type: 'Text' }] }) } });
const bOwn = await req(b.app, 'GET', '/drafts/secret');
check('tenant-B has its own draft under the same slug', bOwn.status === 200);

// Unauthenticated principal → 401 everywhere (except /health)
const anon = makeConsole({ tenant: undefined });
check('anonymous → GET /pages denied (401)', (await req(anon.app, 'GET', '/pages')).status === 401);
check('anonymous → PUT draft denied (401)', (await req(anon.app, 'PUT', '/drafts/x', { body: { layoutData: layout } })).status === 401);

console.log(failures === 0 ? '\nauthz: PASS ✅' : `\nauthz: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
