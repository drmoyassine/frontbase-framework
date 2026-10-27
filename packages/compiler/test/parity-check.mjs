/**
 * check --parity gate (M3.1.2) + RULE 8 mutation proof.
 *  - A provider-agnostic page renders byte-identically across direct/proxy/draft
 *    → runParityCheck is GREEN (no PARITY_DIFF).
 *  - MUTATION: a provider-sensitive executor (returns different rows per provider)
 *    → runParityCheck goes RED (reports PARITY_DIFF with the diff location).
 */
import { z } from 'zod';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { buildSiteManifest } from '../dist/manifest/build.js';
import { runParityCheck } from '../dist/cli/parity.js';
import { createEngine, directProvider } from '@frontbase/edge-core';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const layout = { root: {}, content: [{ id: 'd', type: 'Text', props: { content: '{% for r in records %}{{ r.n }};{% endfor %}' } }] };

// 1. Provider-agnostic manifest → parity GREEN.
const agnostic = defineQueries({
    'nums': { queryId: 'nums', scope: 'public', rows: [{ n: 1 }, { n: 2 }, { n: 3 }] },
});
const manifestA = buildSiteManifest({ pages: { '/data': { title: 'D', slug: 'data', queryId: 'nums', layout } }, queries: agnostic });
const resA = await runParityCheck(manifestA);
check('provider-agnostic page: parity GREEN', resA.success);
check('provider-agnostic page: no PARITY_DIFF issues', !resA.issues.some((i) => i.code === 'PARITY_DIFF'));

// 2. MUTATION (RULE 8) — a provider-sensitive executor. directProvider returns
//    the baked rows; proxyProvider fetches via the edge; draftProvider returns
//    baked rows too — so to force a divergence, make `execute` non-deterministic
//    across calls. simulate's proxy mode routes through the edge engine, so a
//    query whose execute returns DIFFERENT data on the proxy path vs direct path
//    produces a PARITY_DIFF. We model this with a query whose rows differ.
const sensitive = defineQueries({
    'flaky': {
        queryId: 'flaky', scope: 'public',
        // Returns data that differs from the baked rows the draft/proxy paths use —
        // simulating a provider-coupled executor (the regression parity catches).
        rows: [{ n: 'DIRECT-ONLY' }],
        execute: async () => [{ n: 'EDGE-EXECUTOR' }],
    },
});
const manifestB = buildSiteManifest({ pages: { '/flaky': { title: 'F', slug: 'flaky', queryId: 'flaky', layout } }, queries: sensitive });
const resB = await runParityCheck(manifestB);
check('MUTATION: provider-sensitive page → parity RED', !resB.success);
check('MUTATION: PARITY_DIFF reported with the diff', resB.issues.some((i) => i.code === 'PARITY_DIFF' && /differs/.test(i.message)));

// 3. The diagnostic carries an actionable fix hint.
const diff = resB.issues.find((i) => i.code === 'PARITY_DIFF');
check('PARITY_DIFF carries a fix hint', !!diff && !!diff.fix && /provider-agnostic/.test(diff.fix));

console.log(failures === 0 ? '\nparity-check: PASS ✅' : `\nparity-check: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
