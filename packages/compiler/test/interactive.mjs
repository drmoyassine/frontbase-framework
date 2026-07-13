/**
 * `frontbase deploy --interactive` gate. Proves the login-check + credential-
 * prompt decision logic WITHOUT a real terminal or Cloudflare account — both
 * `ensureWranglerLogin` and `promptCredentials` take injectable seams.
 *
 *   - isLoggedIn() correctly parses wrangler's whoami text (exit code is
 *     unreliable — wrangler exits 0 whether logged in or not).
 *   - ensureWranglerLogin: no-ops when already logged in; runs `wrangler login`
 *     when not; throws if login fails/is cancelled.
 *   - promptCredentials: validates email (must contain @) and password
 *     (min 8 chars, typed TWICE and must match), re-prompting on invalid input
 *     or a mismatch; never echoes the password back through anything the test
 *     can observe (the mock IO simulates a masked reader — the real one is
 *     exercised structurally, not e2e, since a raw-mode TTY can't be driven
 *     from a test harness).
 */
import { isLoggedIn, ensureWranglerLogin, promptCredentials } from '../dist/cli/interactive.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ── isLoggedIn: message-text parsing (exit code is NOT the signal) ─────────────
check('isLoggedIn: true on the real wrangler "logged in" message',
    isLoggedIn('👋 You are logged in with an OAuth Token, associated with the email x@y.com.') === true);
check('isLoggedIn: false on "not authenticated"',
    isLoggedIn('You are not authenticated. Please run `wrangler login`.') === false);
check('isLoggedIn: false on empty/garbage output', isLoggedIn('') === false && isLoggedIn('some unrelated error') === false);

// ── ensureWranglerLogin: already logged in → no `login` call ───────────────────
{
    const calls = [];
    const run = async (bin, args) => {
        calls.push({ bin, args });
        if (args[0] === 'whoami') return { code: 0, stdout: 'You are logged in with an OAuth Token.', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
    };
    const res = await ensureWranglerLogin('/fake/cwd', run);
    check('already logged in: wasLoggedIn = true', res.wasLoggedIn === true);
    check('already logged in: ONLY whoami was called (no login)', calls.length === 1 && calls[0].args[0] === 'whoami');
}

// ── ensureWranglerLogin: not logged in → runs `wrangler login`, then succeeds ──
{
    const calls = [];
    const run = async (bin, args) => {
        calls.push({ bin, args });
        if (args[0] === 'whoami') return { code: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' };
        if (args[0] === 'login') return { code: 0, stdout: '', stderr: '' };
        return { code: 1, stdout: '', stderr: 'unexpected' };
    };
    const res = await ensureWranglerLogin('/fake/cwd', run);
    check('not logged in: wasLoggedIn = false', res.wasLoggedIn === false);
    check('not logged in: whoami THEN login (in order)', calls.length === 2 && calls[0].args[0] === 'whoami' && calls[1].args[0] === 'login');
}
{
    // ensureWranglerLogin must request stdio:'inherit' for `login` — the browser
    // OAuth flow needs a visible/interactive terminal.
    const seenOpts = [];
    const run = async (bin, args, opts) => {
        seenOpts.push({ args: args[0], opts });
        if (args[0] === 'whoami') return { code: 0, stdout: 'not authenticated', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
    };
    await ensureWranglerLogin('/fake/cwd', run);
    const loginCall = seenOpts.find((c) => c.args === 'login');
    check('login is invoked with stdio: inherit', loginCall?.opts?.stdio === 'inherit');
}

// ── ensureWranglerLogin: login fails/cancelled → throws (deploy must not proceed) ──
{
    const run = async (bin, args) => {
        if (args[0] === 'whoami') return { code: 0, stdout: 'not authenticated', stderr: '' };
        return { code: 1, stdout: '', stderr: 'cancelled' }; // login failed
    };
    let threw = false;
    try { await ensureWranglerLogin('/fake/cwd', run); } catch { threw = true; }
    check('failed/cancelled login throws (does not silently continue)', threw === true);
}

// ── promptCredentials: happy path (password typed twice, matching) ─────────────
{
    const answers = { question: ['owner@example.com'], questionMasked: ['a-real-password-123', 'a-real-password-123'] };
    const io = {
        question: async () => answers.question.shift(),
        questionMasked: async () => answers.questionMasked.shift(),
    };
    const creds = await promptCredentials(io);
    check('promptCredentials: email captured', creds.email === 'owner@example.com');
    check('promptCredentials: password captured', creds.password === 'a-real-password-123');
}

// ── promptCredentials: re-prompts on invalid email (no @) ──────────────────────
{
    const answers = { question: ['not-an-email', 'owner@example.com'], questionMasked: ['a-real-password-123', 'a-real-password-123'] };
    const io = {
        question: async () => answers.question.shift(),
        questionMasked: async () => answers.questionMasked.shift(),
    };
    const creds = await promptCredentials(io);
    check('invalid email is rejected and re-prompted', creds.email === 'owner@example.com');
}

// ── promptCredentials: re-prompts on short password (never asks for confirm) ───
{
    const answers = { question: ['owner@example.com'], questionMasked: ['short', 'a-real-password-123', 'a-real-password-123'] };
    const io = {
        question: async () => answers.question.shift(),
        questionMasked: async () => answers.questionMasked.shift(),
    };
    const creds = await promptCredentials(io);
    check('short password (<8 chars) is rejected and re-prompted', creds.password === 'a-real-password-123');
    check('short password never triggers a confirm ask (only 3 questionMasked calls, not 4)', answers.questionMasked.length === 0);
}

// ── promptCredentials: mismatched confirmation → re-prompts both entries ───────
{
    const answers = { question: ['owner@example.com'], questionMasked: ['first-password-1', 'a-different-password-2', 'final-password-3', 'final-password-3'] };
    const io = {
        question: async () => answers.question.shift(),
        questionMasked: async () => answers.questionMasked.shift(),
    };
    const creds = await promptCredentials(io);
    check('mismatched confirm is rejected and re-prompted', creds.password === 'final-password-3');
}

console.log(failures === 0 ? '\ninteractive: PASS ✅' : `\ninteractive: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
