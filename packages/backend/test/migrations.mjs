/**
 * Migration runner test (M3.0.5, CF-11). The acceptance contract:
 *   - apply → rollback → re-apply leaves the schema IDENTICAL;
 *   - a fresh DB and an upgraded DB converge to the same schema;
 *   - the runner is idempotent (re-apply is a no-op);
 *   - rollback actually removes the tables.
 *
 * Uses real libsql :memory: clients (schema fingerprint from sqlite_master).
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { MIGRATIONS, migrateUp, migrateDown, appliedVersions, schemaFingerprint } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };
const clock = () => '2026-07-10T00:00:00Z';

// 1. Fresh apply (M-DB.0: migrations run via a DbRunner)
const a = sqliteRunner(':memory:');
const appliedA = await migrateUp(a, clock);
check('apply runs the pending migrations', appliedA.length >= 1);
const fpApplied = await schemaFingerprint(a);
check('applied schema is non-empty (tables created)', fpApplied.includes('published_pages') && fpApplied.includes('drafts') && fpApplied.includes('workflows'));

// 2. Idempotent re-apply is a no-op
const appliedAgain = await migrateUp(a, clock);
check('re-apply is a no-op (idempotent)', appliedAgain.length === 0);
check('schema unchanged after no-op re-apply', (await schemaFingerprint(a)) === fpApplied);

// 3. apply → rollback → re-apply converges to the same schema
//    (rollback ALL — 8 migrations: v1 schema, v2 users, v3 tenants, v4 phase2, v5 phase3b,
//     v6 execution_input, v7 template_variables [CF-22 P1], v8 themes+security_events [P2 W1])
await migrateDown(a, MIGRATIONS.length);
const fpAfterDown = await schemaFingerprint(a);
check('rollback removes the tables', !fpAfterDown.includes('published_pages') && !fpAfterDown.includes('drafts'));
check('rollback clears the applied version', (await appliedVersions(a)).length === 0);
await migrateUp(a, clock);
const fpReapplied = await schemaFingerprint(a);
check('apply→rollback→re-apply converges (schema identical)', fpReapplied === fpApplied);

// 4. A fresh DB and an upgraded DB converge to the same schema
const b = sqliteRunner(':memory:');
await migrateUp(b, clock);
check('fresh DB schema == upgraded DB schema', (await schemaFingerprint(b)) === fpApplied);

// 5. Applied-versions tracking is correct
check('applied versions recorded ascending', JSON.stringify(await appliedVersions(a)) === JSON.stringify(MIGRATIONS.map((migration) => migration.version)));

console.log(failures === 0 ? '\nmigrations: PASS ✅' : `\nmigrations: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
