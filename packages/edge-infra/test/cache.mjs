/**
 * Cache test (M2.1.6) — RULE 3: a cache get returns a COPY, never the stored
 * reference. Plus TTL expiry, keys(pattern), incr/expire.
 */
import { memoryCache, nullCache } from '../dist/cache/providers.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const c = memoryCache();
await c.setex('rows', 60, JSON.stringify([{ a: 1 }]));

// RULE 3: two gets return distinct objects; mutating one doesn't affect the other
const a = await c.get('rows');
const b = await c.get('rows');
a[0].a = 999;
check('RULE 3: cache get returns a copy', b[0].a === 1);

// TTL: setex with 0s → expired on next read
await c.setex('ephemeral', 0, '"x"');
// (0s means expiresAt ≈ now; give it a tick)
await new Promise((r) => setTimeout(r, 5));
check('TTL expiry evicts on read', (await c.get('ephemeral')) === null);

// incr / expire
const n = await c.incr('counter');
check('incr returns 1 first', n === 1);
const n2 = await c.incr('counter');
check('incr returns 2 second', n2 === 2);

// keys(pattern)
await c.set('docs:1', '1'); await c.set('docs:2', '2'); await c.set('other', 'x');
const docs = (await c.keys('docs:*')).sort();
check('keys(pattern) matches prefix', docs.length === 2 && docs.every((k) => k.startsWith('docs:')));

// del
const deleted = await c.del('docs:1', 'docs:2');
check('del removes keys', deleted === 2 && (await c.keys('docs:*')).length === 0);

// nullCache is a no-op
check('nullCache.get → null', (await nullCache.get('anything')) === null);

console.log(failures === 0 ? '\ncache: PASS ✅' : `\ncache: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
