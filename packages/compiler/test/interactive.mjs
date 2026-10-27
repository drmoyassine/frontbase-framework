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
 *     or a mismatch (via a mocked PromptIO — the decision logic, not the
 *     terminal rendering).
 *   - readLine(): the REAL raw-mode reader, driven with a fake stdin stream
 *     (not mocked away) — asserts the exact bytes written to stdout for a
 *     masked read. This is the regression test for a real bug that shipped:
 *     the visible-email prompt used `node:readline` (which keeps its own
 *     'data' listener attached to process.stdin indefinitely) and the masked-
 *     password prompt used a SEPARATE raw-mode listener on top of it — both
 *     fired on every keystroke, producing interleaved garbage like
 *     "S*u*n*F*l*o*w*e*r*@*7" on screen. The mocked PromptIO tests above never
 *     caught this because they bypass readLine() entirely. Fixed by removing
 *     readline and routing every prompt through one reader; this test drives
 *     that reader directly so the bug class can't regress silently again.
 */
import { isLoggedIn, ensureWranglerLogin, promptCredentials, readLine } from '../dist/cli/interactive.js';
import { EventEmitter } from 'node:events';

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

// ── readLine(): THE REGRESSION TEST — drives the real raw-mode reader with a
//    fake stdin stream and asserts the exact bytes written. No mock IO here. ──

/** A fake stdin: an EventEmitter with the subset of the Node stream API
 *  readLine() actually uses (setRawMode/resume/pause/on/removeListener). */
function fakeStdin() {
    const emitter = new EventEmitter();
    emitter.setRawMode = () => {};
    emitter.resume = () => {};
    emitter.pause = () => {};
    return emitter;
}
/** Feed a string as individual single-byte chunks — the worst case for the
 *  interleaving bug (readline's own reads are chunked exactly this way from a
 *  real terminal, one keystroke per event). */
function typeString(stdin, s) {
    for (const ch of s) stdin.emit('data', Buffer.from(ch, 'utf8'));
    stdin.emit('data', Buffer.from('\n', 'utf8'));
}

{
    const stdin = fakeStdin();
    let written = '';
    const write = (s) => { written += s; };
    const resultPromise = readLine('Admin password (min 8 chars): ', /* mask */ true, stdin, write);
    typeString(stdin, 'SunFlower@7');
    const result = await resultPromise;
    check('readLine (masked): returns the exact typed value', result === 'SunFlower@7');
    check('readLine (masked): echoes ONLY the prompt + one \'*\' per char + newline — no real chars, no interleaving',
        written === 'Admin password (min 8 chars): ' + '*'.repeat('SunFlower@7'.length) + '\n');
    check('readLine (masked): the plaintext password never appears anywhere in what was written to the terminal',
        !written.includes('SunFlower@7') && !written.includes('Sun') && !written.includes('Flower'));
}

{
    // The visible (email) reader — echoes the real characters, still via the
    // SAME single reader (proving there's no second listener to race with).
    const stdin = fakeStdin();
    let written = '';
    const write = (s) => { written += s; };
    const resultPromise = readLine('Admin email: ', /* mask */ false, stdin, write);
    typeString(stdin, 'owner@example.com');
    const result = await resultPromise;
    check('readLine (visible): returns the exact typed value', result === 'owner@example.com');
    check('readLine (visible): echoes the prompt + the real characters + newline (unmasked, by design)',
        written === 'Admin email: owner@example.com\n');
}

{
    // Backspace correctness under raw mode (both mask and visible paths).
    const stdin = fakeStdin();
    let written = '';
    const write = (s) => { written += s; };
    const resultPromise = readLine('pw: ', true, stdin, write);
    // Emitted manually (not via typeString) so a backspace (byte 8) can be
    // interleaved between the typed characters.
    stdin.emit('data', Buffer.from('a', 'utf8'));
    stdin.emit('data', Buffer.from('b', 'utf8'));
    stdin.emit('data', Buffer.from([8]));           // backspace (BS)
    stdin.emit('data', Buffer.from('c', 'utf8'));
    stdin.emit('data', Buffer.from('\n', 'utf8'));
    const result = await resultPromise;
    check('readLine: backspace removes the last character from the returned value', result === 'ac');
    check('readLine: backspace erases the mask visually (\\b \\b sequence written)', written.includes('\b \b'));
}

console.log(failures === 0 ? '\ninteractive: PASS ✅' : `\ninteractive: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
