/**
 * M-ID.1 login e2e — the headline identity gate. Seed owner → login → cookie →
 * authenticated access → /me → wrong password/unknown email (opaque 401) → logout.
 * RULE 8: the password-verify mutation (return true) makes "wrong password → 401" RED.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createConsole, UserStore, seedOwner } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const userStore = new UserStore(runner, '_default');
await seedOwner(userStore, { email: 'admin@test.com', password: 'pw12345', now: '2026-07-11T00:00:00Z' });

const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-session-secret' });

const req = (path, init) => app.fetch(new Request('http://c.local' + path, init));

// 1. Unauthenticated → denied
check('unauth /pages → 401', (await req('/pages')).status === 401);

// 2. Login with seeded creds → 200 + Set-Cookie
const loginRes = await req('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.com', password: 'pw12345' }) });
check('login → 200', loginRes.status === 200);
const setCookie = loginRes.headers.get('set-cookie') ?? '';
check('login sets fb_session cookie', setCookie.includes('fb_session='));
check('cookie is HttpOnly + SameSite=Lax', setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Lax'));
const loginBody = await loginRes.json();
check('login response has user {id,email,role}', loginBody.user?.email === 'admin@test.com' && loginBody.user?.role === 'owner');
check('login response has NO password_hash (D8)', !JSON.stringify(loginBody).includes('password_hash'));

// 3. Same cookie → authenticated
const cookie = setCookie.split(';')[0];
const authedPages = await req('/pages', { headers: { cookie } });
check('authed /pages → 200 (cookie accepted)', authedPages.status === 200);

// 4. /me → current user (no hash)
const me = await req('/me', { headers: { cookie } });
check('/me → 200', me.status === 200);
const meBody = await me.json();
check('/me returns user without hash', meBody.user?.email === 'admin@test.com' && !JSON.stringify(meBody).includes('password_hash'));

// 5. Wrong password → 401 (opaque — same as unknown email)
const wrongPw = await req('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.com', password: 'wrong' }) });
check('wrong password → 401', wrongPw.status === 401);
check('wrong password → opaque invalid_credentials', (await wrongPw.json()).error === 'invalid_credentials');

// 6. Unknown email → 401 (same response — RULE 4, no user enumeration)
const unknownEmail = await req('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@test.com', password: 'whatever' }) });
check('unknown email → same opaque 401', unknownEmail.status === 401 && (await unknownEmail.json()).error === 'invalid_credentials');

// 7. Logout clears the cookie
const logout = await req('/logout', { method: 'POST', headers: { cookie } });
check('logout → clears cookie', (logout.headers.get('set-cookie') ?? '').includes('Max-Age=0'));

console.log(failures === 0 ? '\nlogin-e2e: PASS ✅' : `\nlogin-e2e: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
