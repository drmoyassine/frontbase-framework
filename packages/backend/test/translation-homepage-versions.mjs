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
// One server-pruned alternative (authenticated) and one client-evaluated alternative (url query).
const versionedLayout = { root: { directoryLanding: { version: 1, settings: defaultTemplateSettings() } }, content: [
    { id: 'heading', type: 'Heading', props: { text: 'Explore institutions' } },
    { id: 'seasonal', type: 'Heading', props: { text: 'Find your program' },
        versions: [{ id: 'members', name: 'Members', when: 'user.authenticated', overrides: { props: { text: 'Member directory' } } }] },
    { id: 'promo', type: 'Heading', props: { text: 'Seasonal offers' },
        versions: [{ id: 'featured', name: 'Featured', when: "url.query.promo == '1'", overrides: { props: { text: 'Featured offers' } } }] },
    { id: 'foot', type: 'Footer', props: { logoText: 'Study site', copyright: 'All rights reserved.', columns: [] } }] };
const base = { summary: '', cover: null, coverAlt: '', logo: null };
const records = () => ({ cities: [{ id: 9, title: 'Boston' }], institutions: [{ ...base, id: 1, title: 'Alpha University', originalPath: '/one/', summary: 'Alpha summary', cityId: 9, body: null }], programs: [], articles: [] });
const node = queryId => ({ id: queryId, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/one/' } : {} } }, children: [] });
const templates = [{ pageId: '00000000-0000-4000-8000-0000000000a1', role: 'directory', title: 'Directory', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'directory' } }, content: [node('directory.institution.list')] } },
    { pageId: '00000000-0000-4000-8000-0000000000a2', role: 'institution', title: 'Institution', description: '',
    layout: { root: { siteConfiguration: { version: 1, role: 'institution' } }, content: [node('directory.institution.detail')] } }];
const pages = new PagesStore(f.db, tenant); await pages.create({ name: 'Homepage', slug: 'home', is_homepage: true, layout_data: versionedLayout }, pageId, now);
const store = new SitePublicationManifestStore(f.db, tenant), reviews = new SitePublicationReviewStore(f.db, tenant);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/homepage/';
async function call(path, body, status = 200) { const r = await app.request('https://site.test' + root + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.equal(r.status, status, await r.clone().text()); const value = await r.json(); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|data\.example/); return value; }
const html = async path => { const r = await renderReviewedSitePublication(f.db, tenant, new Request('https://site.test' + path)); return { status: r?.status, headers: r?.headers, text: await r?.text() }; };
async function prepareActivate() {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates, staticPages: [{ pageId, title: 'Home', description: 'Study abroad', originalPath: '/', layout: versionedLayout }] }, records(), now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
async function saveAndPublishLocale(review) {
    for (let i = 0; i < review.fields.length; i += 16) await call('save/', { locale: 'ar', token: review.token, entries: review.fields.slice(i, i + 16).map(field => ({ id: field.id, token: field.token, text: 'عربي ' + field.source })) });
    const complete = await call('review/?locale=ar'); assert.equal(complete.complete, true);
    const prepared = await call('prepare/', { locale: 'ar', token: complete.token, approveTranslations: true });
    await call('publish/', { hash: prepared.hash, expected: prepared.expected, approveTranslations: true });
    return prepared;
}
try {
    await prepareActivate();
    // The review surfaces the Default field and the alternative override as separate units.
    const review = await call('review/?locale=ar'); assert.equal(review.complete, false);
    const defaultField = review.fields.find(field => field.source === 'Find your program'), membersField = review.fields.find(field => field.source === 'Member directory');
    assert.ok(defaultField && membersField, 'both versions are reviewed');
    assert.notEqual(defaultField.id, membersField.id);
    const prepared = await saveAndPublishLocale(review);
    // Anonymous /ar/ renders the selected Default with its released translation. The
    // authenticated alternative is server-pruned entirely; the client-evaluated one ships
    // as a template carrying its own released text for hydration.
    const arabic = await html('/ar/'); assert.equal(arabic.status, 200); assert.equal(arabic.headers.get('Content-Language'), 'ar');
    const doc = new JSDOM(arabic.text).window.document;
    assert.equal(doc.documentElement.lang, 'ar'); assert.equal(doc.documentElement.dir, 'rtl');
    assert.ok(arabic.text.includes('عربي Find your program'));
    assert.ok(arabic.text.includes('عربي Seasonal offers'));
    assert.ok(arabic.text.includes('data-block-versions="promo"')); assert.ok(arabic.text.includes('data-block-active="default"'));
    assert.ok(arabic.text.includes('data-block-version="featured"'), 'the client-evaluated alternative ships as a template');
    assert.ok(arabic.text.includes('عربي Featured offers'), 'the alternative template carries its released translation');
    assert.ok(!arabic.text.includes('Member directory'), 'the server-pruned alternative never reaches anonymous output');
    assert.ok(!arabic.text.includes('data-block-versions="seasonal"'), 'server-known-impossible alternatives are pruned, not templated');
    const source = await html('/'); assert.equal(source.status, 200);
    assert.ok(source.text.includes('Find your program')); assert.ok(source.text.includes('Featured offers'));
    assert.ok(!source.text.includes('Member directory')); assert.ok(!source.text.includes('عربي'));

    // Release catalog carries one entry per version with engine unit identity.
    const release = await readHomepageRelease(f.db, tenant, prepared.hash);
    const scope = { tenantId: tenant, projectId: release.project };
    const seasonal = release.catalog.filter(candidate => candidate.blockId === 'seasonal');
    assert.equal(seasonal.length, 2);
    const defaultEntry = seasonal.find(candidate => !candidate.versionId), membersEntry = seasonal.find(candidate => candidate.versionId === 'members');
    assert.equal(defaultEntry.text, 'عربي Find your program');
    assert.equal(membersEntry.text, 'عربي Member directory');
    assert.equal(defaultEntry.unitId, await translationUnitId(scope, { kind: 'component', documentId: release.pageId, blockId: 'seasonal', versionId: 'default', propertyPath: ['props', 'text'] }));
    assert.equal(membersEntry.unitId, await translationUnitId(scope, { kind: 'component', documentId: release.pageId, blockId: 'seasonal', versionId: 'members', propertyPath: ['props', 'text'] }));
    const stored = (await pages.get(pageId)).layout_data, draftLayout = typeof stored === 'string' ? JSON.parse(stored) : stored;
    assert.equal(draftLayout.content[1].versions[0].overrides.props.text, 'Member directory', 'publication never rewrites stored drafts');

    auth = false; await call('review/?locale=ar', undefined, 401); auth = true; role = 'viewer'; await call('review/?locale=ar', undefined, 403); role = 'owner';
    console.log('translation-homepage versions PASS: version-aware review units, anonymous Default serving, filtered alternatives, per-version catalog identity and draft preservation');
} finally { f.close(); }
