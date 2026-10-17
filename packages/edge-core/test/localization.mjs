import assert from 'node:assert/strict';
import * as standalone from '@frontbase/translation';
import * as compatibility from '@frontbase/edge-core/localization';
assert.deepEqual(Object.keys(compatibility).sort(), Object.keys(standalone).sort());
for (const key of Object.keys(standalone)) assert.equal(compatibility[key], standalone[key], `Compatibility export differs: ${key}`);
await import('../../translation/test/localization.mjs');
console.log('localization compatibility: identical standalone export identities PASS');
