/**
 * Tier gating of engine import — the `engine_imports` plan feature flag
 * (product LIMIT_REGISTRY `kind: 'bool'` convention, default False).
 *
 * Discovery-style metadata registration remains plan-gated. Unsupported
 * encrypted transfer is refused for every plan; upgrading cannot enable
 * the unsafe legacy base64 bundle implementation. Registration is not deployment.
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
    const created = await req(app, 'POST', '/api/edge-engines/', { name: 'Exported', url: 'https://engine.example' });
    const engineId = (await created.json()).id;
    const exported = await req(app, 'POST', `/api/edge-engines/${engineId}/export`, { passphrase: 'correct-horse' });
    const { bundle } = await exported.json();
    check('unsupported export creates no bundle', exported.status === 501 && bundle === undefined);

    const denied = await req(app, 'POST', '/api/edge-engines/import', { bundle: bundle ?? 'FBENG1.synthetic-unsupported', passphrase: 'correct-horse' });
    check('unsupported bundle import refused on community', denied.status === 501);
    check('refusal carries explicit unsupported code', (await denied.json()).code === 'engine_transfer_unsupported');

    const discovered = await req(app, 'POST', '/api/edge-engines/', { name: 'Discovered', url: 'https://engine.example', is_imported: true });
    check('discovery import (is_imported) → 403 on community', discovered.status === 403);

    const deployed = await req(app, 'POST', '/api/edge-engines/', { name: 'Deployed', url: 'https://engine.example' });
    check('plain engine metadata registration stays open', deployed.status === 201);

    const corrupt = await req(app, 'POST', '/api/edge-engines/import', { bundle: 'garbage', passphrase: 'correct-horse' });
    check('corrupt bundle is never parsed as a supported transfer', corrupt.status === 501
        && (await corrupt.json()).code === 'engine_transfer_unsupported');
    const v2 = `FBENG1.${btoa(JSON.stringify({ h: { v: 2 } }))}`;
    const mismatch = await req(app, 'POST', '/api/edge-engines/import', { bundle: v2, passphrase: 'correct-horse' });
    check('future bundle is refused without inventing format support', mismatch.status === 501
        && (await mismatch.json()).code === 'engine_transfer_unsupported');
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

    const imported = await req(app, 'POST', '/api/edge-engines/import', { bundle: bundle ?? 'FBENG1.synthetic-unsupported', passphrase: 'correct-horse' });
    const importBody = await imported.json();
    check('paid plan cannot unlock unsupported transfer', imported.status === 501 && importBody.code === 'engine_transfer_unsupported');
    check('refusal returns no imported id or secret', importBody.engine_id === undefined && importBody.confirm_secret === undefined);
    const roundTripped = await req(app, 'GET', `/api/edge-engines/${engineId}`);
    check('refused import preserves existing engine', (await roundTripped.json()).name === 'Portable');

    const discovered = await req(app, 'POST', '/api/edge-engines/', { name: 'Discovered', url: 'https://engine.example', is_imported: true });
    check('discovery import allowed on paid plan', discovered.status === 201);

    const plan = await req(app, 'GET', '/api/tenants/me/plan');
    const planBody = await plan.json();
    check('me/plan reflects the assigned plan', planBody.plan?.slug === 'pro');
    check('me/plan exposes the feature flag', planBody.limits?.engine_imports === true);
}

console.log(failures === 0 ? '\nfeature-gates: PASS ✅' : `\nfeature-gates: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
