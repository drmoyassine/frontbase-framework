/**
 * F3b-durable QStash dispatcher gate (S2.5). Credential-gated on QSTASH_TOKEN +
 * QSTASH_RUN_URL: asserts the dispatcher publishes a recovery-trigger message to
 * QStash. Self-skips without creds.
 *
 * Honest scope (documented in the dispatcher header): the `work` closure can't be
 * serialized, so the dispatcher ignores it and publishes a recovery trigger; the
 * receiving endpoint runs the idempotent sweep. This test proves the publish path.
 */
import { qstashDispatcher } from '@frontbase/edge-infra';

const { QSTASH_TOKEN, QSTASH_RUN_URL } = process.env;
if (!QSTASH_TOKEN || !QSTASH_RUN_URL) {
    console.log('  (durable-execution-live: credential-gated — set QSTASH_TOKEN/QSTASH_RUN_URL to run)');
    console.log('\ndurable-execution-live: SKIP (no creds) ⏭️');
    process.exit(0);
}

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const dispatch = qstashDispatcher({
    token: QSTASH_TOKEN,
    runUrl: QSTASH_RUN_URL,
    callbackSecret: process.env.QSTASH_CALLBACK_SECRET,
});

// The work closure is intentionally ignored (can't be serialized). Publish should
// resolve without throwing — that's the assertion (the trigger lands in QStash).
try {
    await dispatch(async () => { /* would run the workflow — ignored by QStash path */ });
    check('qstashDispatcher published a recovery trigger (no throw)', true);
} catch (e) {
    check('qstashDispatcher published a recovery trigger (no throw)', false);
    console.log('     ' + (e?.message ?? e));
}

console.log(failures === 0 ? '\ndurable-execution-live: PASS ✅' : `\ndurable-execution-live: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
