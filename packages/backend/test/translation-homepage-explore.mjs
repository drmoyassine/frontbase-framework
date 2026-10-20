import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { translationUnitId } from '@frontbase/edge-core/localization';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { SitePublicationManifestStore } from '../dist/compat/site-publication-manifest.js';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../dist/compat/site-publication-review-store.js';
import { renderReviewedSitePublication } from '../dist/compat/site-publication-serving.js';
import { readHomepageRelease } from '../dist/compat/translation-homepage.js';
const f = await allowanceFixture(), tenant = 'alpha';
const config = emptyDirectoryConfiguration(); config.site = { name: 'Study site', destination: 'USA', origin: 'https://site.test', locale: 'en' }; config.datasourceId = 'content';
for (const role of ['institution', 'program', 'city']) { const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 }; Object.assign(m.fields, { id: 'id', title: 'title' }); if (role !== 'city') m.fields.originalPath = 'path'; }
config.collections.institution.fields.cityId = 'city'; config.collections.program.fields.institutionId = 'institution';
const pad = n => String(n).padStart(2, '0');
const records = () => ({ cities: [{ id: 9, title: 'Boston' }],
    institutions: Array.from({ length: 14 }, (_, i) => ({ summary: `Summary ${pad(i + 1)}`, cover: `https://cdn.example.org/${i + 1}.png`, coverAlt: `Campus ${pad(i + 1)}`, logo: null, id: i + 1, title: `Institution ${pad(i + 1)}`, originalPath: `/inst-${i + 1}/`, cityId: 9, body: null })),
    programs: [{ summary: 'Alpha program', cover: null, coverAlt: '', logo: null, id: 101, title: 'Program Alpha', originalPath: '/program-alpha/', institutionId: 1, body: null },
        { summary: 'Beta program', cover: null, coverAlt: '', logo: null, id: 102, title: 'Program Beta', originalPath: '/program-beta/', institutionId: 1, body: null },
        { summary: 'Gamma program', cover: null, coverAlt: '', logo: null, id: 103, title: 'Program Gamma', originalPath: '/program-gamma/', institutionId: 2, body: null }],
    articles: [] });
const rowChildren = prefix => [
    { id: `${prefix}-t`, type: 'Heading', props: { recordBindings: { text: 'title' } } },
    { id: `${prefix}-s`, type: 'Paragraph', props: { recordBindings: { text: 'summary' } } },
    { id: `${prefix}-l`, type: 'Link', props: { recordBindings: { text: 'summary', href: 'originalPath', ariaLabel: 'title' } } },
    { id: `${prefix}-img`, type: 'Image', props: { recordBindings: { src: 'cover', alt: 'coverAlt', altFallback: 'title', hideWhenEmpty: true } } }];
const node = (id, queryId, children = []) => ({ id, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/inst-1/' } : {} } }, children });
const templates = [
    { pageId: '00000000-0000-4000-8000-0000000000b1', role: 'directory', title: 'Explore', description: '',
        layout: { root: { siteConfiguration: { version: 1, role: 'directory' } }, content: [
            { id: 'browse', type: 'Container', props: { directoryBrowsing: { version: 1, tabs: true, search: true, sorting: true, filters: true, pagination: true } }, children: [] },
            node('ilist', 'directory.institution.list', rowChildren('r')),
            node('plist', 'directory.program.list', rowChildren('p'))] } },
    { pageId: '00000000-0000-4000-8000-0000000000b2', role: 'institution', title: 'Institution', description: '',
        layout: { root: { siteConfiguration: { version: 1, role: 'institution' } }, content: [node('detail', 'directory.institution.detail')] } },
    { pageId: '00000000-0000-4000-8000-0000000000b3', role: 'program', title: 'Program', description: '',
        layout: { root: { siteConfiguration: { version: 1, role: 'program' } }, content: [node('pdetail', 'directory.program.detail')] } }];
const pageIdA = '00000000-0000-4000-8000-0000000000b0';
const layoutA = { root: {}, content: [{ id: 'intro', type: 'Heading', props: { text: 'Study in the USA' } }] };
const pages = new PagesStore(f.db, tenant);
await pages.create({ name: 'Home', slug: 'home', is_homepage: true, layout_data: layoutA }, pageIdA, now);
const store = new SitePublicationManifestStore(f.db, tenant), reviews = new SitePublicationReviewStore(f.db, tenant);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/homepage/';
async function call(path, body, status = 200) { const r = await app.request('https://site.test' + root + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.equal(r.status, status, await r.clone().text()); const value = await r.json(); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|data\.example/); return value; }
const html = async path => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path)); return { status: r?.status, headers: r?.headers, text: await r?.text() }; };
const rowTitles = text => { const doc = new JSDOM(text).window.document;
    return [...doc.querySelectorAll('h1,h2,h3,h4')].map(element => element.textContent.trim()).filter(t => /Institution|Program/.test(t)); };
async function prepareActivate(records_) {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates, staticPages: [
        { pageId: pageIdA, title: 'Home', description: 'Study abroad', originalPath: '/', layout: layoutA }] }, records_, now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
async function saveAll(review, path, policy) {
    for (let i = 0; i < review.fields.length; i += 16) await call('save/', { locale: 'ar', path, token: review.token, entries: review.fields.slice(i, i + 16).map(field => ({ id: field.id, token: field.token, text: 'عربي ' + field.source })) });
    const complete = await call('review/?locale=ar' + (path === '/' ? '' : '&path=' + path)); assert.equal(complete.complete, true);
    const prepared = await call('prepare/', { locale: 'ar', token: complete.token, approveTranslations: true, ...(path === '/' ? {} : { path }), ...(policy ? { policy } : {}) });
    await call('publish/', { hash: prepared.hash, expected: prepared.expected, approveTranslations: true });
    return prepared;
}
try {
    await prepareActivate(records());
    // The console page inventory now offers the template listing beside the static pages.
    const pagesList = await call('pages/');
    assert.deepEqual(pagesList.pages.map(page => page.path), ['/', '/explore/']);
    // The explore review exposes browsing chrome and the bounded full record inventory (paged supplement).
    const review = await call('review/?locale=ar&path=/explore/'); assert.equal(review.complete, false);
    assert.ok(review.fields.some(field => field.label === 'institutions' && field.source === 'Institutions'), 'browsing chrome is a translation surface');
    assert.ok(review.fields.some(field => field.label === 'placeholderInstitution' && field.source === 'Find an institution'));
    assert.ok(review.fields.some(field => field.label === 'next' && field.source === 'Next'));
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / title').length, 14, '12 stamped on page one plus 2 from the supplement');
    assert.equal(review.fields.filter(field => field.label === 'Record programs / title').length, 3, 'the supplement carries the inactive collection too');
    assert.equal(review.fields.filter(field => field.label === 'Record institutions / coverAlt').length, 14, 'alt units cover records beyond page one');
    // Template listing releases refuse any strict dimension: parameterized renderings change the source set.
    await call('prepare/', { locale: 'ar', token: review.token, approveTranslations: true, path: '/explore/' }, 409);
    await call('prepare/', { locale: 'ar', token: review.token, approveTranslations: true, path: '/explore/', policy: { missing: 'source-fallback', outdated: 'block' } }, 409);
    // Record-detail paths stay outside per-page translation.
    await call('review/?locale=ar&path=/inst-1/', undefined, 422);
    // Static homepage keeps the strict default.
    const homeReview = await call('review/?locale=ar');
    const homePrepared = await saveAll(homeReview, '/');
    await saveAll(review, '/explore/', { missing: 'source-fallback', outdated: 'source-fallback' });
    const home = await html('/ar/'); assert.equal(home.status, 200); assert.ok(home.text.includes('عربي Study in the USA'));
    const explore = await html('/ar/explore/'); assert.equal(explore.status, 200); assert.equal(explore.headers.get('Content-Language'), 'ar');
    const doc = new JSDOM(explore.text).window.document;
    assert.equal(doc.documentElement.lang, 'ar'); assert.equal(doc.documentElement.dir, 'rtl');
    assert.ok(explore.text.includes('>عربي Institutions</a>'), 'tab chrome renders the translated label');
    assert.ok(explore.text.includes('>عربي Apply</button>'), 'control chrome renders the translated label');
    assert.ok(explore.text.includes('placeholder="عربي Find an institution"'), 'search placeholder follows the release');
    assert.ok(explore.text.includes('عربي Title A-Z'), 'sorting options follow the release');
    assert.deepEqual(rowTitles(explore.text), Array.from({ length: 12 }, (_, i) => `عربي Institution ${pad(i + 1)}`));
    assert.ok(explore.text.includes('alt="عربي Campus 01"'));
    assert.ok(explore.text.includes('Page 1'), 'composed page position stays source');
    // Parameterized renderings join the shared units through the supplement, without serve-time store reads.
    const programs = await html('/ar/explore/?type=program'); assert.equal(programs.status, 200);
    assert.deepEqual(rowTitles(programs.text), ['عربي Program Alpha', 'عربي Program Beta', 'عربي Program Gamma'], 'supplement-only units join parameterized renderings');
    const second = await html('/ar/explore/?page=2'); assert.equal(second.status, 200);
    assert.deepEqual(rowTitles(second.text), ['عربي Institution 13', 'عربي Institution 14'], 'records beyond page one join their supplement units');
    // The source homepage keeps refusing parameters on its localized path.
    assert.equal((await html('/ar/?type=program')).status, 400);
    // Record-detail paths stay source content under the localized prefix.
    const detail = await html('/ar/inst-1/'); assert.equal(detail.status, 200);
    assert.ok(detail.text.includes('Institution 01'), 'record-detail pages are not translated');
    // Release identity: supplement entries are real shared record units.
    const release = await readHomepageRelease(f.db, tenant, (await call('locales/')).locales.find(item => item.path === '/explore/').hash);
    const scope = { tenantId: tenant, projectId: release.project };
    const synthetic = release.catalog.filter(entry => entry.blockId.startsWith('$record:'));
    assert.ok(synthetic.length >= 9, 'paged supplement units are in the release catalog');
    for (const entry of synthetic) {
        assert.ok(entry.record, 'supplement entries carry record identity');
        assert.equal(entry.unitId, await translationUnitId(scope, { kind: 'record', connectionId: entry.record.connectionId, collection: entry.record.collection, key: entry.record.key, propertyPath: [entry.fieldKey] })); }
    // A source change falls back per unit: renamed record renders source, the rest stay translated.
    const renamed = records(); renamed.institutions[0].title = 'Institution 01 Renamed';
    await prepareActivate(renamed);
    assert.equal((await html('/ar/')).status, 503, 'the strict homepage release still invalidates wholesale');
    const fallback = await html('/ar/explore/'); assert.equal(fallback.status, 200);
    assert.ok(fallback.text.includes('Institution 01 Renamed'), 'renamed record falls back to fresh source');
    assert.ok(fallback.text.includes('عربي Institution 02'), 'fresh units keep serving');
    assert.equal((await html('/ar/explore/?page=2')).status, 200, 'parameterized fallback join still works');

    auth = false; await call('review/?locale=ar&path=/explore/', undefined, 401); auth = true; role = 'viewer'; await call('review/?locale=ar&path=/explore/', undefined, 403); role = 'owner';
    console.log('translation-homepage explore PASS: template listing pages, per-unit-only releases, browsing chrome surfaces, paged record supplement, parameterized joins, per-unit fallback, record-detail refusal');
} finally { f.close(); }
