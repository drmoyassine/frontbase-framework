/** Synthetic isolated state; actual Chromium and emitted CMS SW. No pilot DB/browser. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { chromium } from '@playwright/test';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import { createCmsEngine } from '../../src/worker.js';
const { SitePublicationStore } = await import(new URL('../../../packages/backend/dist/compat/site-publication-store.js', import.meta.url).href);
const { SitePublicationReviewStore } = await import(new URL('../../../packages/backend/dist/compat/site-publication-review-store.js', import.meta.url).href);
const dir = mkdtempSync(join(tmpdir(), 'frontbase-sw-transition-'));
const runner = sqliteRunner('file:' + join(dir, 'state.db').replaceAll('\\', '/'));
const host = await createCmsEngine({ runner, sessionSecret: 'synthetic-browser-transition-only' });
const config = emptyDirectoryConfiguration();
config.site = { name: 'Synthetic reviewed site', destination: 'USA', origin: 'https://captured.example.com', locale: 'en' };
config.datasourceId = 'PRIVATE_FIXTURE';
for (const role of ['institution', 'program', 'city'] as const) {
    config.collections[role].table = role;
    config.collections[role].scope = { field: 'country', value: 22 };
    config.collections[role].fields.id = 'id';
    config.collections[role].fields.title = 'title';
    if (role !== 'city') config.collections[role].fields.originalPath = 'wp_url';
}
config.collections.institution.fields.cityId = 'city_id';
config.collections.program.fields.institutionId = 'institution_id';
const artifact = sitePublicationArtifactSchema.parse({ schemaVersion: 1, runtimeVersion: 'directory-snapshot-v1', configurationRevision: 1, configuration: config,
    templates: ['directory', 'institution'].map((role, index) => ({ pageId: '00000000-0000-4000-8000-00000000000' + index, role, title: 'Reviewed page', description: 'Synthetic page', layout: { root: { siteConfiguration: { version: 1, role } }, content: [{ id: 'detail', type: role === 'directory' ? 'Repeater' : 'Container', props: { directoryQuery: { version: 1, queryId: role === 'directory' ? 'directory.institution.list' : 'directory.institution.detail', params: role === 'directory' ? {} : { path: '/institution/' } } }, children: [{ id: 'title', type: 'Heading', props: { recordBindings: { text: 'title' } } }] }] } })),
    records: { institutions: [{ id: 1, title: 'REVIEWED_NETWORK_V1', originalPath: '/institution/', cityId: 1, summary: 'Reviewed', body: null, cover: null, coverAlt: '', logo: null }], programs: [], cities: [{ id: 1, title: 'Fixture city' }], articles: [] } });
const store = new SitePublicationStore(runner, '_root'), review = new SitePublicationReviewStore(runner, '_root');
const now = '2026-10-07T12:00:00Z', checks = { content: true, media: true, layout: true, urls: true, ctas: true };
const version1 = await store.prepare(artifact, now);
await review.approve({ hash: version1, checks, note: 'PRIVATE_NOTE' }, 'synthetic-reviewer', now);
let pointer = await review.activate(version1, null, now); assert.ok(pointer);
// OLD interception is deliberately observable: cached navigations never reach host.
const oldSw = `self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open('old-demo');await c.put('/institution/',new Response('<!doctype html><h1>STALE_BAKED_DEMO</h1>',{headers:{'content-type':'text/html'}}));await self.skipWaiting();})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.match('/institution/'));});`;
let old = true, swRequests = 0, networkNavigations = 0;
const bridge = new Hono();
bridge.get('/seed', c => c.html('<!doctype html><title>Seed old SW</title>Seed'));
bridge.get('/sw.js', async c => { swRequests++; if (old) return c.text(oldSw, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); if (process.env.PUBLICATION_BROWSER_MUTATION === 'retain-interception') return c.text(oldSw + '// new bytes, still stale', 200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }); return host.fetch(c.req.raw); });
bridge.all('*', async c => { if (c.req.path === '/institution/' || c.req.path === '/missing/') networkNavigations++; return host.fetch(c.req.raw); });
const server = serve({ fetch: bridge.fetch, hostname: '127.0.0.1', port: 0 });
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
let browser;
try {
    // Combined source proof: the real host dispatch reaches the reviewed sitemap,
    // with capture-bound URLs even though this fixture runs on loopback.
    const sitemap = await fetch(origin + '/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.equal(sitemap.headers.get('x-site-version'), version1);
    assert.equal(sitemap.headers.get('cache-control'), 'no-store');
    const sitemapXml = await sitemap.text();
    assert.ok(sitemapXml.includes('<loc>https://captured.example.com/institution/</loc>'));
    assert.ok(!sitemapXml.includes(origin));
    const sitemapHead = await fetch(origin + '/sitemap.xml', { method: 'HEAD' });
    assert.equal(sitemapHead.status, 200);
    assert.equal(await sitemapHead.text(), '');
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.goto(origin + '/seed');
    await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.goto(origin + '/institution/');
    assert.match(await page.content(), /STALE_BAKED_DEMO/);
    assert.equal(networkNavigations, 0, 'old navigation really bypassed public host');
    assert.equal(await page.evaluate(() => caches.has('old-demo')), true);
    old = false;
    // Same script URL/current emitted bytes: update + skipWaiting + claim replace
    // the controlling OLD worker while this already-controlled client stays open.
    await page.evaluate(async () => {
        const oldController = navigator.serviceWorker.controller;
        const changed = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('controller change timeout')), 15000);
            navigator.serviceWorker.addEventListener('controllerchange', () => { if (navigator.serviceWorker.controller !== oldController) { clearTimeout(timer); resolve(); } });
        });
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) throw new Error('old registration missing');
        await registration.update(); await changed;
    });
    assert.ok(swRequests >= 2, 'update fetched current host SW');
    // Stale cache intentionally remains. The current SW must ignore it.
    assert.equal(await page.evaluate(() => caches.has('old-demo')), true);
    let response = await page.goto(origin + '/institution/'); assert.equal(response?.status(), 200);
    let html = await page.content(); assert.match(html, /REVIEWED_NETWORK_V1/); assert.doesNotMatch(html, /STALE_BAKED_DEMO|PRIVATE_/);
    assert.equal(response?.headers()['x-site-version'], version1);
    assert.equal(response?.headers()['cache-control'], 'no-store');
    assert.ok(networkNavigations > 0);
    const changed = structuredClone(artifact); changed.records.institutions[0]!.title = 'REVIEWED_NETWORK_V2';
    const version2 = await store.prepare(changed, now); await review.approve({ hash: version2, checks, note: 'PRIVATE_UPDATE' }, 'synthetic-reviewer', now);
    pointer = await review.activate(version2, pointer, now); assert.ok(pointer);
    response = await page.reload(); assert.equal(response?.headers()['x-site-version'], version2);
    html = await page.content(); assert.match(html, /REVIEWED_NETWORK_V2/); assert.doesNotMatch(html, /REVIEWED_NETWORK_V1|STALE_BAKED_DEMO/);
    response = await page.goto(origin + '/missing/'); assert.equal(response?.status(), 404); assert.doesNotMatch(await page.content(), /STALE_BAKED_DEMO/);
    pointer = await review.activate(version1, pointer, now); assert.ok(pointer);
    response = await page.goto(origin + '/institution/'); assert.equal(response?.headers()['x-site-version'], version1); assert.equal(response?.headers()['x-site-generation'], '3');
    html = await page.content(); assert.match(html, /REVIEWED_NETWORK_V1/); assert.doesNotMatch(html, /REVIEWED_NETWORK_V2|STALE_BAKED_DEMO/);
    await runner.exec('DELETE FROM settings WHERE tenant_slug=? AND key=?', ['_root', `site_publication:review:v1:${version1}`]);
    response = await page.goto(origin + '/institution/'); assert.equal(response?.status(), 503); assert.match(await page.content(), /Site unavailable/); assert.doesNotMatch(await page.content(), /STALE_BAKED_DEMO|REVIEWED_NETWORK_V[12]/);
    await context.close();
    console.log('publication controlled-browser: old cached controlling SW -> actual emitted network-only SW, live claim, reviewed update, missing404 and unavailable503 PASS');
} finally {
    await browser?.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* native SQLite handle: OS temp cleanup */ }
}
