/**
 * backend mutation harness (RULE 8). Proves each security guarantee real by
 * breaking it and watching its gate go RED:
 *   - authz tenant predicate (drop WHERE tenant → cross-tenant read)
 *   - default-deny middleware (remove !principal.user guard → anon access)
 *   - opaque errors (return raw err.message → detail leak)
 *   - seed idempotency (remove the count-check → a second owner is created)
 *   - hash no-leak (login returns password_hash → the D8 assertion fires)
 *   - canActOnTenant (always-true → a tenant_admin reaches another tenant)
 *   - setup single-winner lock (remove the compare-and-set predicate → concurrent takeover)
 *   - setup capability validation (accept a bad claim → first-visitor takeover)
 */
import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';

const PKG = '@frontbase/backend';
const pkgDir = repoRoot + 'packages/backend/';
const STORE = 'packages/backend/src/db/store.ts';
const AUTH = 'packages/backend/src/mw/auth.ts';
const ERRORS = 'packages/backend/src/mw/errors.ts';
const SEED = 'packages/backend/src/auth/seed.ts';
const LOGIN = 'packages/backend/src/auth/routes.ts';
const ROLES = 'packages/backend/src/auth/roles.ts';
const SETUP = 'packages/backend/src/routes/setup.ts';
const BACKEND_INDEX = 'packages/backend/src/index.ts';
const PHASE2STORE = 'packages/backend/src/db/phase2-store.ts';
const COMPAT_EDGE_MISC = 'packages/backend/src/compat/routes/edge-misc.ts';
const COMPAT_EDGE_GENERIC = 'packages/backend/src/compat/routes/edge-generic.ts';
const COMPAT_STORE = 'packages/backend/src/compat/store.ts';
const COMPAT_APP = 'packages/backend/src/compat/app.ts';
const TENANCY_SERVING = 'packages/backend/src/tenancy/serving.ts';
const COMPAT_ADMIN_TENANTS = 'packages/backend/src/compat/routes/admin-tenants.ts';
const COMPAT_RATE_LIMIT = 'packages/backend/src/compat/rate-limit-store.ts';
const COMPAT_GATES = 'packages/backend/src/compat/plans/gates.ts';

console.log('— backend mutation harness —\n');
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
for (const g of [
    'authz',
    'errors',
    'seed',
    'login-e2e',
    'provision',
    'setup',
    'durable-execution',
    'compat-security',
    'compat-behavior-auth',
    'compat-negative',
    'compat-tenant-matrix',
    'edge-defaults',
    'admin-tenants',
    'cloud-serving',
    'cloud-plan-gates',
    'cloud-rate-limit',
]) {
    const args = g === 'compat-behavior-auth' ? ['--gate'] : [];
    if (runGate(pkgDir, `test/${g}.mjs`, args) !== 0) {
        console.log(`baseline ${g} RED — fix first`);
        process.exit(2);
    }
}
console.log('baseline: core + compat security/fuzz/tenant gates GREEN\n');

// 1. Drop the tenant predicate from getDraft → cross-tenant read (SHARED db).
await withSourceMutation(
    'authz: tenant predicate in getDraft',
    STORE,
    "'SELECT layout_data FROM drafts WHERE slug = ? AND tenant_slug = ?', [slug, this.tenant]",
    "'SELECT layout_data FROM drafts WHERE slug = ?', [slug]",
    async () => {
        buildPackage(PKG);
        expectRed('authz: goes red when the tenant predicate is dropped', runGate(pkgDir, 'test/authz.mjs'));
    },
);

// 2. Remove the default-deny guard → anon reaches /pages.
await withSourceMutation(
    'authz: default-deny middleware',
    AUTH,
    "        if (!principal.user) {\n            return c.json({ detail: 'Authentication required' }, 401);\n        }",
    "        /* MUTATION: deny removed */",
    async () => {
        buildPackage(PKG);
        expectRed('authz: goes red when the default-deny guard is removed', runGate(pkgDir, 'test/authz.mjs'));
    },
);

// 3. Return raw err.message → opaque-errors gate catches the leak.
await withSourceMutation(
    'errors: opaque envelope',
    ERRORS,
    'return c.json({ error: code }, status);',
    'return c.json({ error: (err && err.message) ? err.message : code }, status);',
    async () => {
        buildPackage(PKG);
        expectRed('errors: goes red when raw err.message is returned', runGate(pkgDir, 'test/errors.mjs'));
    },
);

// 4. Seed idempotency — remove the "users exist?" count-check → a second call
//    creates a duplicate owner. seed.mjs's "exactly one owner" assertion → RED.
await withSourceMutation(
    'seed: idempotency count-check (D5)',
    SEED,
    "if (await userStore.countUsers() > 0) return { seeded: false, reason: 'users_exist' };",
    "/* MUTATION: idempotency check removed */",
    async () => {
        buildPackage(PKG);
        expectRed('seed: goes red when the idempotency count-check is removed', runGate(pkgDir, 'test/seed.mjs'));
    },
);

// 5. Hash no-leak (D8) — login returns the password_hash. login-e2e's
//    "NO password_hash" assertion → RED.
await withSourceMutation(
    'login: hash never leaves the endpoint (D8)',
    LOGIN,
    'return c.json({ user: { id: matched.id, email: matched.email, role: matched.role } }); // D8: no hash',
    'return c.json({ user: { id: matched.id, email: matched.email, role: matched.role, password_hash: matched.passwordHash } });',
    async () => {
        buildPackage(PKG);
        expectRed('login: goes red when the response includes password_hash', runGate(pkgDir, 'test/login-e2e.mjs'));
    },
);

// 6. Cross-tenant authorization (CRIT/RULE 8) — canActOnTenant always true.
//    provision.mjs's "tenant_admin A CANNOT act on B" assertion → RED.
await withSourceMutation(
    'roles: canActOnTenant confines tenant_admin',
    ROLES,
    'return principal.tenant === targetTenant;',
    'return true; // MUTATION: cross-tenant confinement dropped',
    async () => {
        buildPackage(PKG);
        expectRed('roles: goes red when canActOnTenant always allows (cross-tenant)', runGate(pkgDir, 'test/provision.mjs'));
    },
);

// 7. Setup single-winner lock — remove the compare-and-set predicate so two
// Worker isolates can both claim initialization. The concurrent setup gate must
// go red even though the ordinary post-init/user-count guards remain intact.
await withSourceMutation(
    'setup: cross-isolate single-winner lock',
    BACKEND_INDEX,
    'UPDATE setup_state SET initialized_at = ? WHERE id = 1 AND initialized_at IS NULL',
    'UPDATE setup_state SET initialized_at = ? WHERE id = 1',
    async () => {
        buildPackage(PKG);
        expectRed('setup: goes red when the initialization CAS predicate is removed', runGate(pkgDir, 'test/setup.mjs'));
    },
);

// 8. Setup capability authorization — accepting a bad link would restore the
// first-public-visitor takeover that the one-click link is designed to prevent.
await withSourceMutation(
    'setup: deploy capability validation',
    SETUP,
    "if (!(await tokenMatches(body.setupToken))) return c.json({ error: 'invalid_setup_token' }, 403);",
    "if (false) return c.json({ error: 'invalid_setup_token' }, 403);",
    async () => {
        buildPackage(PKG);
        expectRed('setup: goes red when an invalid setup-link claim is accepted', runGate(pkgDir, 'test/setup.mjs'));
    },
);

// 9. Idempotent completion (F3b-durable) — drop the `AND status = 'running'` guard
//    so a late original / second recovery can clobber a terminal row. durable-execution's
//    "terminal row not clobbered" assertion → RED.
await withSourceMutation(
    'durable: completeExecution status=running guard',
    PHASE2STORE,
    "`UPDATE workflow_executions SET status = ?, result = ?, error = ?, ended_at = ? WHERE id = ? AND tenant_slug = ? AND status = 'running'`",
    "`UPDATE workflow_executions SET status = ?, result = ?, error = ?, ended_at = ? WHERE id = ? AND tenant_slug = ?`",
    async () => {
        buildPackage(PKG);
        expectRed('durable: goes red when the completeExecution guard is removed', runGate(pkgDir, 'test/durable-execution.mjs'));
    },
);

// 10. API-key verifier storage — persist the raw key instead of SHA-256.
await withSourceMutation(
    'compat API key: one-way verifier',
    COMPAT_EDGE_MISC,
    'await sha256Hex(key), 1, parsed.data.expires_at',
    'key, 1, parsed.data.expires_at',
    async () => {
        buildPackage(PKG);
        expectRed('compat-security: goes red when raw API keys are persisted', runGate(pkgDir, 'test/compat-security.mjs'));
    },
);

// 11. One-time reveal — leave the ciphertext and reveal marker reusable.
await withSourceMutation(
    'compat API key: atomic one-time reveal',
    COMPAT_EDGE_MISC,
    'SET ciphertext = NULL, revealed_at = ?',
    'SET ciphertext = ciphertext, revealed_at = NULL',
    async () => {
        buildPackage(PKG);
        expectRed('compat-security: goes red when API-key reveal can be replayed', runGate(pkgDir, 'test/compat-security.mjs'));
    },
);

// 12. Reset capability secrecy — store the raw bearer token.
await withSourceMutation(
    'compat password reset: token hashing',
    COMPAT_STORE,
    'const tokenHash = await sha256Hex(token);',
    'const tokenHash = token;',
    async () => {
        buildPackage(PKG);
        expectRed('auth behavior: goes red when reset tokens persist raw', runGate(pkgDir, 'test/compat-behavior-auth.mjs'));
    },
);

// 13. Session generation — allow every pre-reset session after credential change.
await withSourceMutation(
    'compat password reset: session invalidation',
    AUTH,
    'return stored === claimed ? principal : { user: null, tenant: undefined };',
    'return principal; // MUTATION: session generation ignored',
    async () => {
        buildPackage(PKG);
        expectRed(
            'auth behavior: goes red when old sessions survive reset',
            runGate(pkgDir, 'test/compat-behavior-auth.mjs', ['--gate']),
        );
    },
);

// 14. Generated tenant matrix — drop one compat read predicate.
await withSourceMutation(
    'compat tenant matrix: variable read confinement',
    COMPAT_STORE,
    "'SELECT id, name, type, value, formula, description, created_at FROM template_variables WHERE tenant_slug = ? AND id = ?',\n            [this.tenant, id]",
    "'SELECT id, name, type, value, formula, description, created_at FROM template_variables WHERE id = ?',\n            [id]",
    async () => {
        buildPackage(PKG);
        expectRed('tenant matrix: goes red on a cross-tenant compat read', runGate(pkgDir, 'test/compat-tenant-matrix.mjs'));
    },
);

// 15. Contract boundary — remove generated request validation.
await withSourceMutation(
    'compat request validation boundary',
    COMPAT_APP,
    "app.use('*', contractRequestValidation());",
    '/* MUTATION: contract request validation removed */',
    async () => {
        buildPackage(PKG);
        expectRed('negative sweep: goes red when request validation is removed', runGate(pkgDir, 'test/compat-negative.mjs'));
    },
);

// 16. is_default enforcement (Phase 1) — create-with-default no longer unsets
//     the previous default → two defaults coexist. edge-defaults' "creating
//     with is_default unsets the previous default" assertion → RED.
await withSourceMutation(
    'edge-defaults: create unsets the previous default',
    COMPAT_EDGE_GENERIC,
    "        if (siblings.length > 0 && configRecord?.is_default) {\n            await store.setDefaultEdgeResource(kind, id, now());\n        }",
    '        /* MUTATION: create no longer unsets the previous default */',
    async () => {
        buildPackage(PKG);
        expectRed('edge-defaults: goes red when create stops unsetting the previous default', runGate(pkgDir, 'test/edge-defaults.mjs'));
    },
);

// ---- A-25 Phase 4 cloud (WA7) — the seven new-surface proofs ----

// C1. Serving isolation — drop the cloud by-slug query's `tenant_slug`
//     predicate → a tenant host resolves ANOTHER tenant's page.
await withSourceMutation(
    'cloud serving: tenant_slug predicate on the by-slug query',
    TENANCY_SERVING,
    'WHERE tenant_slug = ? AND slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1',
    'WHERE slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-serving: goes red when the by-slug tenant predicate is dropped', runGate(pkgDir, 'test/cloud-serving.mjs'));
    },
);

// C2. Principal scoping — pass-through lets a member of tenant A satisfy
//     tenant B's private-page gate on B's own host (correction 2's hole).
await withSourceMutation(
    'cloud serving: scopePrincipalToHost strips foreign principals',
    TENANCY_SERVING,
    "    if (principal.tenant === hostTenant) return principal;\n    return { ...principal, user: null, tenant: undefined } as T;",
    '    return principal;',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-serving: goes red when scoping passes foreign principals through', runGate(pkgDir, 'test/cloud-serving.mjs'));
    },
);

// C3. Registration gate — an unregistered slug reports found:true → the
//     worker middleware would serve (instead of 404) unknown workspaces.
await withSourceMutation(
    'cloud serving: tenantHostState existence check',
    TENANCY_SERVING,
    'if (!row) return { found: false };',
    'if (!row) return { found: true };',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-serving: goes red when unknown slugs report found:true', runGate(pkgDir, 'test/cloud-serving.mjs'));
    },
);

// C4. Platform-admin gate — relaxing master_admin to owner lets ANY tenant
//     owner list every other workspace.
await withSourceMutation(
    'admin tenants: per-handler master gate',
    COMPAT_ADMIN_TENANTS,
    "if (user.role !== 'master_admin')",
    "if (user.role !== 'owner')",
    async () => {
        buildPackage(PKG);
        expectRed('admin-tenants: goes red when the master gate admits owners', runGate(pkgDir, 'test/admin-tenants.mjs'));
    },
);

// C5. Cloud rate limiter — removing the guard call stops every 429.
await withSourceMutation(
    'cloud rate limit: rateLimitGuard invocation',
    COMPAT_RATE_LIMIT,
    'const denial = await rateLimitGuard(cfg, rlAnonPrincipal(ip));',
    'const denial = null as Awaited<ReturnType<typeof rateLimitGuard>>;',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-rate-limit: goes red when the guard call is removed', runGate(pkgDir, 'test/cloud-rate-limit.mjs'));
    },
);

// C6. Free-tier quotas — publishGate always inert → pages/deploys_monthly
//     402s vanish while everything else keeps working. (The replacement must
//     TYPECHECK: a semantic-only tsc error still emits and keeps the proof
//     real, but a future noEmitOnError flip would hollow it into a stale-dist
//     false pass.)
await withSourceMutation(
    'cloud plan gates: publishGate quota checks',
    COMPAT_GATES,
    '    if (!limits) return null;\n    const pages = limits.pages;\n    if (typeof pages === \'number\' && pages !== -1 && pageCount > pages) {\n        return { detail: \'limit_exceeded\', limit: \'pages\' };\n    }\n    const deploys = limits.deploys_monthly;\n    if (typeof deploys === \'number\' && deploys !== -1 && deploysThisMonth >= deploys) {\n        return { detail: \'limit_exceeded\', limit: \'deploys_monthly\' };\n    }',
    '    if (!limits) return null;\n    return null; /* MUTATION: both publish quotas inert */',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-plan-gates: goes red when publish quotas are inert', runGate(pkgDir, 'test/cloud-plan-gates.mjs'));
    },
);

// C7. Feature flags — private_pages never blocks → a free tenant can flip a
//     page private.
await withSourceMutation(
    'cloud plan gates: private_pages flag',
    COMPAT_GATES,
    'return limits?.private_pages === false;',
    'return false;',
    async () => {
        buildPackage(PKG);
        expectRed('cloud-plan-gates: goes red when private_pages never blocks', runGate(pkgDir, 'test/cloud-plan-gates.mjs'));
    },
);

buildPackage(PKG);
summarize(PKG);
