/**
 * backend mutation harness (RULE 8). Proves three guarantees real:
 *   - authz tenant predicate: drop `AND tenant_slug = ?` from getDraft → tenant B
 *     reads tenant A's draft from the SHARED db (SEC-P2-2 class).
 *   - default-deny middleware: remove the !principal.user guard → anon accesses.
 *   - opaque errors: return raw err.message → SQL/connection detail leaks.
 * Mutations target store.ts:52, auth.ts:23, errors.ts:14.
 */
import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';

const PKG = '@frontbase/backend';
const pkgDir = repoRoot + 'packages/backend/';
const STORE = 'packages/backend/src/db/store.ts';
const AUTH = 'packages/backend/src/mw/auth.ts';
const ERRORS = 'packages/backend/src/mw/errors.ts';

console.log('— backend mutation harness —\n');
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
if (runGate(pkgDir, 'test/authz.mjs') !== 0) { console.log('baseline authz RED — fix first'); process.exit(2); }
if (runGate(pkgDir, 'test/errors.mjs') !== 0) { console.log('baseline errors RED — fix first'); process.exit(2); }
console.log('baseline: authz + errors GREEN\n');

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

buildPackage(PKG);
summarize(PKG);
