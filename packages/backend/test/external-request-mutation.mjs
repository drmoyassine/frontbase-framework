import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';

// Execute only with the primary's exclusive backend source/build lock.
const source = repoRoot + 'packages/backend/src/compat/external-http.ts';
const original = readFileSync(source, 'utf8');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const faults = [
    ['Request POST body and headers retained',
        'const request = new Request(input, init);',
        'const request = new Request(input.url, { signal: init.signal ?? input.signal });',
        'FAIL Request POST retains method headers body and manual redirects'],
    ['Request URL guard before transport',
        ['checkedExternalUrl(input.url);', 'checkedExternalUrl(request.url);'],
        ['// Deliberate fault: skip supplied Request URL validation.', '// Deliberate fault: skip native Request URL validation.'],
        'FAIL Request private URL is refused before body transfer or transport'],
    ['Request manual redirect enforcement',
        "redirect: 'manual',\n                signal: cancellation.signal,",
        'signal: cancellation.signal,',
        'FAIL Request redirects reject and follow opt-in refuses before transport'],
    ['Request caller abort listener',
        "caller.addEventListener('abort', callerAborted, { once: true });",
        '// Deliberate fault: caller abort is not forwarded.',
        'FAIL Request caller cancellation works without AbortSignal.any'],
    ['Request bounded deadline listener',
        "deadline.addEventListener('abort', deadlineAborted, { once: true });",
        '// Deliberate fault: deadline abort is not forwarded.',
        'FAIL Request caller signal cannot disable the ten second deadline'],
];
function gate() {
    const result = spawnSync(process.execPath, [repoRoot + 'packages/backend/test/external-request.mjs'], {
        cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.equal(result.error, undefined, 'functional process completes');
    assert.equal(result.signal, null, 'functional process not interrupted');
    assert.notEqual(result.status, null, 'known functional exit status');
    return result;
}
function baseline(label) {
    assert.equal(buildPackage('@frontbase/backend'), true, label + ' rebuild succeeds');
    const result = gate();
    assert.equal(result.status, 0, label + ' GREEN: ' + result.stdout + result.stderr);
    assert.match(result.stdout, /external Request: 13 passed, 0 failed; raw global calls 0/);
}
baseline('initial');
try {
    for (const [name, before, after, failure] of faults) {
        const anchors = Array.isArray(before) ? before : [before];
        const replacements = Array.isArray(after) ? after : [after];
        let mutant = original;
        for (const [index, anchor] of anchors.entries()) {
            assert.equal(original.split(anchor).length, 2, name + ' unique source anchor');
            mutant = mutant.replace(anchor, replacements[index]);
        }
        try {
            writeFileSync(source, mutant);
            assert.equal(buildPackage('@frontbase/backend'), true, name + ' fault compiles');
            const result = gate();
            assert.equal(result.status, 1, name + ' functional RED');
            assert.ok((result.stdout + result.stderr).includes(failure), name + ' named wrong behavior detected: ' + result.stdout + result.stderr);
            assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|ENOTFOUND|Unexpected raw global transport/, name + ' not an infrastructure or live transport failure');
        } finally { writeFileSync(source, original); }
        baseline(name + ' independently restored');
        console.log('RED / rebuilt independently restored GREEN: ' + name);
    }
} finally {
    writeFileSync(source, original);
    baseline('final restored');
    assert.equal(hash(readFileSync(source)), hash(original), 'original source SHA256 restored');
}
console.log('external Request mutation5/5 passed; source SHA256 restored: ' + hash(original));
