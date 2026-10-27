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
import { readHomepageRelease, assertNoIdentityCollision } from '../dist/compat/translation-homepage.js';
const f = await allowanceFixture(), tenant = 'alpha';
const config = emptyDirectoryConfiguration(); config.site = { name: 'Study site', destination: 'USA', origin: 'https://site.test', locale: 'en' }; config.datasourceId = 'content';
for (const role of ['institution', 'program', 'city']) { const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 }; Object.assign(m.fields, { id: 'id', title: 'title' }); if (role !== 'city') m.fields.originalPath = 'path'; }
config.collections.institution.fields.cityId = 'city'; config.collections.program.fields.institutionId = 'institution';
// Legacy directoryQuery lists: one static homepage (asc) and one static subpage (desc) over the same records.
const listNode = (id, sort, children) => ({ id, type: 'Repeater',
    props: { directoryQuery: { version: 1, queryId: 'directory.institution.list', params: { sort } } }, children });
const rowChildren = prefix => [
    { id: `${prefix}-t`, type: 'Heading', props: { recordBindings: { text: 'title' } } },
    { id: `${prefix}-s`, type: 'Paragraph', props: { recordBindings: { text: 'summary' } } },
    { id: `${prefix}-l`, type: 'Link', props: { recordBindings: { text: 'summary', href: 'originalPath', ariaLabel: 'title' } } },
    { id: `${prefix}-img`, type: 'Image', props: { recordBindings: { src: 'cover', alt: 'coverAlt', altFallback: 'title', hideWhenEmpty: true } } }];
const pageIdA = '00000000-0000-4000-8000-000000000030', pageIdB = '00000000-0000-4000-8000-000000000031';
const layoutA = { root: { directoryLanding: { version: 1, settings: defaultTemplateSettings() } }, content: [
    { id: 'heading', type: 'Heading', props: { text: 'Explore institutions' } }, listNode('ilist', 'title-asc', rowChildren('r'))] };
const layoutB = { root: {}, content: [
    { id: 'heading-b', type: 'Heading', props: { text: 'More institutions' } }, listNode('ilist2', 'title-desc', rowChildren('q'))] };
const base = { summary: '', cover: null, coverAlt: '', logo: null };
const records = () => ({ cities: [{ id: 9, title: 'Boston' }],
    institutions: [{ ...base, id: 1, title: 'Alpha University', originalPath: '/one/', summary: 'Alpha summary', cityId: 9, body: null, cover: 'https://cdn.example.org/alpha.png', coverAlt: 'Alpha campus' },
        { ...base, id: 2, title: 'Beta College', originalPath: '/two/', summary: 'Beta summary', cityId: 9, body: null, cover: 'https://cdn.example.org/beta.png', coverAlt: 'Beta campus' },
        { ...base, id: 3, title: 'Gamma Institute', originalPath: '/three/', summary: 'Gamma summary', cityId: 9, body: null, cover: 'https://cdn.example.org/gamma.png', coverAlt: 'Gamma campus' }],
    programs: [], articles: [] });
const node = queryId => ({ id: queryId, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/one/' } : {} } }, children: [] });
const templates = [{ pageId: '00000000-0000-4000-8000-0000000000a1', role: 'directory', title: 'Directory', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'directory' } }, content: [node('directory.institution.list')] } },
    { pageId: '00000000-0000-4000-8000-0000000000a2', role: 'institution', title: 'Institution', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'institution' } }, content: [node('directory.institution.detail')] } }];
const pages = new PagesStore(f.db, tenant);
await pages.create({ name: 'Home', slug: 'home', is_homepage: true, layout_data: layoutA }, pageIdA, now);
await pages.create({ name: 'More', slug: 'more/', layout_data: layoutB }, pageIdB, now);
const store = new SitePublicationManifestStore(f.db, tenant), reviews = new SitePublicationReviewStore(f.db, tenant);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/homepage/';
async function call(path, body, status = 200) { const r = await app.request('https://site.test' + root + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.equal(r.status, status, await r.clone().text()); const value = await r.json(); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|data\.example/); return value; }
const html = async path => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path)); return { status: r?.status, headers: r?.headers, text: await r?.text() }; };
const rowTitles = text => { const doc = new JSDOM(text).window.document;
    return [...doc.querySelectorAll('h1,h2,h3,h4')].map(element => element.textContent.trim()).filter(t => /University|College|Institute/.test(t)); };
async function prepareActivate(records_) {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates, staticPages: [
        { pageId: pageIdA, title: 'Home', description: 'Study abroad', originalPath: '/', layout: layoutA },
        { pageId: pageIdB, title: 'More', description: 'More options', originalPath: '/more/', layout: layoutB }] }, records_, now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
async function saveAndPublishLocale(review, path) {
    for (let i = 0; i < review.fields.length; i += 16) await call('save/', { locale: 'ar', path, token: review.token, entries: review.fields.slice(i, i + 16).map(field => ({ id: field.id, token: field.token, text: 'عربي ' + field.source })) });
    const complete = await call('review/?locale=ar' + (path === '/' ? '' : '&path=' + path)); assert.equal(complete.complete, true);
    const prepared = await call('prepare/', { locale: 'ar', token: complete.token, approveTranslations: true, ...(path === '/' ? {} : { path }) });
    await call('publish/', { hash: prepared.hash, expected: prepared.expected, approveTranslations: true });
    return prepared;
}
try {
    await prepareActivate(records());
    // Authored layouts may not forge projection stamps: the layout refine refuses the transient props.
    const forged = structuredClone(layoutA); forged.content[1].children[0].props.translationRecord = { connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 1 }] };
    await assert.rejects(() => store.prepare({ configurationRevision: 1, configuration: config, templates, staticPages: [{ pageId: pageIdA, title: 'Bad', description: '', originalPath: '/', layout: forged }] }, records(), now));
    const review = await call('review/?locale=ar'); assert.equal(review.complete, false);
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / title').length, 3, 'stamped rows surface their title column');
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / summary').length, 6, 'title+summary bindings both bind summary: Paragraph and Link');
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / coverAlt').length, 3, 'image alt follows the coverAlt column');
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / ariaLabel:summary').length, 3, 'composed link labels are record units keyed to the composite column');
    assert.ok(review.fields.some(field => field.source === 'Explore institutions'), 'page copy stays component-scoped');
    const prepared = await saveAndPublishLocale(review, '/');
    const arabic = await html('/ar/'); assert.equal(arabic.status, 200); assert.equal(arabic.headers.get('Content-Language'), 'ar');
    const doc = new JSDOM(arabic.text).window.document;
    assert.equal(doc.documentElement.lang, 'ar'); assert.equal(doc.documentElement.dir, 'rtl');
    assert.deepEqual(rowTitles(arabic.text), ['عربي Alpha University', 'عربي Beta College', 'عربي Gamma Institute']);
    assert.ok(arabic.text.includes('aria-label="عربي Alpha summary: Alpha University"'), 'composed labels render translated bound text and source title');
    assert.ok(arabic.text.includes('alt="عربي Alpha campus"'), 'alt text follows the record unit');
    // Release identity: stamped fields name their source column and match the shared record unit.
    const release = await readHomepageRelease(f.db, tenant, prepared.hash);
    const scope = { tenantId: tenant, projectId: release.project };
    const recordEntries = release.catalog.filter(entry => entry.record);
    assert.equal(recordEntries.length, 15, '12 bound columns plus the 3 composed link labels');
    for (const entry of recordEntries) {
        assert.ok(['title', 'summary', 'coverAlt', 'ariaLabel:summary'].includes(entry.fieldKey), 'catalog entries carry the stamped column');
        assert.equal(entry.unitId, await translationUnitId(scope, { kind: 'record', connectionId: entry.record.connectionId, collection: entry.record.collection, key: entry.record.key, propertyPath: [entry.fieldKey] }));
    }
    assert.equal(release.catalog.filter(entry => entry.fieldKey === 'ariaLabel:summary').length, 3, 'composed labels share the record-unit identity namespace');
    // Identity-collision fence: one stable unit identity can never carry two different sources.
    const collisionEntry = (blockId, sourceText) => ({ blockId, path: ['props', 'text'],
        record: { connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 1 }] }, fieldKey: 'title', sourceText });
    await assert.rejects(async () => assertNoIdentityCollision([collisionEntry('x', 'Alpha'), collisionEntry('y', 'Beta')]), /translation_identity_collision/);
    await assert.doesNotReject(async () => assertNoIdentityCollision([collisionEntry('x', 'Alpha'), collisionEntry('y', 'Alpha')]));

    // Second page, reversed order: the same record units are already draft; only page copy is missing.
    const reviewB = await call('review/?locale=ar&path=/more/'); assert.equal(reviewB.complete, false);
    assert.equal(reviewB.fields.filter(field => field.state === 'draft' && field.label.startsWith('Record institutions / ')).length, 15, 'every record unit carries over across pages, composed labels included');
    const preparedB = await saveAndPublishLocale({ ...reviewB, fields: reviewB.fields.filter(field => field.state === 'missing') }, '/more/');
    const releaseB = await readHomepageRelease(f.db, tenant, preparedB.hash);
    const unitOf = (release, column, value) => release.catalog.find(entry => entry.fieldKey === column && entry.sourceText.includes(value))?.unitId;
    assert.equal(unitOf(releaseB, 'title', 'Alpha University'), unitOf(release, 'title', 'Alpha University'), 'one unit per record field across pages');
    const more = await html('/ar/more/'); assert.equal(more.status, 200); assert.equal(more.headers.get('Content-Language'), 'ar');
    assert.deepEqual(rowTitles(more.text), ['عربي Gamma Institute', 'عربي Beta College', 'عربي Alpha University'], 'each page renders the shared translations in its own order');

    // A source change still invalidates every surface at once.
    const renamed = records(); renamed.institutions[0].title = 'Alpha University Rebranded';
    await prepareActivate(renamed);
    assert.equal((await html('/ar/')).status, 503, 'renamed record text invalidates both releases');
    assert.equal((await html('/ar/more/')).status, 503);
    const staleA = await call('review/?locale=ar');
    assert.ok(staleA.fields.some(field => field.source === 'Alpha University Rebranded' && field.state === 'outdated'), 'the renamed record field is outdated, not lost');
    const staleB = await call('review/?locale=ar&path=/more/');
    assert.ok(staleB.fields.some(field => field.source === 'Alpha University Rebranded' && field.state === 'outdated'), 'staleness is shared through the unit, not per page');

    auth = false; await call('review/?locale=ar', undefined, 401); auth = true; role = 'viewer'; await call('review/?locale=ar', undefined, 403); role = 'owner';
    console.log('translation-homepage directory PASS: stamped legacy-list record identity, cross-page shared units, per-page order, composed-label and alt handling, shared invalidation');
} finally { f.close(); }
