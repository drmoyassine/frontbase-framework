/**
 * Session gate (M-ID.1.2, D2) — issueSession + createResolvePrincipal round-trip
 * + RULE 8 forgery (wrong secret → rejected).
 */
import { issueSession } from '../dist/proxy/session.js';
import { createResolvePrincipal } from '../dist/proxy/auth.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const SECRET = 'test-session-secret';
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'user-1', email: 'a@b.com', role: 'owner', tenant_slug: '_default' };

// 1. A session issued with S is accepted by resolvePrincipal({jwtSecret:S})
const token = await issueSession(claims, SECRET, now);
const resolve = createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'fb_session' });
const req = (cookie) => new Request('http://t.local/', { headers: { cookie } });
const principal = await resolve(req(`fb_session=${token}`));
check('issued session accepted → principal.user.id', principal.user?.id === 'user-1');
check('principal.tenant from claim', principal.tenant === '_default');
check('principal.user.role rides the JWT (D9)', principal.user?.role === 'owner');
check('principal.user.email rides the JWT', principal.user?.email === 'a@b.com');

// 2. RULE 8 — forgery: a token signed with a DIFFERENT secret → rejected (null principal)
const forged = await issueSession(claims, 'wrong-secret', now);
const forgedP = await resolve(req(`fb_session=${forged}`));
check('forgery: wrong-secret token → null principal', forgedP.user === null);

// 3. Expired token → rejected
const expired = await issueSession(claims, SECRET, now - 8 * 24 * 3600);
const expiredP = await resolve(req(`fb_session=${expired}`));
check('expired token → null principal', expiredP.user === null);

// 4. No cookie → anonymous
const anon = await resolve(new Request('http://t.local/'));
check('no cookie → anonymous', anon.user === null);

console.log(failures === 0 ? '\nsession: PASS ✅' : `\nsession: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
