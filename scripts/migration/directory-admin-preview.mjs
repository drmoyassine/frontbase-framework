/** Loopback review harness; never a production server. No real datasource credentials. */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { sqliteRunner } from '../../packages/edge-infra/dist/index.js';
import { createCompatApp } from '../../packages/backend/dist/compat/app.js';
import { PagesStore } from '../../packages/backend/dist/compat/pages-store.js';
import { migrateUp } from '../../packages/backend/dist/db/migrations.js';
import { createEngine, directProvider } from '../../packages/edge-core/dist/index.js';

import { emptyDirectoryConfiguration } from '../../packages/edge-core/dist/directory/configuration.js';

const argv = process.argv.slice(2);
if (!argv.includes('--database')) throw new Error('Provide --database <protected local SQLite path>');
const database = resolve(argv[argv.indexOf('--database') + 1]);
const port = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 4388);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const runner = sqliteRunner(pathToFileURL(database).href);
await migrateUp(runner);
const now = () => new Date().toISOString();
const store = new PagesStore(runner, '_default');
await runner.exec('INSERT OR IGNORE INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', ['snapshot-demo', '_default', 'Directory schema fixture', 'supabase', '{}', now(), now()]);
if (!(await store.list()).length) {
    const config = emptyDirectoryConfiguration();
    config.site = { name: 'Studygram · USA', destination: 'USA', origin: 'https://study-in-usa.com', locale: 'en' };
    config.contacts = { email: 'counselor@studygram.me', whatsapp: 'https://wa.me/96550775711' };
    await store.create({ name: 'USA directory draft', slug: 'usa-directory-draft', layout_data: { root: { directoryConfiguration: config }, content: [] } }, crypto.randomUUID(), now());
}
const app = await createCompatApp({ makeRunner: async () => runner, resolvePrincipal: async () => ({ user: { id: 'local-review', role: 'owner' }, tenant: '_default' }), sessionSecret: 'local-directory-review-not-for-production', now });
const bundle = await build({ entryPoints: ['scripts/migration/directory-admin-client.tsx'], bundle: true, write: false, platform: 'browser', format: 'esm',
    tsconfig: 'packages/console/tsconfig.app.json', nodePaths: [resolve('packages/console/node_modules')], define: { 'import.meta.env': JSON.stringify({ MODE: 'community', DEV: false, PROD: true }) } });
const assets = await readdir('packages/console/dist/assets');
const stylesheet = assets.find(name => /^index-.*\.css$/.test(name));
if (!stylesheet) throw new Error('Build the console before starting this review');
const css = await readFile('packages/console/dist/assets/' + stylesheet);
const pilotCss = await readFile('scripts/migration/pilot.css', 'utf8');
const manifest = { version: 'directory-configuration-review', queries: {}, pages: {} };
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'builder', resolvePublishedPage: async path => {
    const id = path.startsWith('/preview/') ? path.slice('/preview/'.length) : '';
    const page = id ? await store.get(id) : null;
    if (!page) return null;
    return { title: page.name, slug: page.slug, description: 'Local configuration layout review; live collection records are not connected.', layout: JSON.parse(page.layout_data), cssBundle: pilotCss };
} });
const schema = ['id', 'title', 'path', 'summary', 'body', 'cover', 'logo', 'gallery', 'city_id', 'institution_id', 'country_id'].map(name => ({ column_name: name, data_type: name.endsWith('_id') || name === 'id' ? 'integer' : 'text', nullable: true }));
const server = createServer(async (req, res) => {
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = `http://${req.headers.host}`;
    const headers = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'" };
    const send = (status, body, type = 'text/html; charset=utf-8') => { res.writeHead(status, { ...headers, 'content-type': type }); res.end(req.method === 'HEAD' ? undefined : body); };
    try {
        if (!hosts.includes(req.headers.host)) return send(403, 'Unsupported host');
        if (!['GET', 'HEAD', 'POST', 'PUT'].includes(req.method)) return send(405, 'Unsupported method');
        if (['POST', 'PUT'].includes(req.method) && (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json'))) return send(403, 'Same-origin JSON writes only');
        const url = new URL(req.url, origin);
        if (url.pathname === '/' && ['GET', 'HEAD'].includes(req.method)) return send(200, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Frontbase directory admin review</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/client.js"></script></body></html>');
        if (url.pathname === '/client.js' && req.method === 'GET') return send(200, bundle.outputFiles[0].contents, 'text/javascript');
        if (url.pathname === '/style.css' && req.method === 'GET') return send(200, css, 'text/css');
        if (url.pathname === '/static/react/hydrate.js' && req.method === 'GET') return send(200, '// No live data hydration in this configuration review.', 'text/javascript');
        if (url.pathname === '/api/sync/datasources/snapshot-demo/tables' && req.method === 'GET') return send(200, JSON.stringify(['institutions', 'programs', 'cities', 'articles', 'pathways']), 'application/json');
        if (/^\/api\/sync\/datasources\/snapshot-demo\/tables\/(institutions|programs|cities|articles|pathways)\/schema$/.test(url.pathname) && req.method === 'GET') return send(200, JSON.stringify({ columns: schema }), 'application/json');
        if (url.pathname === '/api/sync/datasources/' && req.method === 'GET') return send(200, JSON.stringify([{ id: 'snapshot-demo', name: 'Directory schema fixture', type: 'supabase' }]), 'application/json');
        const api = /^\/api\/pages\/(?:[a-zA-Z0-9_-]+\/(?:layout\/|versions\/(?:[a-zA-Z0-9_-]+\/)?|rollback\/|publish\/local\/)?)?$/.test(url.pathname);
        if (api) {
            let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024 * 1024) return send(413, 'Request too large'); }
            const response = await app.fetch(new Request(url, { method: req.method, headers: { 'content-type': 'application/json' }, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) }));
            return send(response.status, await response.text(), response.headers.get('content-type') || 'application/json');
        }
        if (url.pathname.startsWith('/preview/') && ['GET', 'HEAD'].includes(req.method)) {
            const response = await engine.fetch(new Request(url)); return send(response.status, await response.text());
        }
        send(404, 'Not found');
    } catch (error) { console.error('Local directory admin review:', error.message); send(500, 'Local review error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Directory admin review: http://127.0.0.1:${port}/`));
