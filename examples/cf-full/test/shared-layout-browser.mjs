import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { serve } from '@hono/node-server';
import { chromium, expect } from '@playwright/test';
import { LiveLayoutPublicationStore, PagesStore, SyncStore, createSecretCipher } from '@frontbase/backend';
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
    await front.getByRole('button', { name: 'Drag to move tile' }).dragTo(front.locator('#about'), { targetPosition: { x: 10, y: 10 } });
    await expect(front.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await front.getByRole('button', { name: 'Narrower' }).click();
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

    await builder.goto(origin + '/frontbase-admin/builder/' + page.id);
    const canvas = builder.frameLocator('iframe[title="Frontbase Builder Canvas"]');
    await expect(canvas.locator('#tiles > div').first()).toHaveAttribute('id', 'address');
    await expect(canvas.locator('#address')).toHaveCSS('max-width', '90%');
    await builder.getByRole('button', { name: 'Mobile viewport' }).click();
    await canvas.locator('#about').click({ position: { x: 12, y: 57 } });
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
    assert.equal((await publication.active()).pointer.hash, hash);
    console.log('Chromium: frontend and Builder round trips in English and Arabic, desktop and mobile widths, preserved bindings and unchanged publication PASS');
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await runner.close?.();
}
