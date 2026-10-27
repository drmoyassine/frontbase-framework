import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { translationUnitId } from '@frontbase/edge-core/localization';
import { createMenuDefinition, publicMenuAudience } from '@frontbase/edge-core/menus';
import { createCompatApp } from '../dist/compat/app.js';
import { SitePublicationManifestStore } from '../dist/compat/site-publication-manifest.js';
import { SitePublicationReviewStore } from '../dist/compat/site-publication-review-store.js';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { MenusStore } from '../dist/compat/menus-store.js';
const f = await allowanceFixture(), tenant = 'alpha', pageId = '00000000-0000-4000-8000-000000000030';
const config = emptyDirectoryConfiguration(); config.site = { name: 'Study site', destination: 'USA', origin: 'https://site.test', locale: 'en' }; config.datasourceId = 'content';
for (const role of ['institution', 'program', 'city']) { const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 }; Object.assign(m.fields, { id: 'id', title: 'title' }); if (role !== 'city') m.fields.originalPath = 'path'; }
config.collections.institution.fields.cityId = 'city'; config.collections.program.fields.institutionId = 'institution';
// 60 institutions across two chunks: the render window (16) must never read as the catalog size.
const cities = [1, 2, 3].map(id => ({ id, title: `City ${id}` }));
const institutions = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, title: `Institution ${i + 1}`, originalPath: `/institution-${i + 1}/`,
    summary: `Summary ${i + 1}`, cover: null, coverAlt: `Alt ${i + 1}`, logo: null, cityId: (i % 3) + 1, body: `Long body ${i + 1}` }));
const listBinding = { componentId: 'list', dataSourceId: 'frontbase:publication', tableName: 'institutions', source: { kind: 'publication', hash: 'a'.repeat(64) },
    pagination: { enabled: true, page: 0, pageSize: 16 }, sorting: { enabled: true, column: 'title', direction: 'asc' },
    filtering: { searchEnabled: false, filters: {} }, columnOrder: ['title'], columnOverrides: {}, hiddenFilters: [] };
const staticLayout = { root: {}, content: [
    { id: 'heading', type: 'Heading', props: { text: 'Explore institutions' } },
    { id: 'list', type: 'Repeater', props: { binding: listBinding }, children: [
        { id: 'row-title', type: 'Heading', props: { text: '{{ record.title }}' } },
        { id: 'row-summary', type: 'Paragraph', props: { text: '{{ record.summary }}' } }] },
    { id: 'promo', type: 'Heading', props: { text: 'Seasonal offers' },
        versions: [{ id: 'featured', name: 'Featured', when: "url.query.promo == '1'", overrides: { props: { text: 'Featured offers' } } }]}] };
const node = (queryId, children = []) => ({ id: queryId, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/institution-1/' } : {} } }, children });
const templates = [{ pageId: '00000000-0000-4000-8000-0000000000b1', role: 'directory', title: 'Directory', description: 'Browse destinations',
    layout: { root: { siteConfiguration: { version: 1, role: 'directory' } }, content: [node('directory.institution.list', [
        { id: 'row-link', type: 'Link', props: { recordBindings: { text: 'summary', href: 'originalPath', ariaLabel: 'title' } } }]), node('directory.program.list')] } },
    { pageId: '00000000-0000-4000-8000-0000000000b2', role: 'institution', title: 'Institution', description: 'Institution profile',
    layout: { root: { siteConfiguration: { version: 1, role: 'institution' } }, content: [node('directory.institution.detail')] } }];
const menus = new MenusStore(f.db, tenant), header = createMenuDefinition('header-main', 'header');
header.name = 'Main'; header.design.brand = 'Study in USA'; header.design.copyright = '© 2026 Study site';
header.items = [{ id: 'm-institutions', label: 'Institutions', href: '/directory/', audience: publicMenuAudience(),
    children: [{ id: 'm-programs', label: 'Programs', href: '/directory/?type=program', audience: publicMenuAudience(), children: [] }] }];
assert.notEqual(await menus.save([header], 0, now), null);
const store = new SitePublicationManifestStore(f.db, tenant), reviews = new SitePublicationReviewStore(f.db, tenant);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/coverage/';
async function call(query = '', status = 200) { const r = await app.request('https://site.test' + root + query); assert.equal(r.status, status, await r.clone().text()); return await r.json(); }
async function prepareActivate() {
    const hash = await store.prepare({ configurationRevision: 1, configuration: config, templates,
        staticPages: [{ pageId, title: 'Home', description: 'Study abroad portal', originalPath: '/', layout: staticLayout }] },
        { cities, institutions, programs: [], articles: [] }, now);
    await reviews.approve({ hash, checks: { content: true, media: true, layout: true, urls: true, ctas: true }, note: 'Fixture reviewed' }, 'reviewer', now);
    await reviews.activate(hash, (await new SitePublicationStore(f.db, tenant).activeVersion())?.pointer ?? null, now);
    return hash;
}
try {
    await prepareActivate();
    const report = await call();
    assert.equal(report.version, 1);
    assert.match(report.site.hash, /^[a-f0-9]{64}$/);
    // Complete catalog enumeration: 60 institutions over 3 chunks, regardless of any render window.
    assert.equal(report.totals.index.institutions, 60); assert.equal(report.totals.index.cities, 3);
    assert.equal(report.totals.chunks, 3); assert.equal(report.totals.staticPages, 1); assert.equal(report.totals.templates, 2); assert.equal(report.totals.menus, 1);
    // The "only 16 institutions" class of truncation, resolved: window vs catalog total, from real evidence.
    // Two surfaces list institutions: the static binding (window 16) and the legacy directory query (page-size default).
    const institutionLists = report.lists.filter(item => item.collection === 'institutions');
    assert.equal(institutionLists.length, 2);
    assert.ok(institutionLists.every(item => item.total === 60));
    assert.ok(institutionLists.some(item => item.window === 16), 'the render window is evidence, never the catalog size');
    assert.equal(report.terminology.approvedStore, 'none');
    const exclusion = reason => report.exclusions.find(item => item.reason === reason);
    assert.equal(exclusion('record-id').count, 63); assert.equal(exclusion('identifier-url').count, 60);
    assert.equal(exclusion('structural-reference').count, 60); assert.equal(exclusion('exceeds-plain-text-limits').count, 60);
    assert.equal(exclusion('record-projected-subtree').count, 3, 'the static binding rows and the directory list link row template'); assert.equal(exclusion('menu-empty-unsupported').count, 2, 'header menus expose copyright/description as footer-only');

    // Static-page surface: authored fields plus engine labels; placeholders never become fields.
    const home = report.surfaces.items.find(item => item.kind === 'static-page');
    assert.equal(home.path, '/'); assert.deepEqual(home.renderedColumns['publication:institutions'], ['summary', 'title']);
    const texts = home.fields.map(field => field.text);
    assert.ok(texts.includes('Explore institutions') && texts.includes('Home') && texts.includes('Study abroad portal'));
    assert.ok(texts.includes('Powered by Frontbase'), 'engine labels are inventoried');
    assert.ok(texts.every(text => !text.includes('{{ record.')), 'record placeholders stay excluded');
    const featured = home.fields.find(field => field.versionId === 'featured');
    assert.equal(featured.text, 'Featured offers'); assert.match(featured.fingerprint, /^[a-f0-9]{64}$/);
    for (const field of home.fields) { assert.equal(field.decision, 'translatable'); assert.match(field.fingerprint, /^[a-f0-9]{64}$/); assert.match(field.ref, /^[a-f0-9]{64}$/); }
    // Template surfaces carry rendered-column evidence per query.
    const institutionTemplate = report.surfaces.items.find(item => item.kind === 'template' && item.role === 'institution');
    assert.ok(institutionTemplate, 'institution template inventoried');

    // Coverage is deterministic: a second call returns byte-identical JSON.
    const totals = await call();
    assert.deepEqual(JSON.stringify(totals), JSON.stringify(report), 'coverage is deterministic');

    // Menus: labels inventoried with batch-engine identity; empty design fields excluded with a reason.
    let found = report.surfaces.items.find(item => item.kind === 'menu') ?? null, cursor = report.surfaces.next;
    while (!found && cursor) { const page = await call('?surfacesAfter=' + encodeURIComponent(cursor)); found = page.surfaces.items.find(item => item.kind === 'menu') ?? null; cursor = page.surfaces.next; }
    assert.ok(found, 'menu surface inventoried');
    assert.equal(found.menuId, 'header-main');
    const menuTexts = found.fields.map(field => field.text);
    assert.ok(menuTexts.includes('Study in USA') && menuTexts.includes('Institutions') && menuTexts.includes('Programs'));
    assert.equal(found.fields.length, 3, 'brand and two labels; footer-only copyright/description slots are excluded');

    // Records: complete pagination sees every record exactly once, with shared engine identity.
    const seen = { institutions: [], cities: [] };
    let recordOne = null;
    const collect = section => { for (const item of section.items) { seen[item.collection].push(item.id);
            if (item.collection === 'institutions' && item.id === 1) recordOne = item; } };
    collect(report.records);
    let recordCursor = report.records.next;
    while (recordCursor) { const page = await call('?recordsAfter=' + encodeURIComponent(recordCursor)); collect(page.records); recordCursor = page.records.next; }
    assert.deepEqual([...new Set(seen.institutions)].sort((a, b) => a - b), Array.from({ length: 60 }, (_, i) => i + 1), 'all 60 institutions enumerated');
    assert.deepEqual([...new Set(seen.cities)].sort((a, b) => a - b), [1, 2, 3]);
    const scope = f.scope;
    const expected = await translationUnitId(scope, { kind: 'record', connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 1 }], propertyPath: ['title'] });
    const titleField = recordOne.fields.find(field => field.text === 'Institution 1');
    assert.equal(titleField.ref, expected, 'record refs are the shared engine unit identity');
    assert.deepEqual(titleField.record, { connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 1 }] });
    // Composed link labels are discovered as record units keyed to the composite column, recomposed
    // from the stored columns — the same identity the release stamps (directory/bindings).
    const composed = recordOne.fields.find(field => field.propertyPath[0] === 'ariaLabel:summary');
    assert.equal(composed.text, 'Summary 1: Institution 1', 'discovery recomposes composed link labels from the record columns');
    assert.equal(composed.ref, await translationUnitId(scope, { kind: 'record', connectionId: 'frontbase:publication', collection: 'institutions', key: [{ column: 'id', value: 1 }], propertyPath: ['ariaLabel:summary'] }), 'composed labels share the record-unit identity namespace');
    const reasons = Object.fromEntries(recordOne.fields.filter(field => field.decision === 'excluded').map(field => [field.propertyPath[0], field.reason]));
    assert.equal(reasons.originalPath, 'identifier-url'); assert.equal(reasons.body, 'exceeds-plain-text-limits'); assert.equal(reasons.id, 'record-id');
    assert.ok(!/PRIVATE_|serviceKey|data\.example/.test(JSON.stringify(report)), 'no credentials in coverage');
    await call('?surfacesAfter=zzz', 422); await call('?recordsAfter=institutions:x', 422);
    auth = false; await call('', 401); auth = true; role = 'viewer'; await call('', 403); role = 'owner';
    console.log('translation-coverage PASS: complete catalog enumeration (window 16 vs total 60), stable refs/fingerprints, explicit exclusions, paginated surfaces+records, menu identity, deterministic, no-leak');
} finally { f.close(); }
