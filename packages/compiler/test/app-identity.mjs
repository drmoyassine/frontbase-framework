/**
 * App-identity gate: Cloudflare (via `wrangler deployments list` / `wrangler d1
 * info`) is the SOURCE OF TRUTH for whether an app already exists — not the
 * local wrangler.toml. Proves:
 *   - workerExists() reads the real exit-code + error-code shape correctly
 *     (verified against the live wrangler CLI before writing this — see the
 *     PR discussion), and does NOT misread an unrelated failure as "not found".
 *   - lookupExistingD1() parses the real `wrangler d1 info --json` shape.
 *   - randomAppName()/generateFreeAppName(): deterministic word-pair output
 *     with an injected RNG; retries on a (simulated) name collision; gives up
 *     cleanly after maxAttempts instead of looping forever.
 */
import { workerExists, lookupExistingD1, randomAppName, generateFreeAppName, sanitizeAppName } from '../dist/cli/app-identity.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ── workerExists(): exit-code + error-code parsing ──────────────────────────────
{
    const run = async (args) => {
        if (args.join(' ') === 'deployments list --name my-app') return { code: 0, stdout: '[deployment history]', stderr: '' };
        return { code: 1, stdout: '', stderr: '' };
    };
    check('exists: exit 0 → true', await workerExists('my-app', '/fake', run) === true);
}
{
    const run = async () => ({ code: 1, stdout: '', stderr: 'This Worker does not exist on your account. [code: 10007]' });
    check('not found: exit 1 + code:10007 → false', await workerExists('nope', '/fake', run) === false);
}
{
    const run = async () => ({ code: 1, stdout: '', stderr: 'X [ERROR] Worker does not exist' });
    check('not found: exit 1 + "does not exist" text (no explicit code) → false', await workerExists('nope', '/fake', run) === false);
}
{
    // A DIFFERENT failure (auth expired, network) must NOT be silently read as
    // "doesn't exist" — that would trigger an accidental fresh D1 create on top
    // of a real, existing app. It must throw so the caller fails loudly instead.
    const run = async () => ({ code: 1, stdout: '', stderr: 'Authentication error [code: 10000]' });
    let threw = false;
    try { await workerExists('my-app', '/fake', run); } catch (e) { threw = true; check('unrelated failure message surfaced', /could_not_determine_worker_existence/.test(e.message)); }
    check('unrelated failure (not a not-found signal) throws, does not return false', threw === true);
}

// ── lookupExistingD1(): parses `wrangler d1 info --json` ────────────────────────
{
    const run = async (args) => {
        if (args.join(' ') === 'd1 info my-app-db --json') return { code: 0, stdout: JSON.stringify({ uuid: 'real-uuid-123', name: 'my-app-db' }), stderr: '' };
        return { code: 1, stdout: '', stderr: 'not found' };
    };
    check('found: returns the real uuid', await lookupExistingD1('my-app-db', '/fake', run) === 'real-uuid-123');
}
{
    const run = async () => ({ code: 1, stdout: '', stderr: "Couldn't find a D1 DB with name or binding 'nope' in your config or the API." });
    check('not found: returns null (not a throw — caller decides what null means)', await lookupExistingD1('nope', '/fake', run) === null);
}
{
    const run = async () => ({ code: 0, stdout: 'not valid json', stderr: '' });
    check('malformed JSON on success: returns null (does not throw)', await lookupExistingD1('weird', '/fake', run) === null);
}

// ── sanitizeAppName(): converts arbitrary input into a CF-safe worker/app name ─
{
    check('sanitizeAppName: lowercases and replaces invalid chars with dashes', sanitizeAppName('Frontbase PotatoS') === 'frontbase-potatos');
    check('sanitizeAppName: trims repeated separators and empty fallback', sanitizeAppName('---') === 'frontbase');
}

// ── randomAppName(): deterministic with an injected RNG ─────────────────────────
{
    const always0 = () => 0; // picks index 0 from both word lists every time
    const name1 = randomAppName(always0);
    const name2 = randomAppName(always0);
    check('randomAppName: same RNG seed → same name (deterministic)', name1 === name2);
    check('randomAppName: shape is "word-word"', /^[a-z]+-[a-z]+$/.test(name1));
}
{
    // Two different fixed RNG values should (with this word-list size) produce
    // two different names — proves the RNG is actually driving the choice, not
    // some hardcoded fallback.
    const nameA = randomAppName(() => 0);
    const nameB = randomAppName(() => 0.99);
    check('randomAppName: different RNG values → different names', nameA !== nameB);
}

// ── generateFreeAppName(): retries on collision, gives up after maxAttempts ─────
{
    // The RNG always picks the SAME candidate, and workerExists says it's taken
    // every time — must exhaust maxAttempts and throw, not loop forever.
    const run = async () => ({ code: 0, stdout: 'exists', stderr: '' }); // "exists" for every candidate
    let threw = false;
    try { await generateFreeAppName('/fake', run, { rand: () => 0, maxAttempts: 3 }); }
    catch (e) { threw = true; check('gives up with a clear error after maxAttempts', /could_not_generate_free_app_name/.test(e.message)); }
    check('exhausts retries and throws (does not loop forever)', threw === true);
}
{
    // First candidate is "taken", second is free — must retry once and succeed
    // with a DIFFERENT candidate, not just retry the same one. randomAppName()
    // calls rand() twice per invocation (adjective, then noun), so the sequence
    // below must supply 4 values total: [0,0] for attempt 1, [0.99,0.99] for
    // attempt 2 — giving two genuinely different word pairs.
    let call = 0;
    const seenNames = [];
    const run = async (args) => {
        const name = args[args.length - 1];
        seenNames.push(name);
        call++;
        return call === 1 ? { code: 0, stdout: 'exists', stderr: '' } : { code: 1, stdout: '', stderr: 'code: 10007' };
    };
    const randSequence = [0, 0, 0.99, 0.99];
    let i = 0;
    const rand = () => randSequence[i++ % randSequence.length];
    const name = await generateFreeAppName('/fake', run, { rand });
    check('retries with a NEW candidate after a collision (not the same name twice)', seenNames.length === 2 && seenNames[0] !== seenNames[1]);
    check('returns the second (free) candidate', name === seenNames[1]);
}

console.log(failures === 0 ? '\napp-identity: PASS ✅' : `\napp-identity: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
