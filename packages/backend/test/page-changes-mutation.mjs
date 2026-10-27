import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';

const store = 'packages/backend/src/compat/page-change-store.ts';
const route = 'packages/backend/src/compat/routes/page-changes.ts';
const originals = new Map([store, route].map(path => [path, readFileSync(repoRoot + path, 'utf8')]));
const faults = [
    ['role boundary', route, "if (!roles.includes((c.get('principal').user as { role?: string })?.role ?? ''))", 'if (false)'],
    ['state owner', route, "new PageChangeStore(db, c.get('tenant')).state", "new PageChangeStore(db, 'alpha').state"],
    ['mutation owner', route, "const owner = c.get('tenant');", "const owner = 'alpha';"],
    ['wire size', route, 'if (size > 1024 * 1024)', 'if (size > 2 * 1024 * 1024)'],
    ['expected state', store, '|| await this.hash(before) !== request.expectedStateHash', ''],
    ['operation identity', store, 'if (known.value.planHash !== planHash || known.value.pageId !== pageId)', 'if (false)'],
    ['running operation reservation', store, "if (current && !['applied', 'conflict'].includes(current.value.phase))", 'if (false)'],
    ['full SQL CAS', store, ' AND ${predicates}`', ' AND (${predicates} OR 1=1)`'],
    ['atomic ownership marker', store, 'if (!page || page.last_write_operation !== id || await this.hash(page) !== operation.resultStateHash)', 'if (!page || false)'],
    ['unknown-intent replay', store, "if (operation.phase === 'prepared')", "if (operation.phase === 'prepared' || operation.phase === 'applying')"],
    ['read-only status', store, 'const active = await this.record(SLOT);', 'await this.execute(id); const active = await this.record(SLOT);'],
    ['archive preserved', store, 'archiveKey(current.value.operationId), current.raw, now', "archiveKey(current.value.operationId) + ':fault', current.raw, now"],
];
const hash = text => createHash('sha256').update(text).digest('hex');
let lastOutput = '';
function gate() {
    const result = spawnSync(process.execPath, [repoRoot + 'packages/backend/test/page-changes.mjs'],
        { cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(result.error, undefined, 'test infrastructure failed');
    assert.equal(result.signal, null, 'test infrastructure interrupted');
    assert.notEqual(result.status, null); lastOutput = result.stdout + result.stderr; return result.status;
}
assert.equal(buildPackage('@frontbase/backend'), true); assert.equal(gate(), 0);
try {
    for (const [name, path, before, after] of faults) {
        const original = originals.get(path);
        assert.equal(original.split(before).length, 2, 'exact mutation anchor: ' + name);
        try {
            writeFileSync(repoRoot + path, original.replace(before, after));
            assert.equal(buildPackage('@frontbase/backend'), true, 'mutation compiles: ' + name);
            assert.notEqual(gate(), 0, 'fault detected: ' + name);
            if (name === 'full SQL CAS') {
                assert.match(lastOutput, /actual: 'applied'/);
                assert.match(lastOutput, /expected: 'conflict'/);
            }
        } finally { writeFileSync(repoRoot + path, original); }
        assert.equal(buildPackage('@frontbase/backend'), true);
        assert.equal(gate(), 0, 'independent restored baseline: ' + name);
        console.log('RED / rebuilt restored GREEN: ' + name);
    }
} finally { for (const [path, original] of originals) writeFileSync(repoRoot + path, original); }
for (const [path, original] of originals) assert.equal(hash(readFileSync(repoRoot + path, 'utf8')), hash(original));
console.log(`${faults.length} page-change mutations detected; independently rebuilt GREEN after each; source hashes identical`);
