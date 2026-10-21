import assert from 'node:assert/strict';
import * as standalone from '@frontbase/translation';
import * as compatibility from '@frontbase/edge-core/localization';
// Identity contract: every standalone export exists here with the identical implementation.
// edge-core additionally exposes the framework's own localization surface (display-field
// extraction, browsing/nav labels, direction helper) — pinned explicitly so both sides
// grow consciously.
const standaloneKeys=Object.keys(standalone).sort(),compatKeys=Object.keys(compatibility).sort();
assert.deepEqual(standaloneKeys.filter(key=>!compatKeys.includes(key)),[],'edge-core/localization must carry every standalone export');
for (const key of standaloneKeys) assert.equal(compatibility[key], standalone[key], `Compatibility export differs: ${key}`);
assert.deepEqual(compatKeys.filter(key=>!standaloneKeys.includes(key)),['applyHomepageDisplayFields','directoryBrowsingLabels','formatLocalePattern','homepageDisplayFields','homepageDisplayLayout','homepageHeroLabels','homepageNavLabels','homepageSearchLabels','localeDirection','localizeNavigationProps','localizePublicHref','pluralPatternLabel','templateMenuLabels']);
await import('../../translation/test/localization.mjs');
console.log('localization compatibility: identical standalone export identities PASS');
