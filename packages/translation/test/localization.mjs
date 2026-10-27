import assert from 'node:assert/strict';
import { languageConfigurationSchema, messageUnitSchema, translationRevisionSchema,
    translationUnitId, messageSourceFingerprint, compareLocaleSitemapUrls,
    extractRichTextSegments, applyRichTextTranslations } from '@frontbase/translation';

const scope = { tenantId: 'owner-a', projectId: 'usa' };
const config = { version: 1, scope, sourceLocale: 'en', locales: [{ code: 'en', direction: 'ltr', enabled: true }, { code: 'AR', direction: 'rtl', enabled: true }],
    storage: { datasourceId: 'content-or-separate' }, missingPolicy: 'unavailable', outdatedPolicy: 'retain-published' };
assert.equal(languageConfigurationSchema.parse(config).locales[1].code, 'ar');
for (const storageId of ['source-db', 'another-db']) assert.equal(languageConfigurationSchema.parse({ ...config, storage: { datasourceId: storageId } }).storage.datasourceId, storageId);
assert.equal(languageConfigurationSchema.safeParse({ ...config, sourceLocale: 'not_a_locale' }).success, false);
assert.equal(languageConfigurationSchema.safeParse({ ...config, locales: [...config.locales, { code: 'ar', direction: 'rtl', enabled: true }] }).success, false);
assert.equal(languageConfigurationSchema.safeParse({ ...config, sourceLocale: 'fr' }).success, false);
assert.equal(languageConfigurationSchema.safeParse({ ...config, storage: { datasourceId: 'db', namespace: 'public;DROP TABLE x' } }).success, false);
assert.equal(languageConfigurationSchema.safeParse({ ...config, storage: { datasourceId: 'db', secret: 'never' } }).success, false);

const resource = { kind: 'record', connectionId: 'stable-source', collection: 'institutions', key: [{ column: 'site', value: 'usa' }, { column: 'id', value: 123 }], propertyPath: ['description'] };
const unit = { version: 1, scope, resource, sourceLocale: 'en', format: 'plain', text: 'Apply to {$name}', segmenterVersion: 1, placeholders: ['name'] };
const unitId = await translationUnitId(scope, resource);
assert.equal(unitId, await translationUnitId(scope, { ...resource, key: resource.key.slice().reverse() }));
assert.notEqual(unitId, await translationUnitId({ ...scope, tenantId: 'owner-b' }, resource));
assert.notEqual(unitId, await translationUnitId({ ...scope, projectId: 'uae' }, resource));
assert.notEqual(unitId, await translationUnitId(scope, { ...resource, connectionId: 'other-source' }));
assert.notEqual(unitId, await translationUnitId(scope, { ...resource, key: [{ column: 'id', value: '123' }, { column: 'site', value: 'usa' }] }));
const sourceHash = await messageSourceFingerprint(unit);
assert.notEqual(sourceHash, await messageSourceFingerprint({ ...unit, text: 'Apply now to {$name}' }));
assert.notEqual(sourceHash, await messageSourceFingerprint({ ...unit, segmenterVersion: 2 }));
assert.notEqual(sourceHash, await messageSourceFingerprint({ ...unit, placeholders: ['other'] }));
assert.equal(unitId, await translationUnitId(scope, messageUnitSchema.parse({ ...unit, text: 'Edited source' }).resource));
await assert.rejects(() => translationUnitId(scope, { ...resource, propertyPath: ['__proto__'] }));
await assert.rejects(() => translationUnitId(scope, { ...resource, key: [{ column: 'id', value: 1 }, { column: 'id', value: 2 }] }));
const draft = { version: 1, scope, unitId, revisionId: 'human-1', locale: 'ar', sourceFingerprint: sourceHash, text: 'قدّم طلبك', provenance: 'manual', expectedHead: null };
assert.equal(translationRevisionSchema.safeParse({ ...draft, published: true }).success, false, 'Revision payload cannot self-publish');
assert.equal(translationRevisionSchema.parse(draft).provenance, 'manual');

const inventory = { version: 1, scope, sourceLocale: 'en', targetLocale: 'ar', sourceOrigin: 'https://example.com', targetOrigin: 'https://example.com', targetPrefix: '/ar',
    sourceUrls: ['https://example.com', 'https://example.com/blog/Apply%20Now/', 'https://example.com/explore/?type=program'],
    targetUrls: ['https://example.com/ar', 'https://example.com/ar/blog/Apply%20Now/', 'https://example.com/ar/explore/?type=program'] };
const prefix = compareLocaleSitemapUrls(inventory);
assert.equal(prefix.classification, 'prefix-only-candidates');
assert.equal(prefix.pairs.length, 3);
assert.equal(prefix.readyForRouteImport, false);
assert.equal(prefix.pairs[0].sourceUrl, 'https://example.com', 'Keep source homepage literal without adding slash');
assert.equal(prefix.pairs[0].targetUrl, 'https://example.com/ar');
assert.equal(prefix.pairs[1].targetUrl, inventory.targetUrls[1], 'Keep encoding, case and trailing slash');
assert.equal(compareLocaleSitemapUrls({ ...inventory, sourceUrls: [...inventory.sourceUrls, inventory.sourceUrls[0]] }).sourceCount, 3);
const translated = { ...inventory, sourceUrls: ['https://example.com/about/'], targetUrls: ['https://example.com/ar/عن-الموقع/'] };
const unresolved = compareLocaleSitemapUrls(translated);
assert.equal(unresolved.classification, 'mapping-review-required');
assert.deepEqual(unresolved.unmatchedSource, translated.sourceUrls);
assert.deepEqual(unresolved.unmatchedTarget, translated.targetUrls);
assert.equal(unresolved.pairs.length, 0, 'Never align different slugs by sitemap position');
const verified = compareLocaleSitemapUrls({ ...translated, verifiedPairs: [{ sourceUrl: translated.sourceUrls[0], targetUrl: translated.targetUrls[0], evidence: 'stable-source-id', evidenceRef: 'wp:page:42' }] });
assert.equal(verified.classification, 'translated-slugs-confirmed');
assert.equal(verified.confirmedTranslatedSlugs, 1);
assert.equal(verified.readyForRouteImport, true);
const pairs = inventory.sourceUrls.map((sourceUrl, index) => ({ sourceUrl, targetUrl: inventory.targetUrls[index], evidence: 'manual', evidenceRef: 'review:42' }));
assert.equal(compareLocaleSitemapUrls({ ...inventory, verifiedPairs: pairs }).readyForRouteImport, true);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, verifiedPairs: [pairs[0], pairs[0]] }), /conflicting_locale_mapping/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, verifiedPairs: [{ ...pairs[0], sourceUrl: 'https://evil.test' }] }), /mapping_not_in_sitemap_inventory/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['https://evil.test/ar/'] }), /sitemap_origin_mismatch/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['https://example.com/arabic/'] }), /sitemap_locale_prefix_mismatch/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['javascript:alert(1)'] }), /invalid_sitemap_url/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['https:example.com/ar/'] }), /invalid_sitemap_url/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['https://example.com/ar/#fragment'] }), /invalid_sitemap_url/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, targetUrls: ['https://user:secret@example.com/ar/'] }), /invalid_sitemap_url/);
assert.throws(() => compareLocaleSitemapUrls({ ...inventory, sourceUrls: ['https://example.com', 'https://example.com/'] }), /ambiguous_sitemap_url_literals/);
assert.equal(compareLocaleSitemapUrls({ ...inventory, sourceUrls: [] }).classification, 'empty-inventory');
const subdomain = compareLocaleSitemapUrls({ ...inventory, targetOrigin: 'https://ar.example.com', targetPrefix: '', targetUrls: inventory.targetUrls.map(url => url.replace('https://example.com/ar', 'https://ar.example.com')) });
assert.equal(subdomain.pairs.length, 3);
assert.equal(subdomain.readyForRouteImport, false);
const rich = { version: 1, children: [{ kind: 'element', id: 'p', tag: 'p', children: [
    { kind: 'text', id: 'intro', text: 'Welcome {{record.name}}' },
    { kind: 'element', id: 'link', tag: 'a', href: '/apply/?type=program', children: [{ kind: 'text', id: 'cta', text: 'Apply' }] },
] }] };
assert.deepEqual(extractRichTextSegments(rich).map(segment => segment.ancestors), [['p'], ['p', 'a']]);
const patches = [{ id: 'intro', text: 'مرحباً {{record.name}}' }, { id: 'cta', text: 'قدّم طلبك' }];
const localized = applyRichTextTranslations(rich, patches);
assert.equal(localized.children[0].children[1].href, '/apply/?type=program');
assert.equal(localized.children[0].children[1].children[0].text, 'قدّم طلبك');
assert.equal(rich.children[0].children[0].text, 'Welcome {{record.name}}');
assert.throws(() => applyRichTextTranslations(rich, [{ id: 'intro', text: 'مرحباً {{record.secret}}' }, patches[1]]), /changed_rich_text_references/);
assert.throws(() => applyRichTextTranslations(rich, [patches[1]]), /missing_rich_text_translation/);
assert.throws(() => applyRichTextTranslations(rich, [...patches, { id: 'invented', text: 'x' }]), /unknown_rich_text_patch/);
assert.throws(() => applyRichTextTranslations(rich, [{ ...patches[0], href: 'javascript:alert(1)' }, patches[1]]));
assert.throws(() => extractRichTextSegments({ version: 1, children: [{ kind: 'element', id: 'x', tag: 'script', children: [] }] }));
assert.throws(() => extractRichTextSegments({ version: 1, children: [{ kind: 'element', id: 'x', tag: 'a', href: 'javascript:alert(1)', children: [] }] }), /unsafe_rich_text_link/);
const cyclic = { version: 1, children: [] }; cyclic.children.push(cyclic);
assert.throws(() => extractRichTextSegments(cyclic), /rich_text_tree_limit/);
console.log('localization: typed config, isolated stable identity, source invalidation, draft-only revisions, literal-preserving per-locale slug comparison, reviewed mappings and refusal boundaries PASS');
console.log('localization rich text: immutable structure/links/IDs, Arabic segments, protected bindings, complete patching, script/cycle refusals PASS');
