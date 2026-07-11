/**
 * Console CRUD + auth test (M2.2). Default-DENY: every route except /health
 * requires an authenticated principal. Tenant is taken from the session, never
 * the body.
 */
import { makeConsole, req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const { app } = await makeConsole({ tenant: 'tenant-A' });

// /health is the one open endpoint (liveness); auth is exercised in authz.mjs
check('/health open (liveness)', (await req(app, 'GET', '/health')).status === 200);

// The factory above authenticates as tenant-A, so CRUD works:
const layout = JSON.stringify({ root: {}, content: [{ id: 'h', type: 'Heading', props: { content: 'Hi', level: 'h1' } }] });
const put = await req(app, 'PUT', '/drafts/home', { body: { layoutData: layout } });
check('PUT draft → 200', put.status === 200);

const get = await req(app, 'GET', '/drafts/home');
check('GET draft returns stored layout', get.status === 200 && (await get.json()).draft.layoutData === layout);

// missing draft → not_found (opaque)
const nf = await req(app, 'GET', '/drafts/does-not-exist');
check('missing draft → 404 opaque', nf.status === 404 && (await nf.json()).error === 'not_found');

// validation: bad body → 400 opaque
const bad = await req(app, 'PUT', '/drafts/home', { body: { wrong: true } });
check('bad body → 400 opaque', bad.status === 400 && (await bad.json()).error === 'validation_failed');

// pages list is empty before publish (publish tested in publish.mjs)
const list = await req(app, 'GET', '/pages');
check('GET /pages → 200 (empty before publish)', list.status === 200 && (await list.json()).pages.length === 0);

console.log(failures === 0 ? '\nconsole: PASS ✅' : `\nconsole: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
