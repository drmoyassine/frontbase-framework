/** Each fault must independently fail, then both restored suites must pass. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const dir = fileURLToPath(new URL('.', import.meta.url));
const faults = [
    ['inquiry-pipeline.mjs', "deliveryError = 'transport_unavailable';", "deliveryState = 'delivered'; deliveryError = 'transport_unavailable';"],
    ['inquiry-pipeline.mjs', 'if (payload.institution === null || record.institutionId !== payload.institution)', 'if (false)'],
    ['inquiry-adapters.mjs', "outcome = { ok: false, retryable: true, error: 'adapter_failure' };", "throw new Error('fault');"],
    ['inquiry-adapters.mjs', "if (!outcome || typeof outcome.ok !== 'boolean' || typeof outcome.then === 'function')", 'if (false)'],
    ['inquiry-store.mjs', 'byKey.delete(lead.dedupeKey);', '/* fault: dedupe retained */'],
    ['inquiry-server.mjs', 'if (!limit.allowed) {', 'if (false) {'],
];
const sources = new Map(faults.map(([file]) => [file, readFileSync(new URL(file, import.meta.url), 'utf8')]));
const hash = text => createHash('sha256').update(text).digest('hex');
function run(file) {
    const result = spawnSync(process.execPath, [file], { cwd: dir, encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(result.error, undefined, 'test infrastructure failed');
    assert.equal(result.signal, null, 'test infrastructure interrupted');
    return result.status;
}
function green() { assert.equal(run('test-safety.mjs'), 0); assert.equal(run('test-inquiry.mjs'), 0); }
green();
try {
    for (const [file, before, after] of faults) {
        const path = new URL(file, import.meta.url);
        const source = sources.get(file);
        assert.equal(source.split(before).length, 2, 'fault must match exactly once');
        try {
            writeFileSync(path, source.replace(before, after));
            assert.notEqual(run('test-safety.mjs'), 0, `fault survived: ${before}`);
        } finally { writeFileSync(path, source); }
        green(); console.log(`RED/restored GREEN: ${file}: ${before}`);
    }
} finally { for (const [file, source] of sources) writeFileSync(new URL(file, import.meta.url), source); }
for (const [file, source] of sources) assert.equal(hash(readFileSync(new URL(file, import.meta.url), 'utf8')), hash(source));
console.log(`${faults.length} inquiry mutations refused; both suites independently GREEN after each; source hashes match`);
