import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyLayoutDraftOperation, renderPage } from '@frontbase/edge-core';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { FRONTEND_EDITOR_SCRIPT } from '../dist/compat/frontend-editor.js';
import { LiveLayoutPublicationStore } from '../dist/compat/live-layout-publication.js';
import { renderLiveLayoutPublication } from '../dist/compat/live-layout-serving.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { TranslationStorageStore } from '../dist/compat/translation-storage.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { migrateUp } from '../dist/db/migrations.js';

const db = sqliteRunner(':memory:');
const now = '2026-11-22T00:00:00Z';
const owner = 'layout-owner';
const secret = 'isolated-shared-draft';
let role = 'owner';
let tenant = owner;
try {
    await migrateUp(db);
    const externalFetch = async (input, init) => {
        const request = new Request(input, init);
        assert.equal(new URL(request.url).hostname, 'translations.example.test');
        assert.equal((await request.json()).p_operation, 'read-current-many');
        return Response.json([]);
    };
    const app = await createCompatApp({
        makeRunner: async () => db,
        resolvePrincipal: async () => ({ user: { id: 'local-admin', role }, tenant }),
        sessionSecret: secret, now: () => now,
        externalFetch,
    });
    const source = new SyncStore(db, owner, await createSecretCipher(secret));
    await source.createDatasource({ name: 'Fixture', kind: 'sqlite', config: { url: ':memory:' } }, 'source', now);
    await source.createDatasource({ name: 'Translations', kind: 'supabase', config: { url: 'https://translations.example.test', serviceKey: 'test-only' } }, 'translations', now);
    await new TranslationStorageStore(db, owner).save({version:1,datasourceId:'translations',endpoint:'postgrest',namespace:'translations'},0,now);
    const binding = '{{ record.description }}';
    const layout = { root: {}, content: [{ id: 'tiles', type: 'Container', props: {}, children: [
        { id: 'about', type: 'Container', props: { _layerName: 'About' }, children: [{ id: 'about-text', type: 'Text', props: { text: binding } }] },
        { id: 'address', type: 'Container', props: { _layerName: 'Address' }, children: [{ id: 'address-text', type: 'Text', props: { text: 'Address' } }] },
    ] }] };
    const pages = new PagesStore(db, owner);
    const page = await pages.create({ name: 'Test layout', slug: 'layout', layout_data: layout }, crypto.randomUUID(), now);
    const config = emptyDirectoryConfiguration();
    config.site = { name: 'Test', origin: 'https://example.test', locale: 'en' };
    config.datasourceId = 'source';
    for (const [role, table] of [['city','cities'],['institution','institutions'],['program','programs']]) {
        const collection = config.collections[role];
        collection.table = table;
        collection.scope = { field: 'country', value: 22 };
        Object.assign(collection.fields, { id: 'id', title: 'title', ...(role === 'city' ? {} : { originalPath: 'path' }) });
    }
    config.collections.institution.fields.cityId = 'city_id';
    config.collections.program.fields.institutionId = 'institution_id';
    const publication = new LiveLayoutPublicationStore(db, owner);
    const hash = await publication.prepare({
        schemaVersion: 3, runtimeVersion: 'live-layout-v1', configuration: config, templates: [], locales: ['en', 'ar'],
        staticPages: [{ pageId: page.id, title: page.name, description: '', originalPath: '/layout/', layout }],
    }, now);
    await publication.publish(hash, null, now);
    const draftUrl = '/api/frontend-edit/layout-draft/';
    const pageUrl = '/api/pages/' + page.id + '/';
    const path = locale => (locale === 'ar' ? '/ar' : '') + '/layout/';
    const read = async url => {
        const result = await app.request(url);
        assert.equal(result.status, 200, await result.clone().text());
        return result.json();
    };
    const write = (url, body, headers = {}) => app.request(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Frontbase-Editor': '1', ...headers },
        body: JSON.stringify(body),
    });
    const waitFor = async condition => {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (condition()) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.fail('Editor action did not settle');
    };
    const builderBefore = (await read(pageUrl)).data;
    const first = await read(draftUrl + '?path=' + encodeURIComponent(path('en')));
    assert.equal((await read(draftUrl + '?path=' + encodeURIComponent(path('ar')))).revision, first.revision);
    role = 'viewer';
    assert.equal((await app.request(draftUrl + '?path=/layout/')).status, 403);
    role = 'owner';
    tenant = 'other';
    assert.notEqual((await app.request(draftUrl + '?path=/layout/')).status, 200);
    tenant = owner;
    const move = (id, siblingId) => ({ kind: 'move', id, siblingId, placement: 'before' });
    assert.equal((await write(draftUrl, { path: path('en'), pageId: page.id, revision: first.revision, operations: [move('about', 'tiles')] })).status, 422);
    assert.equal((await write(draftUrl, { path: path('en'), pageId: page.id, revision: first.revision, operations: [move('address', 'about')] }, { Origin: 'https://elsewhere.invalid' })).status, 403);

    async function openEditor(locale, device) {
        const url = 'http://localhost' + path(locale);
        const rendered = await renderLiveLayoutPublication(db, owner, new Request(url), {
            host: { syncFor: () => source, accountConfigFor: async () => null, externalFetch },
            liveQuery: async () => { throw Error('Unexpected live list query'); },
        });
        assert.equal(rendered?.status, 200);
        const dom = new JSDOM(await rendered.text(), { url, runScripts: 'outside-only' });
        const {window} = dom;
        window.CSS ??= {escape: value => value};
        window.matchMedia = () => ({ matches: device === 'mobile' });
        window.fetch = (url, init = {}) => app.request(new URL(url, window.location.href).href, { ...init, headers: { ...init.headers, Origin: 'http://localhost' } });
        const document = window.document;
        assert.equal(document.documentElement.dir, locale === 'ar' ? 'rtl' : 'ltr');
        const button = label => [...document.querySelectorAll('[data-frontbase-editor] button')].find(node => node.textContent === label);
        const click = label => { assert.ok(button(label), label); button(label).click(); };
        await window.eval(FRONTEND_EDITOR_SCRIPT);
        const pencil = document.querySelector('[data-pencil]');
        if (pencil) pencil.click();
        const layoutLabel = locale === 'ar' ? 'التخطيط' : 'Layout';
        await waitFor(() => button(layoutLabel));
        click(layoutLabel);
        await waitFor(() => !document.querySelector('[data-frontbase-editor] select').parentElement.hidden);
        const select = id => {
            const picker = document.querySelector('[data-frontbase-editor] select');
            picker.value = id;
            picker.dispatchEvent(new window.Event('change'));
        };
        return {dom,document,click,select};
    }
    const en = await openEditor('en', 'desktop');
    en.select('address');
    const drag = new en.dom.window.Event('dragstart', { bubbles: true });
    Object.defineProperty(drag, 'dataTransfer', { value: { setData() {} } });
    [...en.document.querySelectorAll('button')].find(button => button.textContent === 'Drag to move tile').dispatchEvent(drag);
    en.document.getElementById('about').dispatchEvent(new en.dom.window.MouseEvent('drop', { bubbles: true, clientY: -1 }));
    en.click('Narrower');
    en.click('Save layout draft');
    await waitFor(() => en.document.body.textContent.includes('Layout draft saved'));
    en.dom.window.close();
    const after = (await read(pageUrl)).data;
    assert.deepEqual(after.layoutData.content[0].children.map(node => node.id), ['address', 'about']);
    assert.equal(after.layoutData.content[0].children[1].children[0].props.text, binding);
    assert.equal(after.layoutData.content[0].children[0].stylesData.values.width, '90%');
    assert.equal((await write(pageUrl, { layoutData: builderBefore.layoutData }, { 'If-Match': '"' + builderBefore.contentHash + '"' })).status, 409);
    assert.equal((await write(draftUrl, { path: path('ar'), pageId: page.id, revision: first.revision, operations: [move('address','about')] })).status, 409);

    // Builder uses the shared operation and its normal versioned page save.
    let builderLayout = applyLayoutDraftOperation(after.layoutData, move('about', 'address'));
    builderLayout = applyLayoutDraftOperation(builderLayout, { kind: 'resize', id: 'about', viewport: 'mobile', width: 70 });
    const builderSave = await write(pageUrl, { layoutData: builderLayout }, { 'If-Match': '"' + after.contentHash + '"' });
    assert.equal(builderSave.status, 200, await builderSave.clone().text());

    for (const locale of ['en', 'ar']) for (const device of ['desktop', 'mobile']) {
        const editor = await openEditor(locale, device);
        try {
            assert.equal(editor.document.querySelector('#tiles').firstElementChild.id, 'about');
            assert.equal(editor.document.getElementById('address').style.width, '90%');
            assert.equal(editor.document.getElementById('about').style.width, device === 'mobile' ? '70%' : '100%');
        } finally { editor.dom.window.close(); }
    }
    const ar = await openEditor('ar', 'mobile');
    ar.select('about');
    ar.click('تضييق');
    ar.click('حفظ مسودة التخطيط');
    await waitFor(() => ar.document.body.textContent.includes('تم حفظ المسودة'));
    ar.dom.window.close();
    const final = (await read(pageUrl)).data.layoutData;
    assert.equal(final.content[0].children[0].children[0].props.text, binding);
    assert.equal(final.content[0].children[0].stylesData.viewportOverrides.mobile.width, '60%');
    const rendered = await renderPage(final, { user: {}, page: {}, app: {}, visitor: {}, url: {}, system: {}, cookies: {}, local: {}, session: {} });
    assert.ok(String(rendered).includes('60%'));
    const latest = await read(draftUrl + '?path=/layout/');
    const concurrent = await Promise.all([80, 75].map(width => write(draftUrl, {
        path: path('en'), pageId: page.id, revision: latest.revision,
        operations: [{ kind: 'resize', id: 'about', viewport: 'desktop', width }],
    })));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    assert.equal((await publication.active()).pointer.hash, hash, 'saving either editor does not change the active release');
    console.log('Shared layout draft: bidirectional saves, English/Arabic desktop/mobile frontend preview, stale saves, bindings and publication isolation PASS');
} finally {
    await db.close?.();
}
