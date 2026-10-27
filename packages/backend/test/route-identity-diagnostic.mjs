// Observe production schemas/stores/resolver, not a replacement URL normalizer.
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { publicationPathSchema, sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import { migrateUp } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { ConsoleStore } from '../dist/db/store.js';
import { resolveSitePublicationPage } from '../dist/compat/site-publication-runtime.js';
import { registerTemplatePreflightRoutes } from '../dist/compat/routes/template-preflight.js';
import { resolvePublishedPageForTenant } from '../dist/tenancy/serving.js';
import { inspectNamespacePath } from '../dist/compat/route-namespace-audit.js';

const config = emptyDirectoryConfiguration();
config.site = { name: 'Synthetic', destination: 'USA', origin: 'https://example.invalid', locale: 'en' };
config.datasourceId = 'synthetic';
for (const role of ['institution', 'program', 'city']) {
    const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 };
    Object.assign(m.fields, { id: 'id', title: 'title' });
    if (role !== 'city') m.fields.originalPath = 'path';
}
config.collections.institution.fields.cityId = 'city_id';
config.collections.program.fields.institutionId = 'institution_id';
const node = (id, queryId) => ({ id, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/sample/' } : {} } }, children: [] });
const artifact = {
    schemaVersion: 1, runtimeVersion: 'directory-snapshot-v1', configurationRevision: 1, configuration: config,
    templates: ['directory', 'institution', 'program'].map((role, i) => ({
        pageId: `00000000-0000-4000-8000-00000000000${i}`, role, title: role, description: '',
        layout: { root: { siteConfiguration: { version: 1, role } }, content: role === 'directory'
            ? [node('i', 'directory.institution.list'), node('p', 'directory.program.list')]
            : [node('detail', `directory.${role}.detail`)] },
    })),
    records: { cities: [{ id: 1, title: 'City' }], articles: [],
        institutions: [{ id: 1, title: 'College', cityId: 1, originalPath: '/College/', summary: '', cover: null, coverAlt: '', logo: null }],
        programs: [{ id: 1, title: 'Program', institutionId: 1, originalPath: '/old-parent/program/', summary: '', cover: null, coverAlt: '', logo: null }],
    },
};
sitePublicationArtifactSchema.parse(artifact);
let groups = 0;
async function test(name, run) { await run(); groups++; console.log(`observed - ${name}`); }
const resolve = (path, input = artifact) => resolveSitePublicationPage(input, 'a'.repeat(64), 'alpha', new Request('https://example.invalid' + path));
await test('resolver preserves case, trailing slash and historical program parent', async () => {
    assert.ok(await resolve('/College/'));
    for (const path of ['/college/', '/College', '/College//', '/%43ollege/', '/College/extra']) assert.equal(await resolve(path), null, path);
    const page = await resolve('/old-parent/program/'); assert.ok(page);
    assert.equal(page.document.canonicalUrl, 'https://example.invalid/old-parent/program/');
    assert.equal(await resolve('/College/program/'), null);
});
await test('schema collision rejection is broader than runtime exact matching', async () => {
    for (const path of ['/College', '/%43ollege/']) {
        const a = structuredClone(artifact); a.records.programs[0].originalPath = path;
        const parsed = sitePublicationArtifactSchema.safeParse(a);
        assert.equal(parsed.success, false, path);
        assert.ok(parsed.error.issues.some(issue => issue.message === 'route_collision'));
    }
    const distinct = structuredClone(artifact); distinct.records.programs[0].originalPath = '/college/';
    assert.equal(sitePublicationArtifactSchema.safeParse(distinct).success, true);
    assert.equal((await resolve('/college/', distinct)).page.title, 'Program');
});
await test('reserved paths and decoded traversal refuse, without returning rewritten paths', async () => {
    for (const path of ['/api/private/', '/frontbase-admin/', '/frontbase-setup/x', '/builder/x', '/static/x', '/console/x', '/admin/x', '/setup/x', '/sw.js', '/sitemap.xml', '/%2e%2e/x', '/a%2fb/../x', '//host/x', '/a%3fb', '/a%00b', '/broken%']) {
        assert.equal(publicationPathSchema.safeParse(path).success, false, path);
    }
    for (const path of ['/', '/College/', '/%43ollege/', '/a%2fb/', '/a//b/']) assert.equal(publicationPathSchema.safeParse(path).success, true, path);
});
await test('WHATWG Request normalization happens before application matching', async () => {
    assert.equal(new URL(new Request('https://example.invalid/a/../College/').url).pathname, '/College/');
    assert.equal(new URL(new Request('https://example.invalid/%43ollege/').url).pathname, '/%43ollege/');
});
await test('compat/framework exact storage and separate owner/home identities', async () => {
    const db = sqliteRunner(':memory:'); await migrateUp(db);
    const pages = new PagesStore(db, 'alpha'), other = new PagesStore(db, 'beta'), framework = new ConsoleStore(db, 'alpha');
    const now = '2026-10-10T00:00:00Z';
    for (const [id, slug] of [['one', 'College'], ['two', 'college'], ['three', 'College/']]) await pages.create({ name: id, slug }, id, now);
    assert.equal((await pages.getBySlug('College')).id, 'one');
    assert.equal((await pages.getBySlug('college')).id, 'two');
    assert.equal((await pages.getBySlug('College/')).id, 'three');
    assert.equal(await pages.getBySlug('/College/'), null);
    await other.create({ name: 'other', slug: 'College' }, 'other', now);
    assert.equal((await other.getBySlug('College')).id, 'other');
    await framework.publishPage({ slug: 'College', title: 'Separate framework record', layoutData: '{"root":{},"content":[]}' }, now);
    assert.equal((await framework.getPage('College')).title, 'Separate framework record');
    assert.equal(await framework.getPage('college'), null);
    await pages.update('one', { isHomepage: true }, now);
    assert.equal((await pages.homepage()).slug, 'College');
    assert.equal(await pages.getBySlug('/'), null);
});
await test('actual preflight has stricter case handling but different reserved prefixes', async () => {
    let existing = [];
    const control = { query: async sql => sql.includes('FROM compat_pages') ? existing
        : sql.includes('FROM datasources') ? [{ id: 'synthetic', kind: 'sqlite', config: '{}' }] : [],
        exec: async () => { throw new Error('Read-only preflight must not write'); } };
    const app = new Hono(); app.use('*', async (c, next) => {
        c.set('tenant', 'alpha'); c.set('principal', { user: { id: 'owner', role: 'owner' }, tenant: 'alpha' }); return next();
    });
    registerTemplatePreflightRoutes(app, control, async () => ({ query: async () => [], exec: async () => { throw new Error('No provider writes'); } }));
    const call = slug => app.request('/api/project/template-preflight/', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, configuration: config,
            pages: [{ role: 'directory', slug: '/explore/' }, { role: 'institution', slug }] }) });
    assert.equal((await call('College')).status, 200);
    existing = [{ id: 'prior', slug: 'college', is_homepage: 0, deleted_at: null }];
    assert.equal((await call('College')).status, 409);
    existing = [];
    for (const path of ['/builder/x', '/frontbase-setup/x', '/console/x']) {
        assert.equal((await call(path)).status, 422, path);
        assert.equal(publicationPathSchema.safeParse(path).success, false, path);
    }
    assert.equal((await call('/health/x')).status, 422);
    assert.equal(publicationPathSchema.safeParse('/health/x').success, true);
});
await test('legacy serving decodes and strips boundary slashes unlike reviewed capture', async () => {
    const db = sqliteRunner(':memory:'); await migrateUp(db);
    const pages = new PagesStore(db, 'alpha'), now = '2026-10-10T00:00:00Z';
    await pages.create({ name: 'Legacy', slug: 'College' }, 'legacy', now);
    await db.exec('UPDATE compat_pages SET is_published=1 WHERE tenant_slug=? AND id=?', ['alpha', 'legacy']);
    for (const path of ['/College', '/College/', '///College///', '/%43ollege/']) {
        assert.equal((await resolvePublishedPageForTenant(db, 'alpha', path)).slug, 'College');
    }
    assert.equal(await resolvePublishedPageForTenant(db, 'alpha', '/college/'), null);
    assert.equal(await resolvePublishedPageForTenant(db, 'beta', '/College/'), null);
    assert.equal(await resolve('/%43ollege/'), null);
});
await test('remaining capture/audit grammar differences require review without rewriting', async () => {
    for (const path of ['/under_score/', '/college.name/', '/a//b/', '/%43ollege/']) {
        assert.equal(publicationPathSchema.safeParse(path).success, true, path);
        assert.equal(inspectNamespacePath(path), 'unsupported', path);
        const input = structuredClone(artifact); input.records.institutions[0].originalPath = path;
        assert.equal(sitePublicationArtifactSchema.safeParse(input).success, true, path);
        assert.ok(await resolve(path, input), path);
    }
    assert.equal(inspectNamespacePath('/health/x'), 'reserved');
    assert.equal(publicationPathSchema.safeParse('/health/x').success, true);
    // Raw Unicode is accepted by the capture schema, but Request serializes it.
    const unicode = structuredClone(artifact); unicode.records.institutions[0].originalPath = '/caf\u00e9/';
    assert.equal(sitePublicationArtifactSchema.safeParse(unicode).success, true);
    assert.equal(new URL(new Request('https://example.invalid/caf\u00e9/').url).pathname, '/caf%C3%A9/');
    assert.equal(await resolve('/caf\u00e9/', unicode), null);
});
console.log(`${groups}/8 route-identity diagnostic groups observed; preflight host-prefix repair only, no URL rewrite or writer change.`);
