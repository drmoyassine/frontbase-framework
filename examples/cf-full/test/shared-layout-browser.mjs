import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { serve } from '@hono/node-server';
import { chromium, expect } from '@playwright/test';
import { LiveLayoutPublicationStore, PagesStore, SyncStore, createSecretCipher } from '@frontbase/backend';
import { applyLayoutDraftOperation, renderPage } from '@frontbase/edge-core';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from '../dist/worker.mjs';

const runner = sqliteRunner(':memory:');
const secret = 'shared-layout-browser-fixture-only';
const admin = { email: 'owner@example.test', password: 'shared-layout-browser-fixture-password' };
const owner = '_root';
const now = () => new Date().toISOString();
const assetsRoot = new URL('../console-dist/', import.meta.url);
const assetTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let browser;
let server;
try {
    const engine = await createCmsEngine({
        runner, sessionSecret: secret, admin,
        externalFetch: async (input, init) => {
            const request = new Request(input, init);
            assert.equal(new URL(request.url).hostname, 'translations.example.test');
            assert.equal((await request.json()).p_operation, 'read-current-many');
            return Response.json([]);
        },
        assets: { fetch: async request => {
            const pathname = new URL(request.url).pathname;
            const file = new URL('.' + pathname, assetsRoot);
            if (!file.href.startsWith(assetsRoot.href)) return new Response(null, { status: 404 });
            try {
                return new Response(await readFile(file), { headers: { 'Content-Type': assetTypes[extname(pathname)] ?? 'application/octet-stream' } });
            } catch { return new Response(null, { status: 404 }); }
        } },
    });
    const sync = new SyncStore(runner, owner, await createSecretCipher(secret));
    await sync.createDatasource({ name: 'Synthetic source', kind: 'supabase', config: { url: 'https://source.example.test', serviceKey: 'fixture-only' } }, 'source', now());
    await sync.createDatasource({ name: 'Synthetic translations', kind: 'supabase', config: { url: 'https://translations.example.test', serviceKey: 'fixture-only' } }, 'translations', now());
    await runner.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)', [
        owner, 'translation_storage:v1', JSON.stringify({ revision: 1, projectId: crypto.randomUUID(), configuration: { version: 1, datasourceId: 'translations', endpoint: 'postgrest', namespace: 'translations' } }), now(),
    ]);
    const binding = '{{ record.description }}';
    const tile = (id, name, text) => ({
        id, type: 'Container', props: { _layerName: name }, styles: { border: '1px solid #aaa', minHeight: '80px' },
        children: [{ id: id + '-text', type: 'Text', props: { text } }],
    });
    const layout = { root: {}, content: [{ id: 'tiles', type: 'Container', props: {}, children: [
        tile('about', 'About', 'About the university'), tile('address', 'Address', 'Campus address'),
        tile('details', 'Details', binding),
    ] }] };
    layout.content[0].children[0].children.push({ id: 'about-heading', type: 'Heading', props: { text: 'Campus overview' } });
    const page = await new PagesStore(runner, owner).create({ name: 'Fixture layout', slug: 'shared-layout', layout_data: layout }, crypto.randomUUID(), now());
    const configuration = emptyDirectoryConfiguration();
    configuration.site = { name: 'Test', origin: 'https://example.test', locale: 'en' };
    configuration.datasourceId = 'source';
    for (const [role, table] of [['city', 'cities'], ['institution', 'institutions'], ['program', 'programs']]) {
        const collection = configuration.collections[role];
        collection.table = table;
        collection.scope = { field: 'country', value: 22 };
        Object.assign(collection.fields, { id: 'id', title: 'title', ...(role === 'city' ? {} : { originalPath: 'path' }) });
    }
    configuration.collections.institution.fields.cityId = 'city_id';
    configuration.collections.program.fields.institutionId = 'institution_id';
    const publication = new LiveLayoutPublicationStore(runner, owner);
    const hash = await publication.prepare({
        schemaVersion: 3, runtimeVersion: 'live-layout-v1', configuration, templates: [], locales: ['en', 'ar'],
        staticPages: [{ pageId: page.id, title: page.name, description: '', originalPath: '/shared-layout/', layout }],
    }, now());
    assert.ok(await publication.publish(hash, null, now()));
    const origin = await new Promise(resolve => {
        server = serve({ fetch: engine.fetch, port: 0, hostname: '127.0.0.1' }, address => resolve('http://127.0.0.1:' + address.port));
    });
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const builder = await context.newPage();
    await builder.goto(origin + '/frontbase-admin');
    await builder.getByRole('textbox', { name: /email/i }).fill(admin.email);
    await builder.locator('input[type="password"]').fill(admin.password);
    await builder.getByRole('button', { name: /sign in/i }).click();
    await expect(builder.getByRole('link', { name: /^Pages$/i })).toBeVisible();

    const front = await context.newPage();
    const path = locale => (locale === 'ar' ? '/ar' : '') + '/shared-layout/';
    const layoutButton = locale => front.getByRole('button', { exact: true, name: locale === 'ar' ? 'التخطيط' : 'Layout' });
    const pencil = front.locator('[data-frontbase-editor] [data-pencil]');
    async function openFrontend(locale, width) {
        await front.setViewportSize({ width, height: 860 });
        await front.goto(origin + path(locale));
        await expect(front.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await front.locator('[data-frontbase-editor]').waitFor();
        if (await pencil.count()) {
            await expect(pencil).toBeEnabled();
            if (await pencil.getAttribute('aria-expanded') !== 'true') await pencil.click();
        }
        await expect(layoutButton(locale)).toBeVisible();
        await layoutButton(locale).click();
        await expect(front.getByRole('combobox', { name: locale === 'ar' ? 'العنصر' : 'Tile' })).toBeVisible();
    }
    await openFrontend('en', 1366);
    await front.getByRole('combobox', { name: 'Tile' }).selectOption('address');
    const handle = await front.getByRole('button', { name: 'Drag selected tile on page' }).boundingBox();
    const about = await front.locator('#about').boundingBox();
    await front.mouse.move(handle.x + 16, handle.y + 16);
    await front.mouse.down();
    await expect(front.locator('[data-fb-layout-drop-zone]').first()).toBeVisible();
    const ghost=front.locator('[data-fb-layout-drag-preview]');
    await expect(ghost).toContainText('Campus address');
    const initialGhost=await ghost.boundingBox();
    await front.mouse.move(about.x + 20, about.y + 10, { steps: 6 });
    await expect(front.locator('[data-fb-layout-drop-zone="before"][data-active]')).toBeVisible();
    assert.notDeepEqual(await ghost.boundingBox(),initialGhost,'drag preview follows the pointer');
    await front.mouse.up();
    await expect(front.locator('[data-fb-layout-drop-zone]')).toHaveCount(0);
    await expect(ghost).toHaveCount(0);
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await front.getByRole('button', { name: 'Narrower' }).click();
    await front.getByRole('combobox', { name: 'Box alignment' }).selectOption('right');
    let releaseEditor;
    const delayedEditor = new Promise(resolve => { releaseEditor = resolve; });
    await front.route('**/frontend-rich-text.js', async route => { await delayedEditor; await route.continue(); });
    await front.getByRole('combobox', { name: 'Tile' }).selectOption('about-text');
    const search=front.getByRole('searchbox',{name:'Search variables'});
    try {
        await front.getByRole('button',{name:'@ Insert variable',exact:true}).click();
        await expect(search).toBeFocused();
    } finally { releaseEditor(); }
    await expect(front.getByRole('textbox', { name: 'Select words to format' })).toBeVisible();
    await expect(search).toBeFocused();
    await front.getByRole('combobox', { name: 'Text alignment' }).selectOption('center');
    const words=front.getByRole('textbox', { name: 'Select words to format' });
    await words.press('Control+Home');
    await words.press('Control+Shift+ArrowRight');
    await front.getByRole('button', { name: 'Bold', exact: true }).click();
    await front.getByRole('button', { name: 'Italic', exact: true }).click();
    await expect(front.getByLabel('Selected text')).toHaveCSS('font-style','italic');
    await expect(front.getByLabel('Selected text')).toHaveCSS('font-weight','700');
    await words.press('@');
    await expect(search).toBeVisible();
    await search.fill('page.title');
    await front.getByRole('combobox',{name:'Liquid variable'}).selectOption('page.title');
    await front.getByRole('button',{name:'Insert',exact:true}).click();
    await expect(front.getByText('{{ page.title }}',{exact:true})).toBeVisible();
    if (await pencil.count()) {
        await pencil.click();
        await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
        await expect(front.locator('#address')).toHaveCSS('max-width', 'none');
        await pencil.click();
        await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
        await expect(front.locator('#address')).toHaveCSS('max-width', '90%');
    }
    await front.getByRole('button', { name: 'Save layout draft' }).click();
    await expect(front.getByText('Layout draft saved')).toBeVisible();

    await builder.goto(origin + '/frontbase-admin/builder/'+page.id+'?element=about-text');
    const canvas = builder.frameLocator('iframe[title="Frontbase Builder Canvas"]');
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await expect(canvas.locator('#address')).toHaveCSS('max-width', '90%');
    await expect(canvas.locator('#address')).toHaveCSS('margin-right', '0px');
    await expect(canvas.locator('#about-text')).toHaveCSS('text-align', 'center');
    await expect(canvas.locator('#about-text strong em')).toHaveText('About');
    await builder.goto(origin + '/frontbase-admin/builder/'+page.id+'?element=about');
    await builder.getByRole('button', { name: 'Mobile viewport' }).click();
    await builder.getByRole('button', { name: 'Move tile earlier' }).click();
    await builder.getByRole('button', { name: 'Narrow tile' }).click();
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
    await expect(canvas.locator('#about')).toHaveCSS('max-width', '90%');
    const saved = builder.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/api/pages/' + page.id + '/'));
    await builder.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal((await saved).status(), 200);

    for (const locale of ['en', 'ar']) for (const width of [1366, 390]) {
        await openFrontend(locale, width);
        await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
        await expect(front.locator('#address')).toHaveCSS('max-width', '90%');
        await expect(front.locator('#about')).toHaveCSS('max-width', width === 390 ? '90%' : 'none');
    }

    await front.getByRole('combobox', { name: 'العنصر' }).selectOption('about');
    await front.getByRole('button', { name: 'تضييق', exact: true }).click();
    await front.getByRole('button', { name: 'حفظ مسودة التخطيط' }).click();
    await expect(front.getByText('تم حفظ المسودة')).toBeVisible();
    await builder.reload();
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
    await builder.getByRole('button', { name: 'Mobile viewport' }).click();
    await expect(canvas.locator('#about')).toHaveCSS('max-width', '80%');

    const final = JSON.parse((await new PagesStore(runner, owner).get(page.id)).layout_data);
    assert.equal(final.content[0].children.find(node => node.id === 'details').children[0].props.text, binding);
    assert.deepEqual(final.content[0].children.find(node=>node.id==='about').children[0].props.inlineEmphasis,
        [{phrase:'About',mark:'bold'},{phrase:'About',mark:'italic'}]);
    assert.equal(final.content[0].children.find(node=>node.id==='about').children[0].props.inlineAfter,'{{ page.title }}');
    const liveLayout={root:{},content:[{id:'live-copy',type:'Text',props:{text:binding,
        inlineEmphasis:[{phrase:'البرنامج',mark:'italic',prefix:'عن '}]}}]};
    const renderRecord=description=>renderPage(liveLayout,{record:{description},app:{},page:{},user:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});
    const original=await renderRecord('البرنامج الأول عن البرنامج <script>');
    assert.ok(original.includes('البرنامج الأول عن <em>البرنامج</em> &lt;script&gt;'));
    assert.ok((await renderRecord('عنوان جديد')).includes('عنوان جديد'));
    assert.ok(!(await renderRecord('عنوان جديد')).includes('<em>'));

    const beforeMatch=(await new PagesStore(runner,owner).get(page.id)).layout_data;
    await openFrontend('en', 1366);
    await front.getByRole('combobox',{name:'Tile'}).selectOption('details');
    await front.getByRole('combobox',{name:'Reference box'}).selectOption('address');
    await front.getByRole('button',{name:'Match width and alignment'}).click();
    const referenceGeometry=await front.locator('#address').boundingBox();
    const matchedGeometry=await front.locator('#details').boundingBox();
    assert.ok(Math.abs(referenceGeometry.width-matchedGeometry.width)<2);
    assert.ok(Math.abs(referenceGeometry.x-matchedGeometry.x)<2);
    await front.getByRole('button',{name:'Save layout draft'}).click();
    await expect(front.getByText('Layout draft saved')).toBeVisible();
    await front.getByRole('button',{name:'Restore previous draft'}).click();
    await expect(front.getByText('Original draft restored')).toBeVisible();
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    const referenceLayout = { content: [tile('reference', 'Reference', 'Reference'), tile('matched', 'Matched', 'Matched')], root: {} };
    Object.assign(referenceLayout.content[0].styles, { width: '65%', boxSizing: 'border-box', marginInlineStart: '12.5%', marginInlineEnd: 'auto' });
    const matchedLayout = applyLayoutDraftOperation(referenceLayout, { kind: 'match', id: 'matched', viewport: 'desktop', width: 65, offset: 12.5 });
    const matchHtml = await renderPage(matchedLayout, { app: {}, page: {}, user: {}, system: {}, url: {}, visitor: {} });
    const directionTest = await context.newPage();
    for (const direction of ['ltr', 'rtl']) {
        await directionTest.setContent(`<html dir="${direction}"><body>${matchHtml}</body></html>`);
        const reference = await directionTest.locator('#reference').boundingBox();
        const matched = await directionTest.locator('#matched').boundingBox();
        assert.ok(Math.abs(reference.width - matched.width) < 1, direction + ' matched width');
        assert.ok(Math.abs(reference.x - matched.x) < 1, direction + ' matched horizontal position');
    }
    await directionTest.close();
    await front.getByRole('combobox',{name:'Tile'}).selectOption('about-text');
    await words.press('Control+End');
    await words.press('!');
    await front.getByRole('button',{name:'Save layout draft'}).click();
    await expect(front.getByText('Layout draft saved')).toBeVisible();
    const edited=JSON.parse((await new PagesStore(runner,owner).get(page.id)).layout_data);
    assert.equal(edited.content[0].children.find(node=>node.id==='about').children[0].props.text,'About the university!');
    await front.getByRole('button',{name:'Restore previous draft'}).click();
    await expect(front.getByText('Original draft restored')).toBeVisible();
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    assert.equal((await publication.active()).pointer.hash, hash);
    await front.getByRole('combobox', { name: 'Tile' }).selectOption('about-text');
    await front.locator('#about-heading').scrollIntoViewIfNeeded();
    await expect(front.locator('[data-fb-layout-handle]')).toBeVisible();
    const textGrip = await front.locator('[data-fb-layout-handle]').boundingBox();
    const heading = await front.locator('#about-heading').boundingBox();
    await front.mouse.move(textGrip.x+16,textGrip.y+16);
    await front.mouse.down();
    await expect(ghost).toContainText('About the university');
    await front.keyboard.press('Escape');
    await expect(ghost).toHaveCount(0);
    await front.mouse.up();
    await expect(front.getByRole('button',{name:'Save layout draft'})).toBeDisabled();
    await front.mouse.down();
    await front.mouse.move(heading.x+20,heading.y+heading.height-2,{steps:6});
    await expect(front.locator('[data-fb-layout-drop-zone="after"][data-active]')).toBeVisible();
    await front.mouse.up();
    await expect(front.locator('#about > #about-heading + #about-text')).toBeVisible();
    await front.getByRole('button',{name:'Save layout draft'}).click();
    await expect(front.getByText('Layout draft saved')).toBeVisible();
    await builder.reload();
    await expect(canvas.locator('#about > #about-heading + #about-text')).toBeVisible();
    await front.getByRole('button',{name:'Restore previous draft'}).click();
    await expect(front.getByText('Original draft restored')).toBeVisible();
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 860 }, isMobile: true, hasTouch: true,
        storageState: await context.storageState() });
    for (const locale of ['en', 'ar']) {
        const phone = await touchContext.newPage();
        await phone.goto(origin + path(locale));
        const phonePencil = phone.locator('[data-pencil]');
        await expect(phonePencil).toBeEnabled();
        if (await phonePencil.getAttribute('aria-expanded') !== 'true') await phonePencil.tap();
        await phone.getByRole('button', { name: locale === 'ar' ? 'التخطيط' : 'Layout', exact: true }).tap();
        await phone.getByRole('combobox', { name: locale === 'ar' ? 'العنصر' : 'Tile', exact: true }).selectOption('address');
        const grab = await phone.locator('[data-fb-layout-handle]').boundingBox();
        const before = await phone.locator('#about').boundingBox();
        const cdp = await touchContext.newCDPSession(phone);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        await touch('touchStart', grab.x + 20, grab.y + 20);
        await expect(phone.locator('[data-fb-layout-drop-zone]').first()).toBeVisible();
        await expect(phone.locator('[data-fb-layout-drag-preview]')).toBeVisible();
        await touch('touchMove', before.x + before.width / 2, before.y + 10);
        await expect(phone.locator('[data-fb-layout-drop-zone="before"][data-active]')).toBeVisible();
        await touch('touchEnd');
        await expect(phone.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
        await expect(phone.locator('[data-fb-layout-drop-zone]')).toHaveCount(0);
        await phone.getByRole('combobox', { name: locale === 'ar' ? 'العنصر' : 'Tile', exact: true }).selectOption('about-text');
        await phone.getByRole('button', { name: locale === 'ar' ? '@ إدراج متغير' : '@ Insert variable', exact: true }).tap();
        const phoneSearch = phone.getByRole('searchbox', { name: locale === 'ar' ? 'بحث المتغيرات' : 'Search variables' });
        await phoneSearch.fill('page.title');
        await phone.getByRole('combobox', { name: locale === 'ar' ? 'متغير Liquid' : 'Liquid variable' }).selectOption('page.title');
        await phone.getByRole('combobox', { name: locale === 'ar' ? 'موضع المتغير' : 'Variable placement' }).selectOption('before');
        await expect(phone.getByText('{{ page.title }}', { exact: true })).toHaveCount(0);
        await phone.getByRole('button', { name: locale === 'ar' ? 'إدراج' : 'Insert', exact: true }).tap();
        await expect(phone.getByText('{{ page.title }}', { exact: true })).toBeVisible();
        await phone.getByRole('button', { name: locale === 'ar' ? 'تجاهل التعديلات' : 'Discard layout changes', exact: true }).click();
        await phone.close();
    }
    await touchContext.close();
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    console.log('Chromium: frontend and Builder round trips in English and Arabic, desktop and mobile widths, preserved bindings and unchanged publication PASS');
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await runner.close?.();
}
