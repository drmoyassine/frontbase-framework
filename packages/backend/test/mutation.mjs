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
const COMPAT_STORE = 'packages/backend/src/compat/store.ts';
const COMPAT_APP = 'packages/backend/src/compat/app.ts';

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
    "'SELECT id, name, type, description, formula, value, created_at FROM template_variables WHERE tenant_slug = ? AND id = ?',\n            [this.tenant, id]",
    "'SELECT id, name, type, description, formula, value, created_at FROM template_variables WHERE id = ?',\n            [id]",
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

buildPackage(PKG);
summarize(PKG);
