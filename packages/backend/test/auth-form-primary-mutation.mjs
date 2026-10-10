import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPackage, repoRoot } from '../../../scripts/mutation-lib.mjs';

// Primary runs this with the exclusive backend source/build lock.
const path = repoRoot + 'packages/backend/src/compat/routes/auth-forms.ts';
const original = readFileSync(path, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const faults = [
    ['getter uses persisted primary',
        'const primary = activeRows.find(isPrimaryForm);',
        'const primary = activeRows.find((row) => Boolean(parseConfig(row.config).is_primary));',
        'FAIL create, set primary, retrieve and switch two forms'],
    ['metadata edit preserves persisted primary',
        'const primary = body.config === undefined\n                ? isPrimaryForm(existing)\n                : Boolean(config.is_primary ?? existing.is_primary);',
        'const primary = Boolean(config.is_primary ?? existing.is_primary);',
        'FAIL metadata edit cannot resurrect stale configuration primary or clear chosen primary'],
    ['tenant-scoped clear preserves another owner',
        'UPDATE auth_forms SET is_primary = 0 WHERE tenant_slug = ?',
        'UPDATE auth_forms SET is_primary = 0 WHERE tenant_slug IS NOT NULL AND ? IS NOT NULL',
        'FAIL tenant switching and cross-owner IDs preserve both owners'],
];
function gate() {
    const result = spawnSync(process.execPath, [repoRoot + 'packages/backend/test/auth-form-primary.mjs'], {
        cwd: repoRoot, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.equal(result.error, undefined, 'test infrastructure must complete');
    assert.equal(result.signal, null, 'test process must not be interrupted');
    assert.notEqual(result.status, null, 'test exit status must be known');
    return result;
}
function restored(label) {
    assert.equal(buildPackage('@frontbase/backend'), true, label + ' rebuild succeeds');
    const result = gate();
    assert.equal(result.status, 0, label + ' functional GREEN: ' + result.stdout + result.stderr);
    assert.match(result.stdout, /auth primary: 7 passed, 0 failed/);
}
restored('initial baseline');
try {
    for (const [name, before, after, expectedFailure] of faults) {
        assert.equal(original.split(before).length, 2, name + ' unique source anchor');
        try {
            writeFileSync(path, original.replace(before, after));
            assert.equal(buildPackage('@frontbase/backend'), true, name + ' fault compiles');
            const result = gate();
            assert.equal(result.status, 1, name + ' actual functional gate RED');
            assert.ok((result.stdout + result.stderr).includes(expectedFailure), name + ' intended behavior failure: ' + result.stdout + result.stderr);
            assert.doesNotMatch(result.stdout + result.stderr, /SQLITE_ERROR|SQLITE_RANGE|wrong number of|bind.*parameter|too many.*parameter/i,
                name + ' fails on state behavior, not SQL infrastructure');
        } finally {
            writeFileSync(path, original);
        }
        restored(name + ' independently restored');
        console.log('RED / rebuilt independently restored GREEN: ' + name);
    }
} finally {
    writeFileSync(path, original);
    restored('final restored baseline');
    assert.equal(hash(readFileSync(path)), hash(original), 'original source SHA256 restored');
}
console.log('auth primary mutation3/3 passed; source SHA256 restored: ' + hash(original));
