import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';
const source = repoRoot + 'packages/edge-infra/src/providers/runners.ts';
const original = readFileSync(source, 'utf8');
const hash = b => createHash('sha256').update(b).digest('hex');
const faults = [
  ['numeric counts lost', "const count = typeof changes === 'number' ? changes", "const count = typeof changes === 'number' ? 0", 'FAIL numeric count 7'],
  ['malformed counts accepted', "if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('d1_invalid_change_count');",
    "if (typeof count !== 'number') throw new Error('d1_invalid_change_count');", 'FAIL malformed count negative'],
];
function gate() {
  const result = spawnSync(process.execPath, [repoRoot + 'packages/edge-infra/test/d1-rest-count.mjs'], {
    cwd: repoRoot, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, null);
  return result;
}
function baseline(label) {
  assert.equal(buildPackage('@frontbase/edge-infra'), true, label + ' builds');
  const result = gate();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /D1 REST counts: 15 passed, 0 failed; raw global calls 0/);
}
baseline('initial');
try {
  for (const [name, before, after, failure] of faults) {
    assert.equal(original.split(before).length, 2, 'unique mutation anchor');
    try {
      writeFileSync(source, original.replace(before, after));
      assert.equal(buildPackage('@frontbase/edge-infra'), true, name + ' builds');
      const result = gate();
      assert.equal(result.status, 1);
      assert.ok(result.stdout.includes(failure), result.stdout + result.stderr);
    } finally { writeFileSync(source, original); }
    baseline(name + ' independently restored');
    console.log('RED / rebuilt GREEN: ' + name);
  }
} finally {
  writeFileSync(source, original);
  baseline('final restored');
  assert.equal(hash(readFileSync(source)), hash(original));
}
console.log('D1 REST count mutation 2/2; restored source SHA256 ' + hash(original));
