import assert from 'node:assert/strict';
import { localeDirection } from '@frontbase/edge-core/localization';

// Canonical RTL scripts: every direction-stamping site (public serves, release previews,
// console translation preview) resolves through this one helper.
for (const locale of ['ar', 'ar-EG', 'AR', 'fa-IR', 'he', 'he-IL', 'ur-PK', 'ps', 'sd', 'ug', 'yi'])
    assert.equal(localeDirection(locale), 'rtl', locale);
// LTR languages, region/Script subtags, and hostile input never flip direction.
for (const locale of ['en', 'en-US', 'fr', 'de-DE', 'zh-Hans', 'es-419', 'arab', 'ara', '', '  ', 'a-'.repeat(40), 'ARABIC'])
    assert.equal(localeDirection(locale), 'ltr', locale);
// Subtag boundaries: 'arab'/'ara' are distinct languages, not RTL prefixes; an exact match
// wins only on the language subtag before the first '-'.
assert.equal(localeDirection('pa-Arab'), 'ltr'); // Punjabi in Arabic script: primary subtag governs (documented limit)
console.log('direction: localeDirection canonical RTL list, case/subtag boundaries, hostile-input ltr PASS');
