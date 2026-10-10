/**
 * P1-B negative self-tests for the behavior measurement candidate.
 *
 * Programmatically demonstrates that the candidate in
 * parallel-wave1-behavior-candidate.mjs FAILS (its assertions fire) under six
 * degraded/substitution modes, and — as a control — that it completes cleanly
 * in honest mode. This proves the candidate cannot be fooled by:
 *   (a) empty fixtures            -> [p1b-detector:positive-outcome]
 *   (b) starved route (reads emptied during the measured request)
 *                                 -> [p1b-detector:positive-outcome]
 *   (c) shared state across operations (memoized chains model the
 *       pre-isolation shared-state fault; prior-operation mutations pollute
 *       later measurements)
 *                                 -> [p1b-detector:positive-outcome] or
 *                                    [p1b-detector:order-invariance]
 *   (d) success:false treated as success (the misclassification the repair
 *       plan forbids; only the refusal invariant can catch it)
 *                                 -> [p1b-detector:refusal-invariant]
 *   (e) wrong-route substitution: the designated refusal operations observe
 *       the app's REAL unrelated 404 from a nonexistent route
 *                                 -> [p1b-detector:refusal-evidence]
 *   (f) server-error substitution: the designated refusal operations observe
 *       a synthetic clearly-labelled unrelated 500
 *                                 -> [p1b-detector:refusal-evidence]
 *
 * (e)/(f) prove the corrected refusal predicates accept ONLY the documented
 * expected evidence (specific status + marker + transport behavior) and never
 * an unrelated error envelope, which the pre-correction "not a successful
 * round trip" predicates would have accepted.
 *
 * The expected failures ARE the deliverable evidence. The behavior ledger is
 * only hashed (before/after); nothing imports, calls, or regenerates it.
 *
 * Run:
 *   pnpm --filter @frontbase/backend exec node test/parallel-wave1-behavior-candidate-negative.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { runCandidate, preflightDist, ledgerSha256ForReport } from './parallel-wave1-behavior-candidate.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const CASES = [
    { degraded: 'none', expectThrow: false, detectors: null, label: 'control: honest mode completes' },
    { degraded: 'empty-fixtures', expectThrow: true, detectors: ['[p1b-detector:positive-outcome]'], label: '(a) empty fixtures' },
    { degraded: 'starved-reads', expectThrow: true, detectors: ['[p1b-detector:positive-outcome]'], label: '(b) starved route (reads emptied)' },
    {
        degraded: 'shared-state', expectThrow: true,
        detectors: ['[p1b-detector:positive-outcome]', '[p1b-detector:order-invariance]', '[p1b-detector:refusal-evidence]'],
        label: '(c) shared state across operations',
    },
    { degraded: 'success-false-as-success', expectThrow: true, detectors: ['[p1b-detector:refusal-invariant]'], label: '(d) success:false treated as success' },
    { degraded: 'refusal-wrong-route', expectThrow: true, detectors: ['[p1b-detector:refusal-evidence]'], label: '(e) wrong-route substitution: unrelated 404 must not pass as the designated refusal' },
    { degraded: 'refusal-server-error', expectThrow: true, detectors: ['[p1b-detector:refusal-evidence]'], label: '(f) server-error substitution: unrelated 500 must not pass as the designated refusal' },
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const print = (line) => process.stdout.write(`${line}\n`);
    print(JSON.stringify({ p1bNegative: 'starting', node: process.version, platform: process.platform }));
    const preflight = await preflightDist(1000);
    print(JSON.stringify({ preflight: { ok: preflight.ok, reason: preflight.reason } }));
    if (!preflight.ok) {
        print('P1B NEGATIVE HARNESS BLOCKED: ' + preflight.reason);
        process.exitCode = 2;
    } else {
        const evidenceDir = mkdtempSync(join(tmpdir(), 'frontbase-p1b-behavior-negative-'));
        const ledgerBefore = ledgerSha256ForReport();
        const results = [];
        let allGood = true;
        for (const testCase of CASES) {
            const record = { degraded: testCase.degraded, label: testCase.label };
            try {
                const summary = await runCandidate({ degraded: testCase.degraded, evidenceDir });
                record.completed = true;
                record.passed = summary.passed;
                record.failures = summary.failures;
                if (testCase.expectThrow) {
                    record.verdict = 'UNEXPECTED-PASS';
                    record.note = 'degraded mode did NOT make the candidate fail — the candidate would be foolable';
                    allGood = false;
                } else if (summary.passed) {
                    record.verdict = 'EXPECTED-COMPLETE';
                } else {
                    record.verdict = 'CONTROL-FAILED';
                    record.note = 'honest mode must complete without failures';
                    allGood = false;
                }
            } catch (error) {
                record.completed = false;
                record.error = String(error?.message ?? error);
                const matched = testCase.detectors?.find((token) => record.error.includes(token)) ?? null;
                record.detectorMatched = matched;
                if (!testCase.expectThrow) {
                    record.verdict = 'CONTROL-FAILED';
                    record.note = 'honest mode must complete; a thrown assertion here means the candidate is broken';
                    allGood = false;
                } else if (matched) {
                    record.verdict = 'EXPECTED-FAILURE';
                } else {
                    record.verdict = 'WRONG-DETECTOR';
                    record.note = `threw, but not via an intended detector (expected one of: ${testCase.detectors?.join(', ')})`;
                    allGood = false;
                }
            }
            results.push(record);
            print(JSON.stringify(record));
        }
        const ledgerAfter = ledgerSha256ForReport();
        try {
            writeFileSync(join(evidenceDir, 'negative-selftest.json'), JSON.stringify({
                node: process.version,
                preflight: { ok: preflight.ok, reason: preflight.reason },
                ledgerSha256Before: ledgerBefore,
                ledgerSha256After: ledgerAfter,
                ledgerUnchanged: ledgerBefore === ledgerAfter,
                results,
            }, null, 2));
        } catch { /* evidence write must never mask results */ }
        print(JSON.stringify({
            ledgerSha256: ledgerAfter,
            ledgerUnchanged: ledgerBefore === ledgerAfter,
            allExpectedFailuresFired: allGood,
        }));
        print(`EVIDENCE_DIR: ${evidenceDir}`);
        assert.equal(ledgerBefore, ledgerAfter, 'behavior ledger must remain byte-identical');
        if (!allGood) {
            print('P1B NEGATIVE HARNESS FAILURES PRESENT — a degraded mode did not trip its detector; nothing was suppressed.');
            process.exitCode = 1;
        } else {
            print('P1B negative self-tests complete: honest mode completes and every degraded/substitution mode trips its intended detector. The candidate cannot be fooled by empty fixtures, starved reads, shared state, success:false-as-success, or an unrelated 404/500 standing in for a designated refusal.');
        }
    }
}
