import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const sourcePath = new URL('rehearse-restore.mjs', import.meta.url);
const original = readFileSync(sourcePath, 'utf8');
const before = "if (Boolean(secret) !== manifest.sessionSecret.present) failures.push('persisted session secret presence differs from manifest');";
assert.equal(original.split(before).length, 2);
const hash = text => createHash('sha256').update(text).digest('hex');
function run() {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('server-restore.test.mjs', import.meta.url))],
        { encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); return result;
}
assert.equal(run().status, 0, 'GREEN before fault');
try {
    writeFileSync(sourcePath, original.replace(before, '/* fault: ignore persisted-key custody mismatch */'));
    const result = run();
    assert.notEqual(result.status, 0, 'secret-custody fault must fail');
    assert.match(result.stderr, /incorrect persisted-key metadata must refuse/);
} finally { writeFileSync(sourcePath, original); }
assert.equal(run().status, 0, 'independent restored GREEN');
assert.equal(hash(readFileSync(sourcePath, 'utf8')), hash(original));
console.log('1 custody mutation RED; real-server restored GREEN; source hash identical');
