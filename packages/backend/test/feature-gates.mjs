/**
 * Tier gating of engine import — the `engine_imports` plan feature flag
 * (product LIMIT_REGISTRY `kind: 'bool'` convention, default False).
 *
 * Community/free (no plan, or a plan without the flag) cannot import: the
 * bundle endpoint AND discovery-style creates (is_imported) both 403, while
 * deploys (plain creates) stay open. A plan with {"engine_imports": true}
 * unlocks both paths, and GET /api/tenants/me/plan reports the signal in the
 * product MyPlanResponse shape the console reads.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { Phase2Store } from '../dist/db/phase2-store.js';

const SECRET = 'test-secret-0123456789012345678901234567';

async function appWith(principal) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    return {
        app: await createCompatApp({
            makeRunner: async () => runner,
            resolvePrincipal: async () => principal,
            sessionSecret: SECRET,
            userStoreFor: (t) => new UserStore(runner, t),
        }),
        store: new Phase2Store(runner, 'tenant-A'),
    };
}
// /api/edge-* sits behind the privileged tenant-admin tier (compat/app.ts),
// so the principal carries an owner role — the gate under test is the plan
// flag, not the auth middleware.
const MEMBER = { user: { id: 'u1', role: 'owner' }, tenant: 'tenant-A' };
const ANON = { user: null, tenant: undefined };
const req = (app, m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined,
}));

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---- 1. Community (no plan): both import paths 403; deploys stay open ----
{
    const { app } = await appWith(MEMBER);
    // Mint a real FBENG1 bundle via the export route — the import gate must sit
    // behind envelope validation, so the 403 only fires for a decodable bundle.
    const created = await req(app, 'POST', '/api/edge-engines/', { name: 'Exported', url: 'https://engine.example' });
    const engineId = (await created.json()).id;
    const exported = await req(app, 'POST', `/api/edge-engines/${engineId}/export`, { passphrase: 'correct-horse' });
    const { bundle } = await exported.json();
    check('fixture bundle minted via export', exported.status === 200 && typeof bundle === 'string' && bundle.startsWith('FBENG1.'));

    const denied = await req(app, 'POST', '/api/edge-engines/import', { bundle, passphrase: 'correct-horse' });
    check('bundle import → 403 on community', denied.status === 403);
    check('403 carries the upgrade detail', (await denied.json()).detail === 'Engine import requires an upgraded plan');

    const discovered = await req(app, 'POST', '/api/edge-engines/', { name: 'Discovered', url: 'https://engine.example', is_imported: true });
    check('discovery import (is_imported) → 403 on community', discovered.status === 403);

    const deployed = await req(app, 'POST', '/api/edge-engines/', { name: 'Deployed', url: 'https://engine.example' });
    check('plain engine create (deploy wizard) stays open', deployed.status === 201);

    const corrupt = await req(app, 'POST', '/api/edge-engines/import', { bundle: 'garbage', passphrase: 'correct-horse' });
    check('corrupt bundle 400s before the gate', corrupt.status === 400
        && (await corrupt.json()).detail === 'Bundle is corrupt or has been tampered with');
    const v2 = `FBENG1.${btoa(JSON.stringify({ h: { v: 2 } }))}`;
    const mismatch = await req(app, 'POST', '/api/edge-engines/import', { bundle: v2, passphrase: 'correct-horse' });
    check('future bundle version 400s', mismatch.status === 400
        && (await mismatch.json()).detail === 'Bundle format version is not supported');
}

// ---- 2. me/plan — the console's plan signal ----
{
    const { app } = await appWith(MEMBER);
    const r = await req(app, 'GET', '/api/tenants/me/plan');
    const body = await r.json();
    check('me/plan → 200', r.status === 200);
    check('community plan by default', body.plan?.slug === 'community' && body.plan?.name === 'Community');
    check('MyPlanResponse shape (limits/usage/pending_request)', body.limits !== undefined && body.usage !== undefined && body.pending_request === null);

    const anonApp = (await appWith(ANON)).app;
    const anon = await req(anonApp, 'GET', '/api/tenants/me/plan');
    check('me/plan requires a session (401)', anon.status === 401);
}

// ---- 3. The admin plans API unlocks both paths ----
{
    const { app } = await appWith(MEMBER);
    const created = await req(app, 'POST', '/api/edge-engines/', { name: 'Portable', url: 'https://engine.example' });
    const engineId = (await created.json()).id;
    const exported = await req(app, 'POST', `/api/edge-engines/${engineId}/export`, { passphrase: 'correct-horse' });
    const { bundle } = await exported.json();

    // The operator unlock — the product-shaped master-admin surface.
    const dup = await req(app, 'POST', '/api/admin/plans', { slug: 'pro' });
    check('admin create requires slug + name (400)', dup.status === 400);
    const badLimits = await req(app, 'POST', '/api/admin/plans', { slug: 'pro', name: 'Pro', limits: { not_a_limit: true } });
    check('admin create rejects unknown limit keys (400)', badLimits.status === 400);
    const unlock = await req(app, 'POST', '/api/admin/plans', { slug: 'PRO', name: 'Pro', limits: { engine_imports: true } });
    const unlockBody = await unlock.json();
    check('admin create → 201 {plan}', unlock.status === 201 && unlockBody.plan?.slug === 'pro');
    const again = await req(app, 'POST', '/api/admin/plans', { slug: 'pro', name: 'Pro' });
    check('duplicate slug → 409', again.status === 409);

    const imported = await req(app, 'POST', '/api/edge-engines/import', { bundle, passphrase: 'correct-horse' });
    const importBody = await imported.json();
    check('bundle import allowed on paid plan', imported.status === 200 && typeof importBody.engine_id === 'string');
    check('ImportEngineResult shape (confirm_secret + summary)', typeof importBody.confirm_secret === 'string'
        && typeof importBody.summary === 'string');
    const roundTripped = await req(app, 'GET', `/api/edge-engines/${importBody.engine_id}`);
    check('imported engine round-trips its name', (await roundTripped.json()).name === 'Portable');

    const discovered = await req(app, 'POST', '/api/edge-engines/', { name: 'Discovered', url: 'https://engine.example', is_imported: true });
    check('discovery import allowed on paid plan', discovered.status === 201);

    const plan = await req(app, 'GET', '/api/tenants/me/plan');
    const planBody = await plan.json();
    check('me/plan reflects the assigned plan', planBody.plan?.slug === 'pro');
    check('me/plan exposes the feature flag', planBody.limits?.engine_imports === true);
}

console.log(failures === 0 ? '\nfeature-gates: PASS ✅' : `\nfeature-gates: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
