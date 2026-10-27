/**
 * Errors test (M2.2, RULE 4) — no route leaks an exception message, SQL, or
 * connection string to the client. A handler that throws returns an opaque code.
 */
import { createConsole } from '../dist/index.js';
import { req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A console whose store is unreachable — every store op throws a "connection refused" style error.
const app = await createConsole({
    resolvePrincipal: async () => ({ user: { id: 'u' }, tenant: 't' }),
    dbUrl: 'http://127.0.0.1:9/does-not-exist', // unreachable
    now: () => '2026-07-10T00:00:00Z',
});

const r = await req(app, 'GET', '/pages');
const body = await r.json();
check('store error → 500', r.status === 500);
check('error body is opaque (error code only)', body.error === 'internal_error');
check('no SQL / connection string leaked', !JSON.stringify(body).includes('127.0.0.1') && !JSON.stringify(body).includes('SELECT'));

console.log(failures === 0 ? '\nerrors: PASS ✅' : `\nerrors: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
