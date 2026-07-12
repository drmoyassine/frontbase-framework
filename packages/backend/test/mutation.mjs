/**
 * backend mutation harness (RULE 8). Proves each security guarantee real by
 * breaking it and watching its gate go RED:
 *   - authz tenant predicate (drop WHERE tenant → cross-tenant read)
 *   - default-deny middleware (remove !principal.user guard → anon access)
 *   - opaque errors (return raw err.message → detail leak)
 *   - seed idempotency (remove the count-check → a second owner is created)
 *   - hash no-leak (login returns password_hash → the D8 assertion fires)
 *   - canActOnTenant (always-true → a tenant_admin reaches another tenant)
 *   - setup post-init lock (remove the initialized guard → /setup re-runnable)
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
const PHASE2STORE = 'packages/backend/src/db/phase2-store.ts';

console.log('— backend mutation harness —\n');
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
for (const g of ['authz', 'errors', 'seed', 'login-e2e', 'provision', 'setup', 'durable-execution']) {
    if (runGate(pkgDir, `test/${g}.mjs`) !== 0) { console.log(`baseline ${g} RED — fix first`); process.exit(2); }
}
console.log('baseline: authz + errors + seed + login-e2e + provision + setup + durable-execution GREEN\n');

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
    "        if (!principal.user) {\n            return c.json({ error: 'authentication_required' }, 401);\n        }",
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

// 7. Setup post-init lock (CRIT-3) — remove the initialized guard on /setup so a
//    live instance can be re-bootstrapped. setup.mjs's "re-POST → 410" → RED.
//    (replace_all: BOTH /setup and /setup/db share the identical guard line.)
await withSourceMutation(
    'setup: first-run-only lock (CRIT-3)',
    SETUP,
    "if (await isInitialized()) return c.json({ error: 'already_initialized' }, 410);",
    "if (false) return c.json({ error: 'already_initialized' }, 410);",
    async () => {
        buildPackage(PKG);
        expectRed('setup: goes red when the post-init lock is removed', runGate(pkgDir, 'test/setup.mjs'));
    },
);

// 8. Idempotent completion (F3b-durable) — drop the `AND status = 'running'` guard
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

buildPackage(PKG);
summarize(PKG);
