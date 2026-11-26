import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { extname } from 'node:path';
import { serve } from '@hono/node-server';
import { chromium, firefox, webkit, expect as playwrightExpect } from '@playwright/test';
import { LiveLayoutPublicationStore, PagesStore, SyncStore, createSecretCipher } from '@frontbase/backend';
import { applyLayoutDraftOperation, renderPage } from '@frontbase/edge-core';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from '../dist/worker.mjs';

const runner = sqliteRunner(':memory:');
const expect = playwrightExpect.configure({ timeout: 15000 });
const secret = 'shared-layout-browser-fixture-only';
const admin = { email: 'owner@example.test', password: 'shared-layout-browser-fixture-password' };
const owner = '_root';
const now = () => new Date().toISOString();
const assetsRoot = new URL('../console-dist/', import.meta.url);
const assetTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let browser;
let server;
const engineName = process.env.FRONTBASE_LAYOUT_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[engineName];
assert.ok(browserType, 'Choose chromium, firefox or webkit');
// WebKit requires HTTPS for the Secure sign-in cookie on this fixture.
const tlsDirectory = process.env.FRONTBASE_LAYOUT_BROWSER_TLS_DIR;
const tls = tlsDirectory ? { key: await readFile(`${tlsDirectory}/key.pem`), cert: await readFile(`${tlsDirectory}/cert.pem`) } : undefined;
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
    ] }, { id:'browse', type:'Link', props:{ text:'Browse programs', href:'#tiles', _layerName:'Browse programs' } }] };
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
        server = serve({ fetch: engine.fetch, port: 0, hostname: '127.0.0.1',
            ...(tls ? { createServer: createHttpsServer, serverOptions: tls } : {}),
        }, address => resolve(`${tls ? 'https' : 'http'}://127.0.0.1:${address.port}`));
    });
    browser = await browserType.launch();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: !!tls });
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
    const elementActions = (tab = front) => tab.locator('[data-fb-element-actions]');
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
    for (const locale of ['en','ar']) {
        const ar = locale === 'ar';
        await front.setViewportSize({ width: ar ? 390 : 1366, height: 860 });
        await front.goto(origin + path(locale));
        await expect(pencil).toBeEnabled();
        if (await pencil.getAttribute('aria-expanded') !== 'true') await pencil.click();
        const staticLabel = front.locator('#browse [data-fb-static-copy]');
        await staticLabel.click();
        await expect(staticLabel).toBeEditable();
        await expect(staticLabel).toHaveCSS('outline-color', 'rgb(148, 163, 184)');
        await expect(front.locator('[data-frontbase-edit-chip]')).toBeHidden();
        await expect(front.locator('[data-fb-box-chip]')).toBeHidden();
        await staticLabel.evaluate(element => {
            const range = document.createRange();
            range.setStart(element.firstChild, 'Browse '.length);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });
        if(ar) await front.keyboard.insertText('@');
        else await staticLabel.press('@');
        const picker = front.locator('.variable-picker input[type=search]');
        await expect(picker).toBeVisible();
        await expect(front.getByRole('combobox', { name: ar ? 'العنصر' : 'Tile' })).toBeHidden();
        await picker.fill('page.title');
        await picker.press('Enter');
        await front.locator('[data-variable-path="page.title"]').click();
        const chip = front.locator('#browse [data-fb-binding-chip="page.title"]');
        await expect(chip).toBeVisible();
        assert.equal(await chip.evaluate(element => element.previousSibling?.textContent), 'Browse ');
        assert.equal(await chip.evaluate(element => element.nextSibling?.textContent), 'programs');
        await expect(front.locator('#browse')).toHaveAttribute('href', '#tiles');
        await front.getByRole('button',{name:ar?'تجاهل التعديلات':'Discard layout changes',exact:true}).click();
        await expect(front.locator('#browse')).toHaveText('Browse programs');
    }
    const draftRoute='**/api/frontend-edit/layout-draft/**';
    const addInstitutionFields=async route=>{
        const response=await route.fetch(), draft=await response.json();
        draft.tiles.find(tile=>tile.id==='browse').recordFields=['columns.campus_motto'];
        draft.compositionValues['record.columns.campus_motto']='Knowledge and service';
        await route.fulfill({response,json:draft});
    };
    await front.route(draftRoute,addInstitutionFields);
    await front.goto(origin+path('en'));
    await expect(pencil).toBeEnabled();
    if(await pencil.getAttribute('aria-expanded')!=='true')await pencil.click();
    const institutionLabel=front.locator('#browse [data-fb-static-copy]');
    await institutionLabel.click();
    await institutionLabel.press('@');
    await front.getByText('Record',{exact:true}).click();
    const scopedChoice=front.locator('[data-variable-path="record.columns.campus_motto"]');
    await expect(scopedChoice).toBeVisible();
    await expect(front.locator('.variable-picker [data-variable-path^="record."]')).toHaveCount(1);
    await scopedChoice.click();
    await expect(front.locator('#browse [data-fb-binding-chip="record.columns.campus_motto"]')).toHaveText('Knowledge and service');
    await front.getByRole('button',{name:'Discard layout changes',exact:true}).click();
    await front.unroute(draftRoute,addInstitutionFields);
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
    await front.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
    await expect(front.getByRole('button', { name: 'Save layout draft' })).toBeDisabled();
    await front.getByRole('button', { name: 'Drag selected tile on page' }).press('ArrowUp');
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await elementActions().click();
    await front.getByRole('button', { name: 'Narrower' }).click();
    await front.getByRole('combobox', { name: 'Box alignment' }).selectOption('right');
    let releaseEditor;
    const delayedEditor = new Promise(resolve => { releaseEditor = resolve; });
    await front.route('**/frontend-rich-text.js', async route => { await delayedEditor; await route.continue(); });
    await front.getByRole('combobox', { name: 'Tile' }).selectOption('about-text');
    await elementActions().click();
    const search=front.getByRole('searchbox',{name:'Find a variable'});
    try {
        await front.getByRole('button',{name:'@ Insert variable',exact:true}).click();
        await expect(front.getByRole('combobox',{name:'Variable placement'})).toBeVisible();
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
    await search.press('Enter');
    await front.locator('[data-variable-path="page.title"]').click();
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

    await builder.getByText('Layers', { exact:true }).click();
    await builder.getByRole('button', { name:'Actions for About' }).press('Enter');
    await builder.getByRole('menuitem', { name:'Move to…' }).press('Enter');
    await builder.getByLabel('Destination').selectOption('address');
    await builder.getByLabel('Placement').selectOption('after');
    await builder.getByRole('button', { name:'Move', exact:true }).press('Enter');
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await builder.getByRole('button', { name:'Undo', exact:true }).click();
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
    const layers = builder.getByRole('button', { name:'Reorder About', exact:true });
    const layerAddress = builder.getByRole('button', { name:'Reorder Address', exact:true });
    await layers.scrollIntoViewIfNeeded();
    const sourceGrip = await layers.boundingBox();
    const targetGrip = await layerAddress.boundingBox();
    await builder.mouse.move(sourceGrip.x + 10, sourceGrip.y + 10);
    await builder.mouse.down();
    await builder.mouse.move(targetGrip.x + 10, targetGrip.y + targetGrip.height, { steps:8 });
    await expect(builder.getByText('Insert after', { exact:true })).toBeVisible();
    await builder.mouse.up();
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await builder.getByRole('button', { name:'Undo', exact:true }).click();
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'about');

    for (const locale of ['en', 'ar']) for (const width of [1366, 390]) {
        await openFrontend(locale, width);
        await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
        await expect(front.locator('#address')).toHaveCSS('max-width', '90%');
        await expect(front.locator('#about')).toHaveCSS('max-width', width === 390 ? '90%' : 'none');
    }

    await front.getByRole('combobox', { name: 'العنصر' }).selectOption('about');
    await front.getByRole('button', { name: 'سحب العنصر من الصفحة' }).press('ArrowDown');
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await front.getByRole('button', { name: 'تراجع عن النقل', exact: true }).click();
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
    await elementActions().click();
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
    await elementActions().click();
    await front.getByRole('combobox',{name:'Reference box'}).selectOption('address');
    await front.getByRole('button',{name:'Match width and alignment'}).click();
    const referenceGeometry=await front.locator('#address').boundingBox();
    const matchedGeometry=await front.locator('#details').boundingBox();
    assert.ok(Math.abs(referenceGeometry.width-matchedGeometry.width)<2,
        `Expected width ${referenceGeometry.width}, got ${matchedGeometry.width}`);
    assert.ok(Math.abs(referenceGeometry.x-matchedGeometry.x)<2,
        `Expected x ${referenceGeometry.x}, got ${matchedGeometry.x}`);
    await front.getByRole('button',{name:'Save layout draft'}).click();
    await expect(front.getByText('Layout draft saved')).toBeVisible();
    await front.getByRole('button',{name:'Restore previous draft'}).click();
    await expect(front.getByText('Original draft restored')).toBeVisible();
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    await openFrontend('en', 1366);
    await front.getByRole('combobox', { name:'Tile' }).selectOption('browse');
    await elementActions().click();
    await front.getByRole('button', { name:'Edit text and bindings', exact:true }).click();
    const composer=front.locator('#browse [data-fb-inline-composer]');
    await expect(composer).toBeEditable();
    await composer.press('Control+a');
    await composer.press('Backspace');
    assert.ok((await composer.boundingBox()).width >= 20,'empty composer remains a visible text target');
    await composer.click();
    await front.keyboard.insertText('Browse ');
    await composer.press('@');
    await front.locator('.variable-picker input[type=search]').fill('page.title');
    await front.locator('.variable-picker input[type=search]').press('Enter');
    await front.locator('[data-variable-path="page.title"]').click();
    await expect(composer.locator('[data-fb-binding-chip]')).toHaveAttribute('data-fb-binding-chip','page.title');
    await front.keyboard.insertText(' programs');
    await front.getByRole('button',{name:'Save layout draft',exact:true}).click();
    await expect(front.getByText('Layout draft saved',{exact:true})).toBeVisible();
    const composed=JSON.parse((await new PagesStore(runner,owner).get(page.id)).layout_data);
    assert.deepEqual(composed.content.find(node=>node.id==='browse').props.inlineTemplate,[{text:'Browse '},{variable:'page.title'},{text:' programs'}]);
    assert.equal(composed.content.find(node=>node.id==='browse').props.href,'#tiles');
    await builder.goto(origin+'/frontbase-admin/builder/'+page.id+'?element=browse');
    await expect(canvas.locator('#browse')).toHaveText('Browse Fixture layout programs');
    await builder.getByRole('button',{name:'Edit binding',exact:true}).click();
    await expect(builder.locator('[data-fb-binding-chip]')).toHaveAttribute('data-fb-binding-chip','page.title');
    await builder.locator('[data-fb-binding-chip]').click();
    await builder.getByRole('button',{name:'Binding actions',exact:true}).click();
    await builder.getByRole('button',{name:'Remove binding',exact:true}).click();
    await builder.getByRole('button',{name:'Apply to layout draft',exact:true}).click();
    await expect(canvas.locator('#browse [data-fb-label-value]')).toHaveCount(0);
    await builder.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(canvas.locator('#browse [data-fb-label-value]')).toHaveText('Fixture layout');
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
    await elementActions().click();
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
    if (engineName === 'chromium') {
        const touchContext = await browser.newContext({ viewport: { width: 390, height: 860 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: !!tls,
            storageState: await context.storageState() });
        const touchBuilder = await touchContext.newPage();
        await touchBuilder.setViewportSize({ width: 1366, height: 900 });
        await touchBuilder.goto(origin + '/frontbase-admin/builder/'+page.id+'?element=about');
        const touchCanvas = touchBuilder.frameLocator('iframe[title="Frontbase Builder Canvas"]');
        await expect(touchCanvas.locator('#tiles > div').first()).toHaveAttribute('id', 'about');
        await touchBuilder.getByText('Layers', { exact:true }).tap();
        await touchBuilder.getByRole('button', { name:'Actions for About' }).tap();
        await touchBuilder.getByRole('menuitem', { name:'Move to…' }).tap();
        await touchBuilder.getByLabel('Destination').selectOption('address');
        await touchBuilder.getByLabel('Placement').selectOption('after');
        await touchBuilder.getByRole('button', { name:'Move', exact:true }).tap();
        await expect(touchCanvas.locator('#tiles > div').first()).toHaveAttribute('id','address');
        await touchBuilder.getByRole('button', { name:'Undo', exact:true }).tap();
        await expect(touchCanvas.locator('#tiles > div').first()).toHaveAttribute('id','about');
        const aboutGrip = await touchBuilder.getByRole('button', { name:'Reorder About', exact:true }).boundingBox();
        const addressGrip = await touchBuilder.getByRole('button', { name:'Reorder Address', exact:true }).boundingBox();
        const builderCdp = await touchContext.newCDPSession(touchBuilder);
        await builderCdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:aboutGrip.x+12, y:aboutGrip.y+12 }] });
        // The first move crosses the activation distance and the second enters the drop target.
        await builderCdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:aboutGrip.x+12, y:aboutGrip.y+22 }] });
        await builderCdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:addressGrip.x+12, y:addressGrip.y+addressGrip.height-3 }] });
        await expect(touchBuilder.getByText('Insert after', { exact:true })).toBeVisible();
        await builderCdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
        await expect(touchCanvas.locator('#tiles > div').first()).toHaveAttribute('id','address');
        // Chromium's simulated touch stream can suppress the click after dragging.
        // Exercise the same Undo action by keyboard here, and by tap after Move to above.
        await touchBuilder.getByRole('button', { name:'Undo', exact:true }).press('Enter');
        await expect(touchCanvas.locator('#tiles > div').first()).toHaveAttribute('id','about');
        await touchBuilder.close();
        for (const locale of ['en', 'ar']) {
            const phone = await touchContext.newPage();
            await phone.goto(origin + path(locale));
            const phonePencil = phone.locator('[data-pencil]');
            await expect(phonePencil).toBeEnabled();
            if (await phonePencil.getAttribute('aria-expanded') !== 'true') await phonePencil.tap();
            await phone.getByRole('button', { name: locale === 'ar' ? 'التخطيط' : 'Layout', exact: true }).tap();
            const tileChooser=phone.getByRole('combobox', { name: locale === 'ar' ? 'العنصر' : 'Tile', exact: true });
            await tileChooser.selectOption('browse');
            await elementActions(phone).tap();
            await phone.getByRole('button',{name:locale==='ar'?'تحرير النص والارتباطات':'Edit text and bindings',exact:true}).tap();
            const mobileComposer=phone.locator('#browse [data-fb-inline-composer]');
            await expect(mobileComposer).toBeVisible();
            await phone.getByRole('button',{name:locale==='ar'?'@ إدراج متغير':'@ Insert variable',exact:true}).tap();
            await phone.locator('.variable-picker input[type=search]').fill('page.title');
            await phone.locator('.variable-picker input[type=search]').press('Enter');
            await phone.locator('[data-variable-path="page.title"]').tap();
            await expect(mobileComposer.locator('[data-fb-binding-chip]')).toHaveAttribute('data-fb-binding-chip','page.title');
            const cdp = await touchContext.newCDPSession(phone);
            const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
            const mobileChips = mobileComposer.locator('[data-fb-binding-chip]');
            await phone.keyboard.insertText(locale==='ar'?' ثم ':' then ');
            await phone.getByRole('button',{name:locale==='ar'?'@ إدراج متغير':'@ Insert variable',exact:true}).tap();
            await phone.locator('.variable-picker input[type=search]').fill('page.title');
            await phone.locator('.variable-picker input[type=search]').press('Enter');
            await phone.locator('[data-variable-path="page.title"]').tap();
            await expect(mobileChips).toHaveCount(2);
            const mobileOriginal = await mobileComposer.innerText();
            await mobileChips.last().tap();
            const inlineGrip = await phone.locator('[data-fb-binding-grip]').boundingBox();
            const firstChip = await mobileChips.first().boundingBox();
            await touch('touchStart',inlineGrip.x+inlineGrip.width/2,inlineGrip.y+inlineGrip.height/2);
            await touch('touchMove',locale==='ar'?firstChip.x+firstChip.width-2:firstChip.x+2,firstChip.y+firstChip.height/2);
            await expect(phone.locator('[data-fb-binding-drop-caret]')).toBeVisible();
            await touch('touchEnd');
            assert.notEqual(await mobileComposer.innerText(),mobileOriginal);
            const mobileUndo=phone.getByRole('button',{name:locale==='ar'?'تراجع عن تغيير النص':'Undo text change',exact:true});
            await mobileUndo.tap();
            await expect(mobileComposer).toHaveText(mobileOriginal);
            await mobileUndo.tap();
            await expect(mobileChips).toHaveCount(1);
            await phone.getByRole('button',{name:locale==='ar'?'إنهاء تحرير النص':'Done editing label',exact:true}).tap();
            await tileChooser.selectOption('address');
            const grab = await phone.locator('[data-fb-layout-handle]').boundingBox();
            const before = await phone.locator('#about').boundingBox();
            await touch('touchStart', grab.x + 20, grab.y + 20);
            await expect(phone.locator('[data-fb-layout-drop-zone]').first()).toBeVisible();
            await expect(phone.locator('[data-fb-layout-drag-preview]')).toBeVisible();
            await touch('touchMove', before.x + before.width / 2, before.y + 10);
            await expect(phone.locator('[data-fb-layout-drop-zone="before"][data-active]')).toBeVisible();
            await touch('touchEnd');
            await expect(phone.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
            await expect(phone.locator('[data-fb-layout-drop-zone]')).toHaveCount(0);
            await phone.getByRole('combobox', { name: locale === 'ar' ? 'العنصر' : 'Tile', exact: true }).selectOption('about-text');
            await elementActions(phone).tap();
            await expect(phone.locator('[data-fb-element-menu]')).toBeVisible();
            await phone.getByRole('button', { name: locale === 'ar' ? '@ إدراج متغير' : '@ Insert variable', exact: true }).tap();
            const phoneSearch = phone.getByRole('searchbox', { name: locale === 'ar' ? 'البحث عن متغير' : 'Find a variable' });
            await expect(phoneSearch).toBeVisible();
            await phone.getByRole('combobox', { name: locale === 'ar' ? 'موضع المتغير' : 'Variable placement' }).selectOption('before');
            await expect(phoneSearch).toBeVisible();
            await phoneSearch.fill('page.title');
            await phoneSearch.press('Enter');
            await expect(phone.getByText('{{ page.title }}', { exact: true })).toHaveCount(0);
            await phone.locator('[data-variable-path="page.title"]').tap();
            await expect(phone.getByText('{{ page.title }}', { exact: true })).toBeVisible();
            await phone.getByRole('button', { name: locale === 'ar' ? 'تجاهل التعديلات' : 'Discard layout changes', exact: true }).click();
            await phone.close();
        }
        await touchContext.close();
    }
    assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
    // Expose one fixture heading as record content to exercise the two editor modes
    // through the real browser controllers without giving the fixture a writable record.
    await front.route('**/api/frontend-edit/inventory/**',async route=>{
        const response=await route.fetch(), inventory=await response.json();
        Object.assign(inventory.fields.find(field=>field.blockId==='about-heading'),{
            recordKey:'heading-fixture',recordScope:'institutions',fieldKey:'title',destination:inventory.locale==='ar'?'record-translation':'record',
        });
        await route.fulfill({response,json:inventory});
    });
    await front.route('**/api/frontend-edit/layout-draft/**',async route=>{
        const response=await route.fetch(), draft=await response.json();
        draft.tiles.find(tile=>tile.id==='about-heading').composition=[{variable:'record.title'}];
        await route.fulfill({response,json:draft});
    });
    for(const [locale,before] of [['en',true],['en',false],['ar',true],['ar',false]]){
        await front.goto(origin+path(locale));
        await expect(pencil).toBeEnabled();
        if(await pencil.getAttribute('aria-expanded')!=='true')await pencil.click();
        const record=front.locator('#about-heading [data-fb-copy]');
        await record.click();
        const fieldChip=front.locator('[data-frontbase-edit-chip]');
        const grip=fieldChip.locator('[data-fb-binding-entry]');
        const boxGrip=front.locator('[data-fb-box-chip] [data-fb-layout-handle]');
        const fieldMenuButton=fieldChip.locator('[data-frontbase-edit-context]');
        await expect(grip).toBeVisible();
        await expect(boxGrip).toBeVisible();
        await expect(fieldMenuButton).toContainText(locale==='ar'?'العربية':'English');
        const [gripBounds,labelBounds]=await Promise.all([grip.boundingBox(),fieldMenuButton.boundingBox()]);
        assert.ok(locale==='ar'?gripBounds.x>labelBounds.x:gripBounds.x<labelBounds.x,'grip is at the start of the field chip');
        const placeAtEdge=(element,start)=>{
            const range=document.createRange();range.selectNodeContents(element);range.collapse(start);
            const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);
        };
        const directionKey=before===(locale==='en')?'ArrowLeft':'ArrowRight';
        await record.fill('Unsaved record');
        await record.evaluate(placeAtEdge,before);
        await record.press(directionKey);
        await expect(record).toHaveText('Unsaved record');
        await expect(front.locator('[data-fb-inline-composer]')).toHaveCount(0);
        await grip.click();
        await expect(record).toHaveText('Unsaved record');
        await expect(record).toBeEditable();
        await record.press('Escape');
        await record.click();
        await record.evaluate(placeAtEdge,before);
        await record.press(directionKey);
        const layoutText=front.locator('#about-heading [data-fb-inline-composer]');
        await expect(layoutText).toBeFocused();
        await front.keyboard.insertText('x');
        await expect(layoutText.locator('[data-fb-binding-chip]')).toHaveText('Campus overview');
        await expect(layoutText).toHaveText(before?'xCampus overview':'Campus overviewx');
        await front.getByRole('button',{name:locale==='ar'?'تجاهل التعديلات':'Discard layout changes',exact:true}).click();
    }
    await front.goto(origin+path('en'));
    await expect(pencil).toBeEnabled();
    if(await pencil.getAttribute('aria-expanded')!=='true')await pencil.click();
    await front.locator('#about-heading [data-fb-copy]').click();
    const recordGrip=await front.locator('[data-fb-box-chip] [data-fb-layout-handle]').boundingBox();
    const previousSibling=await front.locator('#about-text').boundingBox();
    const hit=await front.evaluate(({x,y})=>{
        const element=document.elementFromPoint(x,y);
        return {grip:element?.hasAttribute('data-fb-layout-handle'),x,y,
            stack:document.elementsFromPoint(x,y).slice(0,5).map(node=>({tag:node.tagName,id:node.id,attributes:node.getAttributeNames()}))};
    },{x:recordGrip.x+recordGrip.width/2,y:recordGrip.y+recordGrip.height/2});
    assert.ok(hit.grip,JSON.stringify(hit));
    await front.mouse.move(recordGrip.x+recordGrip.width/2,recordGrip.y+recordGrip.height/2);
    await front.mouse.down();
    await front.mouse.move(previousSibling.x+20,previousSibling.y+2,{steps:6});
    await expect(front.locator('[data-fb-layout-drag-preview]')).toContainText('Campus overview');
    await expect(front.locator('[data-fb-layout-drop-zone="before"][data-active]')).toBeVisible();
    await front.mouse.up();
    await expect(front.locator('#about > #about-heading + #about-text')).toBeVisible();
    await elementActions().click();
    await expect(front.locator('[data-fb-element-menu]').getByRole('button',{name:'Edit text and bindings',exact:true})).toBeVisible();
    await front.getByRole('button',{name:'Discard layout changes',exact:true}).click();

    for (const [locale, width] of [['en', 1366], ['ar', 1366], ['en', 390], ['ar', 390]]) {
        const ar = locale === 'ar';
        await openFrontend(locale, width);
        await front.getByRole('combobox', {name:ar?'العنصر':'Tile'}).selectOption('browse');
        await elementActions().click();
        await front.getByRole('button',{name:ar?'تحرير النص والارتباطات':'Edit text and bindings',exact:true}).click();
        const label=front.locator('#browse [data-fb-inline-composer]');
        const chips=label.locator('[data-fb-binding-chip]');
        const section=front.locator('[data-fb-composer-context]');
        await expect(label).toBeEditable();
        await label.press('Control+a');
        await front.keyboard.insertText(ar?'تصفح ':'Browse ');
        for (const literal of [ar?' برامج ':' programs ', ar?' الآن':' now']) {
            await label.press('@');
            await front.locator('.variable-picker input[type=search]').fill('page.title');
            await front.locator('.variable-picker input[type=search]').press('Enter');
            await front.locator('[data-variable-path="page.title"]').click();
            await front.keyboard.insertText(literal);
        }
        await expect(chips).toHaveCount(2);
        await chips.last().click();
        await expect(section.locator('[data-fb-binding-grip]')).toBeVisible();
        await expect(front.locator('[data-fb-box-chip] [data-fb-layout-handle]')).toBeVisible();
        const original=await label.innerText();
        if(width>390){
            const grab=await section.locator('[data-fb-binding-grip]').boundingBox();
            const first=await chips.first().boundingBox();
            await front.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);
            await front.mouse.down();
            await front.mouse.move(ar?first.x+first.width-2:first.x+2,first.y+first.height/2,{steps:6});
            await expect(front.locator('[data-fb-binding-drop-caret]')).toBeVisible();
            await front.mouse.up();
        }else{
            await section.getByRole('button',{name:ar?'خيارات الارتباط':'Binding actions',exact:true}).click();
            await section.getByRole('button',{name:ar?'نقل الارتباط للخلف':'Move binding earlier',exact:true}).click();
        }
        await expect(chips).toHaveCount(2);
        assert.notEqual(await label.innerText(),original,'move changes the selected occurrence only');
        await label.press('Control+z');
        await expect(label).toHaveText(original);
        await expect(chips).toHaveCount(2);
        await chips.first().click();
        await section.getByRole('button',{name:ar?'خيارات الارتباط':'Binding actions',exact:true}).click();
        await expect(section.locator('[data-fb-binding-actions]')).toBeVisible();
        await elementActions().click();
        await expect(section.locator('[data-fb-binding-actions]')).toBeHidden();
        await expect(front.locator('[data-fb-element-menu]')).toBeVisible();
        await elementActions().press('Escape');
        const selectFirstWord=element=>{
            element.focus();
            const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
            let text=walker.nextNode();
            while(text&&!text.textContent.trim())text=walker.nextNode();
            const selection=document.getSelection(),range=document.createRange();
            range.setStart(text,0);range.setEnd(text,text.textContent.split(/\s/)[0].length);
            selection.removeAllRanges();selection.addRange(range);
        };
        await label.evaluate(selectFirstWord);
        const formatBar=section.locator('[data-fb-selection-toolbar]');
        await expect(formatBar).toBeVisible();
        await formatBar.getByRole('button',{name:ar?'عريض':'Bold',exact:true}).click();
        await expect(label.locator('strong')).toHaveText(ar?'تصفح':'Browse');
        await label.press('Control+z');
        await expect(label.locator('strong')).toHaveCount(0);
        await label.evaluate(selectFirstWord);
        await expect(formatBar).toBeVisible();
        await formatBar.getByRole('button',{name:ar?'مائل':'Italic',exact:true}).click();
        await expect(label.locator('em')).toHaveText(ar?'تصفح':'Browse');
        await front.getByRole('button',{name:ar?'حفظ مسودة التخطيط':'Save layout draft',exact:true}).click();
        await expect(front.getByText(ar?'تم حفظ المسودة':'Layout draft saved',{exact:true})).toBeVisible();
        await builder.goto(origin+'/frontbase-admin/builder/'+page.id+'?element=browse');
        await expect(canvas.locator('#browse [data-fb-label-value]')).toHaveCount(2);
        await expect(canvas.locator('#browse em')).toHaveText(ar?'تصفح':'Browse');
        await front.getByRole('button',{name:ar?'استعادة المسودة السابقة':'Restore previous draft',exact:true}).click();
        await expect(front.getByText(ar?'تمت استعادة المسودة':'Original draft restored',{exact:true})).toBeVisible();
        assert.equal((await new PagesStore(runner,owner).get(page.id)).layout_data,beforeMatch);
        assert.equal((await publication.active()).pointer.hash,hash);
    }
    console.log(engineName + ': frontend and Builder round trips in English and Arabic, desktop and mobile widths, preserved bindings and unchanged publication PASS');
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await runner.close?.();
}
