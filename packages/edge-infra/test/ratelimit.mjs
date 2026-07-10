/**
 * Rate limit test (M3.0.7, CF-16). RULE 4 opaque 429; RULE 2 keyed by resolved
 * principal (not client input). The mutation harness (test/mutation.mjs) proves
 * the limit-enforcement branch is real.
 */
import { consumeToken, rateLimitGuard, RATE_LIMITED_BODY } from '../dist/proxy/ratelimit.js';
import { memoryCache } from '../dist/cache/providers.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const principalA = { user: { id: 'alice' }, tenant: 'tenant-A' };
const principalB = { user: { id: 'bob' }, tenant: 'tenant-B' };

// limit=3 per window
const cfg = () => ({ limit: 3, windowSeconds: 60, cache: memoryCache() });

// 1. First `limit` requests allowed, then denied
const c1 = cfg();
const r1 = await consumeToken(c1, principalA);
const r2 = await consumeToken(c1, principalA);
const r3 = await consumeToken(c1, principalA);
const r4 = await consumeToken(c1, principalA);
check('requests 1-3 allowed', r1.allowed && r2.allowed && r3.allowed);
check('request 4 denied (over limit)', !r4.allowed && r4.remaining === 0);
check('remaining decrements (3→2→1→0)', r1.remaining === 2 && r2.remaining === 1 && r3.remaining === 0);

// 2. The guard returns an opaque 429 (RULE 4)
const denial = await rateLimitGuard(c1, principalA);
check('guard denies over-limit with 429', denial?.status === 429);
// Opaque = exactly {error:'rate_limited'}: only an `error` key, no bucket state
// (no numeric limit/remaining/count fields leaked).
check('429 body is opaque (only an error code, no bucket state)',
    JSON.stringify(denial?.body) === JSON.stringify(RATE_LIMITED_BODY)
    && Object.keys(denial?.body ?? {}).join(',') === 'error'
    && !('remaining' in (denial?.body ?? {})) && !('count' in (denial?.body ?? {})));

// 3. RULE 2: buckets are per-resolved-principal — A exhausting its bucket does
//    NOT throttle B (independent tenants/users).
const shared = cfg(); // ONE cache shared across principals (realistic)
await consumeToken(shared, principalA);
await consumeToken(shared, principalA);
await consumeToken(shared, principalA);
const aOver = await consumeToken(shared, principalA);
const bFirst = await consumeToken(shared, principalB);
check('tenant A over-limit does not affect tenant B (independent buckets)', !aOver.allowed && bFirst.allowed);

// 4. RULE 2: the bucket key comes from the RESOLVED principal, not any client
//    field — two calls with the SAME principal share a bucket regardless of
//    request content (there IS no client-supplied identity path here by design).
const c2 = cfg();
await consumeToken(c2, { user: { id: 'alice' }, tenant: 'tenant-A' });
await consumeToken(c2, { user: { id: 'alice' }, tenant: 'tenant-A' });
await consumeToken(c2, { user: { id: 'alice' }, tenant: 'tenant-A' });
const sameKey = await consumeToken(c2, { user: { id: 'alice' }, tenant: 'tenant-A' });
check('same resolved principal shares one bucket', !sameKey.allowed);

// 5. Allowed guard returns null (no denial)
const allowGuard = await rateLimitGuard(cfg(), principalA);
check('guard allows under-limit (null denial)', allowGuard === null);

console.log(failures === 0 ? '\nratelimit: PASS ✅' : `\nratelimit: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
