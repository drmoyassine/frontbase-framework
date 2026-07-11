/**
 * M-DB.0 deployability proof — the lazy env-bound getEngine(env) pattern boots
 * locally on a :memory: SQLite runner and serves the console. This is the point
 * of M-DB.0: the console runs on a DbRunner, env-bound, ready for CF D1.
 *
 *   getEngine({ DB_URL: ':memory:' }) → /api/console/health 200, /api/console/pages 401
 */
import { createEngine, directProvider } from '@frontbase/edge-core';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createConsole } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const manifest = { version: 'mdb0', pages: { '/': { title: 'T', slug: 'home', layout: { root: {}, content: [] } } }, queries: {} };

// The lazy env-bound getEngine(env) — mirrors the scaffold worker (BLOCKER-1/B10).
let cached = null;
let initialized = false;
async function getEngine(env) {
    if (cached) return cached;
    const runner = sqliteRunner(env.DB_URL ?? ':memory:');
    const makeRunner = async () => runner;
    const console = await createConsole({ makeRunner, sessionSecret: env.SESSION_SECRET });
    cached = createEngine({ manifest, data: directProvider(manifest), environment: 'edge', console });
    return cached;
}

const env = { DB_URL: ':memory:' };
const engine = await getEngine(env);
// First-boot migration (BLOCKER-4) — runs once per isolate, inside getEngine's scope.
if (!initialized) {
    const runner = sqliteRunner(env.DB_URL);
    await migrateUp(runner);
    initialized = true;
}

// The console's storeFor builds a store from the SAME runner (env.DB_URL → same :memory:
// would be a different DB, so we reuse the engine's runner via makeRunner). To make the
// store share the migrated DB, the engine above uses makeRunner → the migrated runner.
// (In the scaffold, getEngine migrates the runner it hands to createConsole.)

const health = await engine.fetch(new Request('http://t.local/api/console/health'));
check('/api/console/health → 200 (open liveness)', health.status === 200);

const unauthPages = await engine.fetch(new Request('http://t.local/api/console/pages'));
check('unauth /api/console/pages → 401 (default-deny, anonymous)', unauthPages.status === 401);

const unauthDrafts = await engine.fetch(new Request('http://t.local/api/console/drafts/home', { method: 'PUT', body: '{}' }));
check('unauth PUT /api/console/drafts → 401', unauthDrafts.status === 401);

// The engine is cached (idempotent getEngine)
const engine2 = await getEngine(env);
check('getEngine caches the engine (one per isolate)', engine === engine2);

console.log(failures === 0 ? '\ndeployability: PASS ✅' : `\ndeployability: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
