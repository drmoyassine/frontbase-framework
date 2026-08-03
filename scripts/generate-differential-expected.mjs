#!/usr/bin/env node
/**
 * CF-22 — seed the differential's expected-difference ledger.
 *
 * The burn-down had no end condition. Every run produced a new number, and "0
 * differences" is both unreachable and wrong to aim at: some differences are the
 * PRODUCT misbehaving, and matching those would mean shipping its defects.
 *
 * The ledger replaces that open-ended chase with a ratchet. A difference may stay
 * only if it carries a written, reviewable reason. Anything else fails. Because the
 * gate also fails on entries that no longer differ, a fixed difference MUST be
 * deleted from the ledger — so the file can only shrink.
 *
 * This script seeds ONLY the categories that can be justified from the evidence in
 * the report itself. Everything else is deliberately left out, so the gate stays red
 * on the real remainder rather than blessing it. Judgement calls are made by a human
 * or an agent editing the file, never by this script.
 *
 *   node scripts/generate-differential-expected.mjs [--report <path>]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const option = (name) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

const REPORT = resolve(option('--report') ?? 'docs/reports/CF22_A3_differential_parity_report.json');
const OUT = resolve('packages/backend/contracts/differential.expected.json');

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).differences ?? {} : {};

/**
 * Reasons derivable from the observation alone.
 *
 * Each says why the framework must NOT be changed to match. Anything needing a
 * judgement about intent — an envelope shape, a missing field, a status choice — is
 * not here, because a generated reason is not a reviewed one.
 */
function autoReason(difference) {
    const product = difference.status.product;
    if (typeof product === 'number' && product >= 500 && product !== 502) {
        return `product answers ${product}; the framework answers ${difference.status.framework}. `
            + 'Matching would reproduce a product defect, not close a parity gap.';
    }
    if (String(product).startsWith('timeout')) {
        return 'product does not respond within the case timeout; the framework answers '
            + `${difference.status.framework}. There is no product behaviour here to match.`;
    }
    if (String(product) === 'unresolved-variable') {
        return 'product could not create its own fixture — POST /api/auth-forms/ fails with '
            + '"no such table: auth_forms" on a freshly created database, where create_all and '
            + 'Alembic disagree about ownership. Unmeasured, not a parity finding.';
    }
    return null;
}

const differences = {};
let seeded = 0;
let carried = 0;
for (const difference of report.differences) {
    const key = `${difference.method} ${difference.path} [${difference.kind}]`;
    // A hand-written reason always wins: this script must never overwrite review.
    if (existing[key]?.reason) {
        differences[key] = existing[key];
        carried++;
        continue;
    }
    const reason = autoReason(difference);
    if (!reason) continue;
    differences[key] = {
        operationId: difference.operationId,
        disposition: 'record',
        observed: {
            product: String(difference.status.product),
            framework: String(difference.status.framework),
        },
        reason,
    };
    seeded++;
}

writeFileSync(OUT, `${JSON.stringify({
    note: 'Differences allowed to persist, each with a reviewable reason. A difference '
        + 'absent from this file FAILS the gate; an entry that no longer differs also FAILS, '
        + 'so a fix must delete its entry. The file can only shrink.',
    source: REPORT.replace(/\\/g, '/').split('/').slice(-1)[0],
    differences,
}, null, 2)}\n`);

const total = report.differences.length;
console.log(`expected-difference ledger written: ${Object.keys(differences).length} entries → ${OUT}`);
console.log(`  seeded from evidence: ${seeded}, carried over with a reviewed reason: ${carried}`);
console.log(`  UNJUSTIFIED and still failing the gate: ${total - Object.keys(differences).length} of ${total}`);
