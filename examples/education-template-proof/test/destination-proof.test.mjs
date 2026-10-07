/**
 * Destination proof (workstream B prototype): the same artifact installs into
 * two isolated synthetic destinations with zero framework source edits; state
 * and owners stay isolated; refusals and fail-closed publication hold.
 */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp, createSecretCipher, migrateUp } from '@frontbase/backend';
import { createDirectoryQueries } from '@frontbase/compiler/queries/directory';
import { buildArtifact } from '../src/template-source.mjs';
import { validateTemplateArtifact } from '../src/artifact.mjs';
import { installTemplate, previewDirectory, createSqliteDatasource } from '../src/install.mjs';

const now = () => '2026-10-07T12:00:00Z';
const readFixture = async name => (await import(`../fixtures/${name}.json`, { with: { type: 'json' } })).default;
const fileDb = () => 'file:' + join(tmpdir(), `edu-test-${randomUUID()}.db`).replaceAll('\\', '/');

const usa = await readFixture('usa');
const hungary = await readFixture('hungary');
const artifact = buildArtifact(1, { institution: '/institution-sample/', program: '/program-sample/', article: '/blog/sample/' });
assert.equal(validateTemplateArtifact(artifact).ok, true, 'artifact must validate before installs');

async function destination(fixture) {
    const control = sqliteRunner(':memory:');
    await migrateUp(control);
    const contentUrl = fileDb();
    const content = sqliteRunner(contentUrl);
    for (const ddl of fixture.content.ddl) await content.exec(ddl);
    for (const seed of fixture.content.seed) await content.exec(seed);
    const secret = `edu-test-${fixture.destinationId}`;
    const principal = { tenant: fixture.tenant };
    const app = await createCompatApp({
        makeRunner: async () => control,
        resolvePrincipal: async () => ({ user: { id: 'owner', role: 'owner' }, tenant: principal.tenant }),
        sessionSecret: secret,
        now,
    });
    return { fixture, control, content, contentUrl, app, principal, cipher: await createSecretCipher(secret) };
}

const install = async (destination, datasourceId) => {
    await createSqliteDatasource(destination.control, {
        id: datasourceId, tenant: destination.fixture.tenant,
        name: destination.fixture.bindings.datasourceName, url: destination.contentUrl, cipher: destination.cipher,
    });
    return installTemplate({
        app: destination.app, artifact,
        bindings: { ...destination.fixture.bindings, datasourceId },
        detailSamplePaths: destination.fixture.bindings.detailSamplePaths,
    });
};

const usaDestination = await destination(usa);
const hungaryDestination = await destination(hungary);

// Fresh install into two independent destinations from the SAME artifact.
const usaInstall = await install(usaDestination, 'usa-content');
const huInstall = await install(hungaryDestination, 'hungary-content');
assert.deepEqual(usaInstall.installedPages, ['explore', 'institutions', 'programs', 'blog', 'articles']);
assert.deepEqual(huInstall.installedPages, ['explore', 'institutions', 'programs', 'blog', 'articles']);
assert.equal(usaInstall.configuration.site.locale, 'en');
assert.equal(huInstall.configuration.site.locale, 'hu');
assert.equal(usaInstall.configuration.collections.program.table, 'usa_programs');
assert.equal(huInstall.configuration.collections.program.table, 'hu_programok');
assert.equal(usaInstall.configuration.collections.institution.scope.value, 840);
assert.equal(huInstall.configuration.collections.institution.scope.value, 348);

// Previews resolve each destination's own synthetic rows on original paths.
const usaList = await previewDirectory(usaDestination.app, { role: 'institution' });
assert.equal(usaList.status, 200);
assert.equal(usaList.body.publicationAvailable, false);
assert.deepEqual(usaList.body.rows.map(r => Number(r.id)), usa.expect.institutionListIds);
assert.ok(!JSON.stringify(usaList).includes('PRIVATE_PROVIDER_CANARY'));
const usaWrongCountry = await previewDirectory(usaDestination.app, { role: 'program', mode: 'detail', params: { path: '/springfield-metropolitan-university/excluded/' } });
assert.equal(usaWrongCountry.status, 200);
assert.equal(usaWrongCountry.body.rows.length, 0, 'wrong-country row must not resolve as detail');

const huList = await previewDirectory(hungaryDestination.app, { role: 'institution' });
assert.deepEqual(huList.body.rows.map(r => Number(r.id)), hungary.expect.institutionListIds);
assert.ok(!JSON.stringify(huList).toLowerCase().includes('springfield'));
assert.ok(!JSON.stringify(huList).includes('PRIVATE_PROVIDER_CANARY'));

// Isolation: no settings, rows or paths cross between the two engines.
const huSettings = await (await hungaryDestination.app.request('/api/project/site-configuration/')).json();
assert.equal(huSettings.revision, 1);
assert.equal(huSettings.draft.configuration.site.origin, 'https://hungary.example');
const hungaryText = JSON.stringify(huSettings) + JSON.stringify(huList);
assert.ok(!hungaryText.includes('usa.example'), 'Hungary destination must not inherit USA identity');

// Missing capability refusal: no datasource bound -> clear failure naming the
// capability and its resolution path.
await assert.rejects(
    () => installTemplate({ app: usaDestination.app, artifact, bindings: { ...usa.bindings, datasourceId: '' }, detailSamplePaths: usa.bindings.detailSamplePaths }),
    error => /missing required capabilities/.test(error.message) && /sql\.datasource/.test(error.message) && /frontbase-admin/.test(error.message),
);

// Binding a datasource that does not resolve is refused at save time (403),
// and a destination with no saved draft refuses preview (422): both fail clearly.
{
    const empty = await destination(usa);
    const config = structuredClone(usaInstall.configuration);
    config.datasourceId = 'missing-datasource';
    const put = await empty.app.request('/api/project/site-configuration/', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, configuration: config }),
    });
    const putBody = await put.json();
    assert.equal(put.status, 403, JSON.stringify(putBody));
    assert.match(String(putBody.detail), /datasource/i);
    const refused = await previewDirectory(empty.app, { role: 'institution' });
    assert.equal(refused.status, 422);
}

// Owner isolation: query level and HTTP level. A forged tenant sees no victim
// state (no draft -> 422) and cannot bind another tenant's datasource (403).
{
    const registry = createDirectoryQueries(usaInstall.configuration, usa.tenant, 'sqlite', (sql, p) => usaDestination.content.query(sql, p));
    await assert.rejects(() => registry['directory.institution.list'].execute({}, { tenant: hungary.tenant, user: { id: 'owner' } }), /principal_context_required/);
    hungaryDestination.principal.tenant = usa.tenant;
    const cross = await previewDirectory(hungaryDestination.app, { role: 'institution' });
    assert.equal(cross.status, 422, 'forged tenant must not resolve the victim destination draft');
    const stolen = await hungaryDestination.app.request('/api/project/site-configuration/', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, configuration: usaInstall.configuration }),
    });
    hungaryDestination.principal.tenant = hungary.tenant;
    assert.equal(stolen.status, 403, 'forged tenant must not bind another tenant datasource (usa-content is usa-owned)');
}

// Publication stays fail-closed: no activation endpoint, publish refused.
{
    const pages = (await (await usaDestination.app.request('/api/pages/')).json()).data;
    const directory = pages.find(p => p.slug === 'explore');
    const publish = await usaDestination.app.request(`/api/pages/${directory.id}/publish/local/`, { method: 'POST' });
    assert.equal(publish.status, 422);
    assert.match(JSON.stringify(await publish.json()), /directory_runtime_pending|not available/);
    assert.equal((await usaDestination.app.request('/api/project/site-configuration/', { method: 'POST' })).status, 404);
}

console.log('destination-proof: two isolated destinations, isolation, refusals and fail-closed publication passed');
