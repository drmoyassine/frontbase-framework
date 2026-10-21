import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { emptyDirectoryConfiguration, migrateExploreRepeater } from '@frontbase/edge-core/directory/configuration';
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
    institutions: Array.from({ length: 14 }, (_, i) => ({ summary: `Summary ${pad(i + 1)}`, cover: `https://cdn.example.org/${i + 1}.png`, coverAlt: `Campus ${pad(i + 1)}`, logo: null, id: i + 1, title: `Institution ${pad(i + 1)}`, originalPath: `/inst-${i + 1}/`, cityId: 9, body: null, publishedAt: '2024-03-09' })),
    programs: [{ summary: 'Alpha program', cover: null, coverAlt: '', logo: null, id: 101, title: 'Program Alpha', originalPath: '/program-alpha/', institutionId: 1, body: null, publishedAt: '2023-11-02' },
        { summary: 'Beta program', cover: null, coverAlt: '', logo: null, id: 102, title: 'Program Beta', originalPath: '/program-beta/', institutionId: 1, body: null, publishedAt: '2023-11-02' },
        { summary: 'Gamma program', cover: null, coverAlt: '', logo: null, id: 103, title: 'Program Gamma', originalPath: '/program-gamma/', institutionId: 2, body: null, publishedAt: '2023-11-02' }],
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
            { id: 'browse', type: 'Container', props: { directoryBrowsing: { version: 1, tabs: true, search: true, sorting: true, filters: true, pagination: true, recordCount: true } }, children: [] },
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
    return [...doc.querySelectorAll('h1,h2,h3,h4')].map(element => element.textContent.trim()).filter(t => /Institution|Program|آخر/.test(t)); };
async function prepareActivate(records_, templates_ = templates) {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates: templates_, staticPages: [
        { pageId: pageIdA, title: 'Home', description: 'Study abroad', originalPath: '/', layout: layoutA }] }, records_, now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
async function saveAll(review, path, policy, overrides = {}) {
    // One record unit can surface in several display positions; a batch boundary between two of
    // them makes the earlier batch's write stale the later batch's review tokens. The console
    // re-reads the review between saves — model that instead of replaying one stale token page.
    for (let i = 0; i < review.fields.length; i += 16) {
        const fresh = await call('review/?locale=ar' + (path === '/' ? '' : '&path=' + path));
        await call('save/', { locale: 'ar', path, token: fresh.token, entries: fresh.fields.slice(i, i + 16).map(field => ({ id: field.id, token: field.token, text: overrides[field.source] ?? ('عربي ' + field.source) })) });
    }
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
    await saveAll(review, '/explore/', { missing: 'source-fallback', outdated: 'source-fallback' }, { 'Institution 03': 'عربي آخر' });
    const home = await html('/ar/'); assert.equal(home.status, 200); assert.ok(home.text.includes('عربي Study in the USA'));
    const explore = await html('/ar/explore/'); assert.equal(explore.status, 200); assert.equal(explore.headers.get('Content-Language'), 'ar');
    const doc = new JSDOM(explore.text).window.document;
    assert.equal(doc.documentElement.lang, 'ar'); assert.equal(doc.documentElement.dir, 'rtl');
    assert.ok(explore.text.includes('>عربي Institutions</a>'), 'tab chrome renders the translated label');
    assert.ok(explore.text.includes('>عربي Apply</button>'), 'control chrome renders the translated label');
    assert.ok(explore.text.includes('placeholder="عربي Find an institution"'), 'search placeholder follows the release');
    assert.ok(explore.text.includes('عربي Title A-Z'), 'sorting options follow the release');
    assert.deepEqual(rowTitles(explore.text), ['01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'].map(n => `عربي Institution ${n}`), 'title sort follows localized titles (03 sorts last)');
    assert.ok(explore.text.includes('alt="عربي Campus 01"'));
    assert.ok(explore.text.includes('عربي Page 1'), 'composed page position renders the released pattern');
    assert.ok(explore.text.includes('عربي 1-12 of 14 records'), 'the browsing total is the localized full-dataset count');
    // Parameterized renderings join the shared units through the supplement, without serve-time store reads.
    const programs = await html('/ar/explore/?type=program'); assert.equal(programs.status, 200);
    assert.deepEqual(rowTitles(programs.text), ['عربي Program Alpha', 'عربي Program Beta', 'عربي Program Gamma'], 'supplement-only units join parameterized renderings');
    const second = await html('/ar/explore/?page=2'); assert.equal(second.status, 200);
    assert.deepEqual(rowTitles(second.text), ['عربي Institution 14', 'عربي آخر'], 'localized ordering moves 03 beside the supplement-covered 14');
    // Task 8 slice A: localized queries run over the full index by released titles — not one source page.
    const sourceDesc = await html('/explore/?sort=title-desc'); assert.equal(sourceDesc.status, 200);
    assert.ok(rowTitles(sourceDesc.text)[0] === 'Institution 14', 'the source listing keeps source ordering');
    const sourceSecond = await html('/explore/?page=2');
    assert.deepEqual(rowTitles(sourceSecond.text), ['Institution 13', 'Institution 14'], 'source pagination stays source-ordered');
    const localizedDesc = await html('/ar/explore/?sort=title-desc'); assert.equal(localizedDesc.status, 200);
    assert.deepEqual(rowTitles(localizedDesc.text), ['عربي آخر', ...['14', '13', '12', '11', '10', '09', '08', '07', '06', '05', '04'].map(n => `عربي Institution ${n}`)], 'the sort control orders by released titles');
    const arabicMatch = await html('/ar/explore/?q=' + encodeURIComponent('عربي Institution 1')); assert.equal(arabicMatch.status, 200);
    assert.deepEqual(rowTitles(arabicMatch.text), ['10', '11', '12', '13', '14'].map(n => `عربي Institution ${n}`), 'Arabic matches span both source pages in one full-dataset search');
    assert.ok(arabicMatch.text.includes('عربي 1-5 of 5 records'), 'the exact total counts localized matches');
    const equalsMatch = await html('/ar/explore/?q=' + encodeURIComponent('عربي Institution 02') + '&match=equals'); assert.equal(equalsMatch.status, 200);
    assert.deepEqual(rowTitles(equalsMatch.text), ['عربي Institution 02'], 'equals matches the released title exactly');
    assert.ok(equalsMatch.text.includes('>عربي 1-1 of 1 record</p>'), 'a single localized match selects the singular registry variant');
    const arabicAll = await html('/ar/explore/?q=' + encodeURIComponent('عربي') + '&page=2'); assert.equal(arabicAll.status, 200);
    assert.deepEqual(rowTitles(arabicAll.text), ['عربي Institution 14', 'عربي آخر'], 'the final localized page agrees with the full-dataset order');
    assert.ok(arabicAll.text.includes('عربي 13-14 of 14 records') && !arabicAll.text.includes('>عربي Next</a'), 'the final page has an exact total and no next link');
    const empty = await html('/ar/explore/?q=zzznope'); assert.equal(empty.status, 200);
    assert.deepEqual(rowTitles(empty.text), [], 'a miss renders no rows');
    assert.ok(empty.text.includes('>عربي 0 records</p>'), 'an empty page reports zero, not a stale total');
    assert.ok(empty.text.includes('عربي No records matched this preview.'), 'the empty hint renders the released label in the page language');
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
    // The stale released title also leaves the localized query plan: searching it finds nothing
    // instead of matching the renamed record through stale text.
    const stale = await html('/ar/explore/?q=' + encodeURIComponent('عربي Institution 01')); assert.equal(stale.status, 200);
    assert.deepEqual(rowTitles(stale.text), [], 'a stale released title no longer drives matches');
    assert.ok(stale.text.includes('>عربي 0 records</p>'), 'stale titles leave the localized total too');
    // Task 8 slice B: the standard List Component conversion pins the migration-time publication;
    // the per-unit release survives by record identity — no re-translation. Interactive controls
    // stay coherent because the X-Frontbase-List fetch localizes through the page's own release,
    // and the SSR first paint runs the same localized query plan as the hydrated fetch.
    const pinnedHash = (await new SitePublicationStore(f.db, tenant).activeVersion()).pointer.hash;
    const convertedTemplates = templates.map(template => template.role === 'directory'
        ? { ...template, layout: migrateExploreRepeater(template.layout, pinnedHash, config) } : template);
    await prepareActivate(renamed, convertedTemplates);
    const converted = await html('/ar/explore/'); assert.equal(converted.status, 200);
    const convertedDoc = new JSDOM(converted.text).window.document;
    const switchLabels = [...convertedDoc.querySelectorAll('button')].map(button => button.textContent.trim());
    assert.ok(switchLabels.includes('Institutions') && switchLabels.includes('Programs'), 'switch buttons are new units and keep source copy');
    assert.ok(!converted.text.includes('data-react-component="Repeater"'), 'the converted list keeps its server-only first paint');
    assert.deepEqual(rowTitles(converted.text), ['Institution 01 Renamed', ...['02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'].map(n => `عربي Institution ${n}`)], 'the converted initialRows follow the localized query plan');
    const convertedPrograms = await html('/ar/explore/?type=program'); assert.equal(convertedPrograms.status, 200);
    assert.ok(convertedPrograms.text.includes('عربي Program Alpha') && convertedPrograms.text.includes('عربي Program Gamma'), 'the version-scoped rendering joins the same release catalog');
    const listFetch = async (path, query) => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path, { headers: { 'X-Frontbase-List': encodeURIComponent(JSON.stringify(query)) } })); assert.equal(r?.status, 200, await r?.clone().text()); return await r.json(); };
    const listQuery = { componentId: 'ilist', versionId: 'default', page: 0, pageSize: 12, sortColumn: 'title', direction: 'desc', filters: [] };
    const fetched = await listFetch('/ar/explore/', listQuery);
    assert.equal(fetched.total, 14, 'the fetch total is the localized full-dataset count');
    assert.deepEqual([fetched.rows[0].title, fetched.rows[1].title], ['عربي آخر', 'عربي Institution 14'], 'fetch rows carry released text in localized order');
    const fetchedMatch = await listFetch('/ar/explore/', { ...listQuery, filters: [{ column: 'title', op: 'contains', value: 'عربي Institution 1' }] });
    assert.equal(fetchedMatch.total, 5, 'localized matches span both source pages in the fetch too');
    assert.ok(fetchedMatch.rows.every(row => String(row.title).startsWith('عربي Institution 1')), 'the fetch filter matches released titles');
    const sourceFetch = await listFetch('/explore/', listQuery);
    assert.equal(sourceFetch.rows[0].title, 'Institution 14', 'the source-path fetch keeps source semantics');
    const staleFetch = await listFetch('/ar/explore/', { ...listQuery, filters: [{ column: 'title', op: 'contains', value: 'Institution 01' }] });
    assert.deepEqual(staleFetch.rows.map(row => row.title), ['Institution 01 Renamed'], 'a stale released title falls back to the row\'s own source text in fetches');
    const listLanguage = async (path, query) => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path, { headers: { 'X-Frontbase-List': encodeURIComponent(JSON.stringify(query)) } })); return r?.headers.get('Content-Language'); };
    assert.equal(await listLanguage('/ar/explore/', listQuery), 'ar', 'localized fetches declare the released language');
    assert.equal(await listLanguage('/explore/', listQuery), null, 'source-path fetches stay undeclared');
    // Deactivating the release must not break hydration on the prefixed URL: the fallback list
    // fetch strips the locale prefix and walks the source registry with source semantics. A fresh
    // homepage release keeps the strict locale tree available so the shell still serves.
    // Slice-C measurement (task 9): a released localized listing serve renders the source capture
    // once for the availability walk beside the localized capture (both memoized per request), so
    // its cost class is the source serve plus one extra capture — dominated by the same per-chunk
    // validation the capacity section measures. Printed timings with a generous fence only.
    const timed = async path => { const start = performance.now(); for (let i = 0; i < 3; i++) assert.equal((await html(path)).status, 200); return Math.round(performance.now() - start) / 3; };
    const sourceServeMs = await timed('/explore/'), localizedServeMs = await timed('/ar/explore/');
    assert.ok(localizedServeMs < 5000, 'the localized listing serve stays in the source cost class');
    console.log(`localized listing serve ${localizedServeMs}ms vs source ${sourceServeMs}ms (mean of 3; the delta is the bounded per-request availability capture)`);
    const explorePointer = (await call('locales/')).locales.find(item => item.path === '/explore/');
    await call('deactivate/', { locale: 'ar', path: '/explore/', expected: { hash: explorePointer.hash, generation: explorePointer.generation } });
    await saveAll(await call('review/?locale=ar'), '/');
    const dirLang = text => { const doc = new JSDOM(text).window.document; return doc.documentElement.getAttribute('lang') + '/' + doc.documentElement.getAttribute('dir'); };
    assert.equal((await html('/ar/explore/')).status, 200, 'the shell keeps serving source content after deactivation');
    assert.equal(dirLang((await html('/ar/explore/')).text), 'en/ltr', 'shared-shell fallback keeps the source language metadata');
    const fallbackFetch = await listFetch('/ar/explore/', listQuery);
    assert.equal(fallbackFetch.total, 14, 'a fallback localized fetch keeps the source inventory');
    assert.equal(fallbackFetch.rows[0].title, 'Institution 14', 'without the release the fetch keeps source semantics');
    assert.equal(await listLanguage('/ar/explore/', listQuery), null, 'catalog-less fallback fetches never claim a language');

    // Slice A (task 10): date output follows the page language. A fresh template revision binds
    // publishedAt as a formatted date; the review carries no unit for it (locale output, never a
    // surface — so serve-time locale projection leaves the release hash byte-stable), and the /ar/
    // serve re-formats it in Arabic beside lang/dir stamps resolved from the content language.
    // The date fixture rides on the query-scoped Repeater — record bindings are a directoryQuery
    // concept and the converted standard list carries none — so this final revision runs after
    // the fetch assertions and leaves no list fetch behind it.
    const dateTemplates = templates.map(template => template.role === 'directory'
        ? { ...template, layout: { ...template.layout, content: template.layout.content.map(node => node.id === 'ilist'
            ? { ...node, children: [...node.children, { id: 'r-date', type: 'Paragraph', props: { recordBindings: { text: 'publishedAt', format: 'date' } } }] } : node) } }
        : template);
    await prepareActivate(records(), dateTemplates);
    const dateReview = await call('review/?locale=ar&path=/explore/');
    const enDate = new Intl.DateTimeFormat('en', { timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date('2024-03-09T00:00:00Z'));
    assert.ok(!dateReview.fields.some(field => field.source === enDate), 'formatted dates never enter the review inventory');
    // Template listings always require the explicit per-unit policy (block defaults refuse).
    await saveAll(dateReview, '/explore/', { missing: 'source-fallback', outdated: 'source-fallback' });
    const datedSource = await html('/explore/'); assert.equal(datedSource.status, 200);
    assert.ok(datedSource.text.includes(enDate), 'source serves render the site-locale date');
    const datedAr = await html('/ar/explore/'); assert.equal(datedAr.status, 200);
    const arDate = new Intl.DateTimeFormat('ar', { timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date('2024-03-09T00:00:00Z'));
    assert.ok(datedAr.text.includes(arDate) && !datedAr.text.includes(enDate), 'the localized serve re-formats dates in the page language');
    assert.equal(dirLang(datedAr.text), 'ar/rtl', 'the localized document follows the content language');
    assert.equal(dirLang(datedSource.text), 'en/ltr', 'source serves keep the site direction stamp');

    auth = false; await call('review/?locale=ar&path=/explore/', undefined, 401); auth = true; role = 'viewer'; await call('review/?locale=ar&path=/explore/', undefined, 403); role = 'owner';
    console.log('translation-homepage explore PASS: template listing pages, per-unit-only releases, browsing chrome surfaces, paged record supplement, parameterized joins, per-unit fallback, record-detail refusal, standard-conversion fetch agreement, locale-following dates and direction');
} finally { f.close(); }
