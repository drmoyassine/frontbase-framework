/**
 * Seed gate (M-ID.1.4, D5) — idempotent: seeding twice yields ONE owner.
 * RULE 8: a mutation removing the count-check makes "exactly one owner" RED.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { UserStore, seedOwner } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const store = new UserStore(runner, '_default');

// 1. First seed → creates the owner
const r1 = await seedOwner(store, { email: 'admin@x.com', password: 'pw', now: '2026-07-11T00:00:00Z' });
check('first seed: seeded = true', r1.seeded === true);
check('after first seed: 1 user', await store.countUsers() === 1);

// 2. Second seed → no-op (idempotent — never resets, never duplicates)
const r2 = await seedOwner(store, { email: 'admin@x.com', password: 'different', now: '2026-07-11T00:00:01Z' });
check('second seed: seeded = false (idempotent)', r2.seeded === false);
check('after second seed: still 1 user (no duplicate)', await store.countUsers() === 1);

// 3. The original password is unchanged (seed never resets)
const user = await store.findByEmailForVerify('admin@x.com');
const { verifyPassword } = await import('@frontbase/edge-infra');
check('original password still works (seed never resets)', await verifyPassword('pw', user.passwordHash) === true);
check('second-seed password does NOT work', await verifyPassword('different', user.passwordHash) === false);

console.log(failures === 0 ? '\nseed: PASS ✅' : `\nseed: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
