import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { formatLocalePattern, pluralPatternLabel } from '../dist/localization/patterns.js';
import { directoryBrowsingLabels, homepageHeroLabels, templateMenuLabels, homepageDisplayLayout, homepageDisplayFields, applyHomepageDisplayFields } from '../dist/localization/surfaces.js';
import { renderDirectoryBrowsing } from '../dist/ssr/components/directoryBrowsing.js';
import { renderTemplateHero } from '../dist/ssr/components/templateLanding.js';
import { defaultTemplateSettings } from '../dist/directory/configuration.js';
import { startHeroSlides } from '../dist/hero-behavior.js';
import { validatePlainRevision } from '@frontbase/translation';

// Task 10 slice B: composed chrome strings ride parameterized, plural-aware released patterns.
// The pattern registry, the labels transport (directoryBrowsingState/templateMenuLabels), and the
// placeholder-parity guard form one mechanism — pinned together here.

// Substitution: known tokens compose, unknown tokens stay literal (never silently dropped).
assert.equal(formatLocalePattern('{from}-{to} of {total} records', { from: 1, to: 12, total: 14 }), '1-12 of 14 records');
assert.equal(formatLocalePattern('{missing}', { other: 1 }), '{missing}');
assert.equal(formatLocalePattern('{a}/{a}', { a: 2 }), '2/2');
assert.equal(formatLocalePattern('{1} {} {a b}', {}), '{1} {} {a b}', 'brace text outside the token grammar is literal');

// Plural categories: the exact base.<category> variant wins, absent variants fall back to the base.
const range = { recordsRange: 'R', 'recordsRange.one': 'R1' };
assert.equal(pluralPatternLabel(range, 'recordsRange', 'en', 1), 'R1');
assert.equal(pluralPatternLabel(range, 'recordsRange', 'en', 14), 'R');
assert.equal(pluralPatternLabel(range, 'recordsRange', undefined, 1), 'R', 'an absent locale keeps the base pattern');
assert.equal(pluralPatternLabel(range, 'recordsRange', 'zz-ZZ', 1), 'R', 'an unsupported locale keeps the base pattern');
assert.equal(pluralPatternLabel(range, 'recordsRange', 'en_US', 1), 'R', 'an invalid locale shape keeps the base pattern');
assert.equal(pluralPatternLabel({}, 'recordsRange', 'en', 1), '');
// Arabic rules: 1 selects the singular variant, 11 selects `many` (no variant carried → base).
assert.equal(new Intl.PluralRules('ar').select(1), 'one');
assert.equal(pluralPatternLabel(range, 'recordsRange', 'ar', 1), 'R1');
assert.equal(pluralPatternLabel(range, 'recordsRange', 'ar', 11), 'R');
// Every plural variant key in the registry owns its base pattern.
for (const key of Object.keys(directoryBrowsingLabels)) if (key.includes('.'))
    assert.ok(key.split('.')[0] in directoryBrowsingLabels, `variant ${key} has a base pattern`);

// English chrome is byte-identical to the pre-pattern output (released defaults, no translation).
const options = { version: 1, tabs: true, search: true, pagination: true, recordCount: true, sorting: true, filters: true };
const state = over => ({ path: '/explore/', collection: 'institution', q: '', searchEnabled: true, page: 1, hasNext: false, total: 14, pageSize: 12, ...over });
const english = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state()] });
assert.ok(english.includes('1-12 of 14 records'), 'range composition matches the legacy text');
assert.ok(english.includes('Page 1'), 'page status matches the legacy text');
const emptyEnglish = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state({ total: 0 })] });
assert.ok(emptyEnglish.includes('>0 records</p>'), 'zero composition matches the legacy text');
assert.ok(emptyEnglish.includes('fb-directory-empty') && emptyEnglish.includes('No records matched this preview.'), 'the empty hint renders the released label');

// Released-pattern composition: page-language patterns with Arabic plural categories.
const arLabels = { recordsRange: 'عربي {from}-{to} of {total} records', 'recordsRange.one': 'عربي {from}-{to} of {total} record',
    recordsZero: 'عربي 0 records', pageStatus: 'عربي Page {page}', emptyRecords: 'عربي No records matched this preview.' };
const arabic = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state({ locale: 'ar', labels: arLabels })] });
assert.ok(arabic.includes('عربي 1-12 of 14 records'), 'the page-language pattern composes the range');
assert.ok(arabic.includes('عربي Page 1'), 'the page-language pattern composes the page status');
const arabicOne = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state({ locale: 'ar', total: 1, labels: arLabels })] });
assert.ok(arabicOne.includes('>عربي 1-1 of 1 record</p>'), 'count 1 selects the singular registry variant');
const arabicEmpty = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state({ locale: 'ar', total: 0, labels: arLabels })] });
assert.ok(arabicEmpty.includes('>عربي 0 records</p>'), 'zero composes in the page language');
assert.ok(arabicEmpty.includes('عربي No records matched this preview.'), 'the empty hint follows the release');
// Without the serve locale the patterns still compose (preview paths keep the site language).
const preview = renderDirectoryBrowsing({ directoryBrowsing: options, directoryBrowsingState: [state({ labels: arLabels })] });
assert.ok(preview.includes('عربي 1-12 of 14 records'), 'a state without locale composes the base patterns');

// The labels transport: homepageDisplayLayout stamps the registries, extraction lists the pattern
// units, application writes translations back, and the composition renders them.
const layout = { root: {}, content: [
    { id: 'menu', type: 'Container', props: { templateMenu: { version: 1 } } },
    { id: 'browse', type: 'Container', props: { directoryBrowsing: { version: 1, tabs: true, search: true, pagination: true, recordCount: true },
        directoryBrowsingState: [{ path: '/explore/', collection: 'institution', q: '', searchEnabled: true, page: 1, hasNext: false, total: 14, pageSize: 12 }] } },
] };
const layoutBefore = JSON.stringify(layout);
const stamped = homepageDisplayLayout(layout);
const fields = homepageDisplayFields(stamped);
const unit = path => fields.find(field => JSON.stringify(field.path) === JSON.stringify(path));
const rangeField = unit(['props', 'directoryBrowsingState', '0', 'labels', 'recordsRange']);
assert.equal(rangeField && rangeField.text, '{from}-{to} of {total} records', 'the range pattern is a translatable unit');
assert.ok(unit(['props', 'directoryBrowsingState', '0', 'labels', 'recordsRange.one']), 'the singular variant is its own unit');
assert.ok(unit(['props', 'directoryBrowsingState', '0', 'labels', 'emptyRecords']), 'the empty hint is a translatable unit');
assert.equal(unit(['props', 'templateMenuLabels', 'browse']) && unit(['props', 'templateMenuLabels', 'browse']).text, 'Browse ☰', 'template-menu chrome joins the surface inventory');
const values = new Map(fields.map(field => [JSON.stringify([field.blockId, field.versionId ?? 'default', field.path]), field.text]));
values.set(JSON.stringify([rangeField.blockId, 'default', rangeField.path]), 'عربي {from}-{to} of {total} records');
const applied = applyHomepageDisplayFields(stamped, values);
const appliedNode = applied.content.find(node => node.id === 'browse');
const composed = renderDirectoryBrowsing(appliedNode.props);
assert.ok(composed.includes('عربي 1-12 of 14 records'), 'an applied release composes through the browsing chrome');
assert.equal(JSON.stringify(layout), layoutBefore, 'the carrier never mutates its input layout');

// Hero status: the SSR text and the client-side counter agree through the released pattern attribute.
const heroSettings = { ...defaultTemplateSettings().hero, mode: 'slider', controls: true, autoplay: true,
    slides: [{ src: 'https://media.test/one.png', alt: 'One', focalX: 40, focalY: 50 }, { src: 'https://media.test/two.png', alt: 'Two', focalX: 50, focalY: 30 }] };
const heroHtml = renderTemplateHero([{ settings: heroSettings, palette: { primary: '#122d50' }, destination: 'Hungary',
    labels: { ...homepageHeroLabels, slideStatus: 'عربي {index} / {count}', pause: 'عربي Pause slideshow', resume: 'عربي Resume slideshow' } }]);
assert.ok(heroHtml.includes('data-hero-status-pattern="عربي {index} / {count}"'), 'the SSR span carries the released pattern for the client');
assert.ok(heroHtml.includes('>عربي 1 / 2</span>'), 'the SSR text composes the pattern');
assert.ok(heroHtml.includes('data-hero-pause-label="عربي Pause slideshow"') && heroHtml.includes('data-hero-resume-label="عربي Resume slideshow"'), 'the pause button carries both released labels');
const heroDom = new JSDOM(heroHtml, { url: 'https://site.test/', pretendToBeVisual: true });
globalThis.window = heroDom.window; globalThis.document = heroDom.window.document;
let tick; window.setInterval = fn => { tick = fn; return 1; }; window.clearInterval = () => {};
window.matchMedia = () => ({ matches: false });
startHeroSlides();
const status = document.querySelector('[data-hero-status]');
document.querySelector('[data-hero-next]').dispatchEvent(new heroDom.window.Event('click', { bubbles: true }));
assert.equal(status.textContent, 'عربي 2 / 2', 'the client counter composes the same released pattern');
document.querySelector('[data-hero-pause]').dispatchEvent(new heroDom.window.Event('click', { bubbles: true }));
assert.equal(document.querySelector('[data-hero-pause]').textContent, 'عربي Resume slideshow', 'the pause toggle follows the released labels');
heroDom.window.close();

// Placeholder parity: the revision validator enforces single-brace pattern tokens exactly like
// double-brace bindings — a translation can never silently drop a placeholder.
const unitShape = { format: 'plain', text: '{from}-{to} of {total} records', placeholders: [] };
assert.equal(validatePlainRevision(unitShape, 'عربي {from}-{to} of {total} records'), null, 'a matching pattern translation passes');
assert.equal(validatePlainRevision(unitShape, 'عربي {to} of {total} records'), 'invalid-tokens', 'a dropped pattern token is refused');
assert.equal(validatePlainRevision(unitShape, '{total} of {from}-{to} records'), null, 'reordered pattern tokens pass');
const dollar = { format: 'plain', text: 'Hi {$name}', placeholders: [] };
assert.equal(validatePlainRevision(dollar, 'مرحبا {$name}'), null, 'double-brace parity still passes');
assert.equal(validatePlainRevision(dollar, 'مرحبا'), 'invalid-tokens', 'double-brace parity still refuses drops');
assert.equal(validatePlainRevision({ format: 'mf2', text: '', placeholders: [] }, ''), 'unsupported-format', 'format admission is unchanged');

console.log('localization patterns: bounded substitution, plural variants, registry transport, hero client agreement and placeholder parity PASS');
