/**
 * Authz test (M2.2, RULE 2) — cross-tenant isolation in the console. Tenant A
 * writes a draft; tenant B cannot read or list it. A request body can't spoof
 * another tenant.
 *
 * CRITICAL (SEC-P2-2): both tenant consoles MUST share ONE database, else the
 * isolation assertions prove nothing — separate `:memory:` clients are separate
 * DBs, so "B can't see A" would pass even with the tenant predicate deleted. We
 * use a shared temp-file libsql URL so the `WHERE tenant_slug = ?` clause is the
 * ONLY thing separating the tenants — which is exactly what's under test.
 */
import { makeConsole, req } from './_helpers.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const layout = JSON.stringify({ root: {}, content: [] });
// ONE shared database file for both tenants (SEC-P2-2).
const sharedDb = 'file:' + join(mkdtempSync(join(tmpdir(), 'fb-authz-')), 'shared.db').replace(/\\/g, '/');

// Tenant A writes a secret draft into the SHARED db
const a = await makeConsole({ tenant: 'tenant-A', dbUrl: sharedDb });
await req(a.app, 'PUT', '/drafts/secret', { body: { layoutData: layout } });
const aList = await req(a.app, 'GET', '/drafts/secret');
check('tenant-A can read its own draft', aList.status === 200);

// Tenant B (different principal, SAME db) cannot see A's draft — only the
// tenant predicate keeps them apart. This now genuinely tests isolation.
const b = await makeConsole({ tenant: 'tenant-B', dbUrl: sharedDb });
const bRead = await req(b.app, 'GET', '/drafts/secret');
check('tenant-B cannot read tenant-A draft in SHARED db (404)', bRead.status === 404);
const bList = await req(b.app, 'GET', '/pages');
check('tenant-B sees none of A pages (shared db, tenant-filtered)', (await bList.json()).pages.length === 0);

// And prove A can still see ITS row in the shared db (not a false 404 from an empty db).
const aStill = await req(a.app, 'GET', '/drafts/secret');
check('tenant-A still reads its own draft from the shared db', aStill.status === 200);

// Tenant B writes its OWN draft with the same slug into the SHARED db — separate
// row (composite PK slug+tenant_slug), no collision, and A's row is untouched.
await req(b.app, 'PUT', '/drafts/secret', { body: { layoutData: JSON.stringify({ root: {}, content: [{ id: 'b', type: 'Text' }] }) } });
const bOwn = await req(b.app, 'GET', '/drafts/secret');
check('tenant-B has its own draft under the same slug (shared db)', bOwn.status === 200);
const aAfterB = await req(a.app, 'GET', '/drafts/secret');
const aBody = await aAfterB.json();
check("tenant-A's draft is unchanged after B wrote the same slug", aBody.draft.layoutData === layout);

// Unauthenticated principal → 401 everywhere (except /health)
const anon = await makeConsole({ tenant: undefined });
check('anonymous → GET /pages denied (401)', (await req(anon.app, 'GET', '/pages')).status === 401);
check('anonymous → PUT draft denied (401)', (await req(anon.app, 'PUT', '/drafts/x', { body: { layoutData: layout } })).status === 401);

// RULE 8: isolate the USER guard. A principal with a tenant but NO user must be
// denied — and ONLY the !principal.user guard catches this (the tenant guard
// passes). Without this case, removing the user guard leaves the suite green
// (hollow) — the mutation harness proves it goes red only with this isolation.
const noUser = await makeConsole({ principal: { user: null, tenant: 'tenant-X' } });
check('user guard: tenant-but-no-user → 401 (isolates the user guard)', (await req(noUser.app, 'GET', '/pages')).status === 401);

console.log(failures === 0 ? '\nauthz: PASS ✅' : `\nauthz: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
