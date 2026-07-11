/**
 * Password module gate (M-ID.1.1, D1) — PBKDF2 round-trip + RULE 8.
 *   - hash→verify correct; wrong password false; two hashes differ (random salt);
 *     malformed stored string → false (no throw).
 */
import { hashPassword, verifyPassword } from '../dist/vault/password.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const pw = 'correct horse battery staple';
const stored = await hashPassword(pw);
check('stored format is pbkdf2$<iters>$<salt>$<hash>', /^pbkdf2\$600000\$[^$]+\$[^$]+$/.test(stored));
check('verify: correct password → true', await verifyPassword(pw, stored) === true);
check('verify: wrong password → false', await verifyPassword('wrong', stored) === false);

// random salt → two hashes of the same password differ
const stored2 = await hashPassword(pw);
check('two hashes of the same password differ (random salt)', stored !== stored2);
check('both hashes verify the same password', await verifyPassword(pw, stored2) === true);

// malformed stored string → false (no throw)
check('malformed stored string → false', await verifyPassword(pw, 'not-a-hash') === false);
check('empty stored → false', await verifyPassword(pw, '') === false);
check('wrong iters → false', await verifyPassword(pw, 'pbkdf2$0$YWJj$ZGVm') === false);

// iters in the stored string is honored (a low-iter hash still verifies)
console.log(failures === 0 ? '\npassword: PASS ✅' : `\npassword: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
