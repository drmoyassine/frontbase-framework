import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { emptyDirectoryConfiguration, defaultTemplateSettings } from '@frontbase/edge-core/directory/configuration';
import { translationUnitId } from '@frontbase/edge-core/localization';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { SitePublicationManifestStore } from '../dist/compat/site-publication-manifest.js';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../dist/compat/site-publication-review-store.js';
import { renderReviewedSitePublication } from '../dist/compat/site-publication-serving.js';
import { readHomepageRelease } from '../dist/compat/translation-homepage.js';
const f = await allowanceFixture(), tenant = 'alpha', pageId = '00000000-0000-4000-8000-000000000020';
const config = emptyDirectoryConfiguration(); config.site = { name: 'Study site', destination: 'USA', origin: 'https://site.test', locale: 'en' }; config.datasourceId = 'content';
for (const role of ['institution', 'program', 'city']) { const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 }; Object.assign(m.fields, { id: 'id', title: 'title' }); if (role !== 'city') m.fields.originalPath = 'path'; }
config.collections.institution.fields.cityId = 'city'; config.collections.program.fields.institutionId = 'institution';
const binding = (hash, direction = 'asc', componentId = 'list') => ({ componentId, dataSourceId: 'frontbase:publication', tableName: 'institutions', source: { kind: 'publication', hash },
    pagination: { enabled: false, pageSize: 12, page: 0 }, sorting: { enabled: true, column: 'title', direction }, filtering: { searchEnabled: false, filters: {} }, columnOverrides: {} });
const listLayout = (hash, direction = 'asc', second = false) => ({ root: { directoryLanding: { version: 1, settings: defaultTemplateSettings() } }, content: [
    { id: 'heading', type: 'Heading', props: { text: 'Explore institutions' } },
    { id: 'list', type: 'Repeater', props: { binding: binding(hash, direction) },
        children: [{ id: 't', type: 'Heading', props: { text: '{{ record.title }}' } }, { id: 's', type: 'Paragraph', props: { text: '{{ record.summary }}' } }] },
    ...(second ? [{ id: 'list2', type: 'Repeater', props: { binding: binding(hash, direction, 'list2') },
        children: [{ id: 't2', type: 'Heading', props: { text: '{{ record.title }}' } }] }] : []),
    { id: 'foot', type: 'Footer', props: { logoText: 'Study site', copyright: 'All rights reserved.', columns: [] } }] });
const base = { summary: '', cover: null, coverAlt: '', logo: null };
const institution = () => [{ ...base, id: 1, title: 'Alpha University', originalPath: '/one/', summary: 'Alpha summary', cityId: 9, body: null },
    { ...base, id: 2, title: 'Beta College', originalPath: '/two/', summary: 'Beta summary', cityId: 9, body: null },
    { ...base, id: 3, title: 'Gamma Institute', originalPath: '/three/', summary: 'Gamma summary', cityId: 9, body: null }];
const records = rename => ({ cities: [{ id: 9, title: 'Boston' }], institutions: institution().map(row => rename && row.id === 1 ? { ...row, title: rename } : row), programs: [], articles: [] });
const node = queryId => ({ id: queryId, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/one/' } : {} } }, children: [] });
const templates = [{ pageId: '00000000-0000-4000-8000-0000000000a1', role: 'directory', title: 'Directory', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'directory' } }, content: [node('directory.institution.list')] } },
    { pageId: '00000000-0000-4000-8000-0000000000a2', role: 'institution', title: 'Institution', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'institution' } }, content: [node('directory.institution.detail')] } }];
const pages = new PagesStore(f.db, tenant); await pages.create({ name: 'Homepage', slug: 'home', is_homepage: true, layout_data: listLayout('a'.repeat(64)) }, pageId, now);
const store = new SitePublicationManifestStore(f.db, tenant), reviews = new SitePublicationReviewStore(f.db, tenant);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/homepage/';
async function call(path, body, status = 200) { const r = await app.request('https://site.test' + root + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.equal(r.status, status, await r.clone().text()); const value = await r.json(); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|data\.example/); return value; }
const html = async path => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path)); return { status: r?.status, headers: r?.headers, text: await r?.text() }; };
const rowTitles = text => [...new JSDOM(text).window.document.querySelectorAll('h1,h2,h3,h4')].map(element => element.textContent.trim()).filter(t => /University|College|Institute/.test(t));
// Publish a reviewed manifest with the given records and homepage layout; returns its hash.
async function prepareActivate(records_, layout) {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates, staticPages: [{ pageId, title: 'Home', description: 'Study abroad', originalPath: '/', layout }] }, records_, now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
const plainLayout = { root: { directoryLanding: { version: 1, settings: defaultTemplateSettings() } }, content: [{ id: 'heading', type: 'Heading', props: { text: 'Explore institutions' } }] };
async function saveAndPublishLocale(review) {
    for (let i = 0; i < review.fields.length; i += 16) await call('save/', { locale: 'ar', token: review.token, entries: review.fields.slice(i, i + 16).map(field => ({ id: field.id, token: field.token, text: 'عربي ' + field.source })) });
    const complete = await call('review/?locale=ar'); assert.equal(complete.complete, true);
    const prepared = await call('prepare/', { locale: 'ar', token: complete.token, approveTranslations: true });
    await call('publish/', { hash: prepared.hash, expected: prepared.expected, approveTranslations: true });
    return prepared;
}
try {
    // Snapshot S0: plain homepage (the list must bind to an already-published snapshot hash).
    const s0 = await prepareActivate(records(), plainLayout);
    // Snapshot A: the same records rendered through one publication-bound Repeater (asc).
    await prepareActivate(records(), listLayout(s0));
    const original = (await pages.get(pageId)).layout_data;
    let review = await call('review/?locale=ar'); assert.equal(review.complete, false);
    assert.ok(review.fields.some(field => field.source === 'Explore institutions'), 'block fields stay component-scoped');
    assert.ok(review.fields.some(field => field.source === 'Alpha summary'), 'record rows surface their fields');
    assert.equal(review.fields.filter(field => /^Record \d+ \//.test(field.label)).length, 6, 'three rows × title+summary');
    const prepared = await saveAndPublishLocale(review);
    const arabic = await html('/ar/'); assert.equal(arabic.status, 200); assert.equal(arabic.headers.get('Content-Language'), 'ar');
    const doc = new JSDOM(arabic.text).window.document;
    assert.equal(doc.documentElement.lang, 'ar'); assert.equal(doc.documentElement.dir, 'rtl');
    assert.deepEqual(rowTitles(arabic.text), ['عربي Alpha University', 'عربي Beta College', 'عربي Gamma Institute']);
    for (const [title, summary] of [['Alpha', 'Alpha summary'], ['Beta', 'Beta summary'], ['Gamma', 'Gamma summary']]) {
        assert.ok(arabic.text.includes('عربي ' + summary)); assert.ok(arabic.text.includes('عربي ' + title));
    }
    // Release identity: record fields carry the shared record unit, block fields keep component units.
    const release = await readHomepageRelease(f.db, tenant, prepared.hash);
    const scope = { tenantId: tenant, projectId: release.project };
    const recordEntries = release.catalog.filter(entry => entry.record);
    assert.equal(recordEntries.length, 6);
    for (const entry of recordEntries) assert.equal(entry.unitId, await translationUnitId(scope, { kind: 'record', connectionId: entry.record.connectionId, collection: entry.record.collection, key: entry.record.key, propertyPath: [entry.path.at(-1)] }));
    const heading = release.catalog.find(entry => entry.blockId === 'heading');
    assert.equal(heading.record, undefined);
    assert.equal(heading.unitId, await translationUnitId(scope, { kind: 'component', documentId: release.pageId, blockId: 'heading', versionId: 'default', propertyPath: ['props', 'text'] }));
    assert.equal((await pages.get(pageId)).layout_data, original, 'publication never rewrites stored drafts');

    // Reorder: the same records re-published with the list sorted descending.
    await prepareActivate(records(), listLayout(s0, 'desc'));
    assert.equal((await html('/ar/')).status, 503, 'a new snapshot requires a reviewed release even when texts are identical');
    assert.equal((await html('/')).status, 200);
    const reReview = await call('review/?locale=ar'); assert.equal(reReview.complete, true, 'record-keyed units reuse the existing translations');
    assert.equal(f.aiCalls(), 0);
    const rePrepared = await saveAndPublishLocale({ ...reReview, fields: [] });
    const desc = await html('/ar/'); assert.equal(desc.status, 200);
    assert.deepEqual(rowTitles(desc.text), ['عربي Gamma Institute', 'عربي Beta College', 'عربي Alpha University'], 'translated text follows its record, not the rendered position');

    // Two Repeaters over the same records share one unit per record field.
    await prepareActivate(records(), listLayout(s0, 'asc', true));
    assert.equal((await html('/ar/')).status, 503);
    const twinReview = await call('review/?locale=ar'); assert.equal(twinReview.complete, true);
    const twinPrepared = await saveAndPublishLocale({ ...twinReview, fields: [] });
    const twin = await html('/ar/'); assert.equal(twin.status, 200);
    const twinDoc = new JSDOM(twin.text).window.document;
    assert.equal([...twinDoc.querySelectorAll('h1,h2,h3,h4')].filter(element => element.textContent.trim() === 'عربي Gamma Institute').length, 2, 'both lists render the same released record text');

    // A source text change still invalidates: publish the renamed records, then rebind the list to them.
    const s4 = await prepareActivate(records('Alpha University Rebranded'), plainLayout);
    await prepareActivate(records('Alpha University Rebranded'), listLayout(s4));
    assert.equal((await html('/ar/')).status, 503, 'renamed record text invalidates the release');
    const stale = await call('review/?locale=ar'); assert.equal(stale.complete, false);
    assert.ok(stale.fields.some(field => field.source === 'Alpha University Rebranded' && field.state === 'outdated'), 'the renamed record field is outdated, not lost');

    auth = false; await call('review/?locale=ar', undefined, 401); auth = true; role = 'viewer'; await call('review/?locale=ar', undefined, 403); role = 'owner';
    console.log('translation-homepage records PASS: record-keyed identity, reorder-safe release reuse, shared-unit dedupe across lists, draft preservation and source-change refusal');
} finally { f.close(); }
