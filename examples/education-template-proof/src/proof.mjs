/**
 * End-to-end prototype proof (workstream B, second swarm).
 *
 * Exercises, on isolated synthetic state only:
 *   1. export + validate the versioned template artifact (no secrets/exclusions)
 *   2. fresh install into a synthetic USA destination through real routes
 *   3. fresh install into a synthetic Hungary destination from the SAME artifact
 *   4. destination isolation (separate engines/state, no cross-leak)
 *   5. collision refusal, missing-capability refusal, stale-revision CAS
 *   6. upgrade-preservation of owner-customized nodes (prototype merge)
 *   7. publication refusal (fail-closed) — actual install publication is not performed
 *   8. owner isolation at query and HTTP level
 *
 * Everything runs in-process (app.request) against per-destination SQLite
 * state; no server, no shared database, no live Supabase or Garage.
 */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp, createSecretCipher, migrateUp } from '@frontbase/backend';
import { createDirectoryQueries } from '@frontbase/compiler/queries/directory';
import { buildArtifact } from './template-source.mjs';
import { validateTemplateArtifact, mergeArtifactUpgrade } from './artifact.mjs';
import { installTemplate, previewDirectory, createSqliteDatasource } from './install.mjs';

const phase = name => console.log(`\n=== ${name} ===`);
const fileDb = () => 'file:' + join(tmpdir(), `edu-proof-${randomUUID()}.db`).replaceAll('\\', '/');

async function readFixture(name) {
    return (await import(`../fixtures/${name}.json`, { with: { type: 'json' } })).default;
}

async function seedContentDb(fixture) {
    const url = fileDb();
    const runner = sqliteRunner(url);
    for (const ddl of fixture.content.ddl) await runner.exec(ddl);
    for (const seed of fixture.content.seed) await runner.exec(seed);
    return { url, runner };
}

async function createDestination(fixture) {
    const control = sqliteRunner(':memory:');
    await migrateUp(control);
    const content = await seedContentDb(fixture);
    const cipher = await createSecretCipher(`edu-proof-${fixture.destinationId}-session`);
    const principal = { tenant: fixture.tenant };
    const app = await createCompatApp({
        makeRunner: async () => control,
        resolvePrincipal: async () => ({ user: { id: 'owner', role: 'owner' }, tenant: principal.tenant }),
        sessionSecret: `edu-proof-${fixture.destinationId}-session`,
        now: () => '2026-10-07T12:00:00Z',
    });
    return { fixture, control, content, cipher, app, principal };
}

async function installInto(destination, artifact, { datasourceId }) {
    await createSqliteDatasource(destination.control, {
        id: datasourceId,
        tenant: destination.fixture.tenant,
        name: destination.fixture.bindings.datasourceName,
        url: destination.content.url,
        cipher: destination.cipher,
    });
    return await installTemplate({
        app: destination.app,
        artifact,
        bindings: { ...destination.fixture.bindings, datasourceId },
        detailSamplePaths: destination.fixture.bindings.detailSamplePaths,
    });
}

function assertNoLeaks(text, forbidden, label) {
    for (const needle of forbidden) {
        assert.ok(!text.toLowerCase().includes(String(needle).toLowerCase()), `${label} leaked "${needle}"`);
    }
}

const usa = await readFixture('usa');
const hungary = await readFixture('hungary');

// ---------------------------------------------------------------- phase 1
phase('1. Export + validate the versioned template artifact');
const samplePaths = { institution: '/institution-sample/', program: '/program-sample/', article: '/blog/sample/' };
const artifact = buildArtifact(1, samplePaths);
const validation = validateTemplateArtifact(artifact);
assert.equal(validation.ok, true, `artifact validation failed: ${validation.errors.join(' | ')}`);
const artifactSnapshot = structuredClone(artifact);
const artifactText = JSON.stringify(artifact);
assertNoLeaks(artifactText, ['usa_', 'hu_', 'usa.example', 'hungary.example', '@usa.example', 'canary', 'private_provider', '840', '348'], 'artifact');
assert.ok(artifact.destinationBindings.includes('datasourceId'));
console.log(`artifact exportSchema=${artifact.artifact.exportSchema} template=${artifact.artifact.templateId}@v${artifact.artifact.templateVersion} pages=${artifact.pages.map(p => p.role).join(',')} readiness-gaps-all-declared`);

// ---------------------------------------------------------------- phase 2
phase('2. Fresh install + configuration save + preview (synthetic USA)');
const usaDestination = await createDestination(usa);
{
    // Before any install the destination has an empty shared configuration.
    const before = await (await usaDestination.app.request('/api/project/site-configuration/')).json();
    assert.equal(before.revision, 0);
    assert.equal(before.draft, null);
}
const usaInstall = await installInto(usaDestination, artifact, { datasourceId: 'usa-content' });
assert.equal(usaInstall.revision, 1);
assert.deepEqual(usaInstall.installedPages, ['explore', 'institutions', 'programs', 'blog', 'articles']);

const usaInstitutions = await previewDirectory(usaDestination.app, { role: 'institution' });
assert.equal(usaInstitutions.status, 200);
assert.equal(usaInstitutions.body.publicationAvailable, false, 'preview must never claim publication');
assert.deepEqual(usaInstitutions.body.rows.map(r => Number(r.id)), usa.expect.institutionListIds);
assertNoLeaks(JSON.stringify(usaInstitutions), ['PRIVATE_PROVIDER_CANARY', 'usa.example'], 'USA preview projection');

const usaProgramsFor101 = await previewDirectory(usaDestination.app, { role: 'program', params: { institutionId: 101 } });
assert.deepEqual(usaProgramsFor101.body.rows.map(r => Number(r.id)), usa.expect.programIdsForInstitution101);
const usaExcluded = await previewDirectory(usaDestination.app, { role: 'program', mode: 'detail', params: { path: '/springfield-metropolitan-university/excluded/' } });
assert.equal(usaExcluded.status, 200, `wrong-country detail preview failed: ${JSON.stringify(usaExcluded.body)}`);
assert.equal(usaExcluded.body.rows.length, 0, 'wrong-country row must not resolve as detail');
const usaDetail = await previewDirectory(usaDestination.app, { role: 'institution', mode: 'detail', params: { path: '/springfield-metropolitan-university/' } });
assert.equal(Number(usaDetail.body.rows[0].id), usa.expect.institutionDetailId);
const usaArticles = await previewDirectory(usaDestination.app, { role: 'article' });
assert.deepEqual(usaArticles.body.rows.map(r => Number(r.id)), usa.expect.articleListIds);
console.log(`USA install ok: revision=${usaInstall.revision} institutions=${usaInstitutions.body.rows.length} programs(101)=${usaProgramsFor101.body.rows.length} articles=${usaArticles.body.rows.length}`);

// ---------------------------------------------------------------- phase 3
phase('3. Second destination from the SAME artifact (synthetic Hungary)');
assert.deepEqual(artifact, artifactSnapshot, 'install must not mutate the artifact');
const hungaryDestination = await createDestination(hungary);
{
    const before = await (await hungaryDestination.app.request('/api/project/site-configuration/')).json();
    assert.equal(before.revision, 0, 'a fresh destination must start empty (no USA settings inherited)');
}
const huInstall = await installInto(hungaryDestination, artifact, { datasourceId: 'hungary-content' });
assert.equal(huInstall.revision, 1);
const huInstitutions = await previewDirectory(hungaryDestination.app, { role: 'institution' });
assert.deepEqual(huInstitutions.body.rows.map(r => Number(r.id)), hungary.expect.institutionListIds);
assertNoLeaks(JSON.stringify(huInstitutions), ['101', 'springfield', 'usa.example', 'PRIVATE_PROVIDER_CANARY'], 'Hungary preview');
const huDetail = await previewDirectory(hungaryDestination.app, { role: 'institution', mode: 'detail', params: { path: '/duna-parti-egyetem/' } });
assert.equal(Number(huDetail.body.rows[0].id), hungary.expect.institutionDetailId);
assert.equal(huInstall.configuration.site.locale, 'hu');
assert.equal(huInstall.configuration.collections.institution.table, 'hu_intezmenyek');
assert.equal(huInstall.configuration.collections.institution.scope.field, 'orszag');
assert.equal(huInstall.configuration.collections.institution.scope.value, 348);
assert.equal(usaInstall.configuration.collections.institution.scope.value, 840);
assert.equal(usaInstall.configuration.site.origin, 'https://usa.example');
assert.equal(huInstall.configuration.site.origin, 'https://hungary.example');
assert.notEqual(usaInstall.configuration.routes.directory, huInstall.configuration.routes.directory);
console.log(`Hungary install ok: revision=${huInstall.revision} institutions=${huInstitutions.body.rows.length} locale=${huInstall.configuration.site.locale} routes.directory=${huInstall.configuration.routes.directory}`);
console.log('no source edits between destinations: one artifact object, two bindings, zero framework file changes');

// ---------------------------------------------------------------- phase 4
phase('4. Collision + missing capability + stale revision refusals');
await assert.rejects(
    () => installTemplate({ app: usaDestination.app, artifact, bindings: { ...usa.bindings, datasourceId: 'usa-content' }, detailSamplePaths: usa.bindings.detailSamplePaths }),
    error => /collision/.test(error.message) && /explore/.test(error.message),
    're-install into a configured destination must report slug collisions',
);
await assert.rejects(
    () => installTemplate({ app: usaDestination.app, artifact, bindings: { ...usa.bindings, datasourceId: '' }, detailSamplePaths: usa.bindings.detailSamplePaths }),
    error => /missing required capabilities/.test(error.message) && /sql\.datasource/.test(error.message) && /frontbase-admin/.test(error.message),
    'install without a datasource binding must refuse with the capability gap and its resolution path',
);
{
    const stale = await usaDestination.app.request('/api/project/site-configuration/', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, configuration: usaInstall.configuration }),
    });
    assert.equal(stale.status, 409, 'stale expectedRevision must conflict');
}
console.log('collision, missing-capability and CAS refusals all fail with explicit messages');

// ---------------------------------------------------------------- phase 5
phase('5. Upgrade preservation of owner-customized nodes (prototype merge)');
{
    const pages = (await (await usaDestination.app.request('/api/pages/')).json()).data;
    const directory = pages.find(p => p.slug === 'explore');
    // Owner customizes: edits the template heading text and adds an owner node.
    const owned = structuredClone(directory.layoutData);
    const heading = owned.content.find(n => n.id === 'tpl-directory-heading');
    heading.props.text = 'Owner-revised heading';
    owned.content.splice(0, 0, { id: 'owner-note-1', type: 'Text', props: { text: 'Owner custom note (kept)' } });
    const saveOwner = await usaDestination.app.request(`/api/pages/${directory.id}/`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layoutData: owned }),
    });
    assert.equal(saveOwner.status, 200, `owner save failed: ${await saveOwner.text()}`);
    const snap = await usaDestination.app.request(`/api/pages/${directory.id}/versions/`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'pre-upgrade owner state' }),
    });
    assert.equal(snap.status, 200);

    const artifactV2 = buildArtifact(2, samplePaths);
    assert.equal(validateTemplateArtifact(artifactV2).ok, true);
    const previousDirectory = artifact.pages.find(p => p.slug === 'explore');
    const nextDirectory = artifactV2.pages.find(p => p.slug === 'explore');
    const merge = mergeArtifactUpgrade({ previousLayout: previousDirectory.layout, liveLayout: owned, nextLayout: nextDirectory.layout });
    assert.deepEqual(merge.errors, [], `merge refused: ${merge.errors.join('; ')}`);
    assert.ok(merge.report.preservedCustomized.includes('tpl-directory-heading'), 'owner-edited heading must be preserved');
    assert.ok(merge.report.preservedOwnerTopLevel.includes('owner-note-1'), 'owner-added node must be preserved');
    assert.ok(merge.report.upgraded.includes('tpl-directory-site-name'), 'unmodified template nodes upgrade');
    assert.ok(merge.report.added.includes('tpl-directory-footer-note'), 'v2-only node is added');
    const mergedText = JSON.stringify(merge.layout);
    assert.ok(mergedText.includes('Owner-revised heading'));
    assert.ok(mergedText.includes('Owner custom note (kept)'));
    assert.ok(mergedText.includes('Updated directory footer (template v2)'));
    assert.ok(!mergedText.includes('Find your institution"'), 'superseded v1 heading text must not return');

    const saveUpgrade = await usaDestination.app.request(`/api/pages/${directory.id}/layout/`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layoutData: merge.layout }),
    });
    assert.equal(saveUpgrade.status, 200, `upgrade save failed: ${await saveUpgrade.text()}`);
    const after = (await (await usaDestination.app.request(`/api/pages/${directory.id}/`)).json()).data;
    const afterText = JSON.stringify(after.layoutData);
    assert.ok(afterText.includes('Owner-revised heading') && afterText.includes('Owner custom note (kept)'));
    const stillPreview = await previewDirectory(usaDestination.app, { role: 'institution' });
    assert.equal(stillPreview.status, 200, 'preview must keep working after upgrade');
    const versions = (await (await usaDestination.app.request(`/api/pages/${directory.id}/versions/`)).json()).data;
    assert.ok(versions.length >= 1, 'page history retains the pre-upgrade snapshot (recovery mechanism)');
    console.log(`upgrade merge ok: upgraded=${merge.report.upgraded.length} preservedCustomized=${merge.report.preservedCustomized.length} preservedOwner=${merge.report.preservedOwnerTopLevel.length} added=${merge.report.added.length}; history versions=${versions.length}`);

    // Owner content nested inside a template subtree: the first customized
    // ancestor preserves its whole subtree, so the nested owner node survives.
    const nested = structuredClone(owned);
    nested.content.find(n => n.id === 'tpl-directory-institution-list').children[0].children
        .push({ id: 'owner-nested-1', type: 'Text', props: { text: 'nested owner node' } });
    const mergeNested = mergeArtifactUpgrade({ previousLayout: previousDirectory.layout, liveLayout: nested, nextLayout: nextDirectory.layout });
    assert.deepEqual(mergeNested.errors, []);
    assert.ok(JSON.stringify(mergeNested.layout).includes('nested owner node'), 'nested owner content must survive via whole-subtree preservation');
    assert.ok(mergeNested.report.preservedCustomized.includes('tpl-directory-institution-list'));
}

// ---------------------------------------------------------------- phase 6
phase('6. Publication stays fail-closed on a fresh install (blocked, not bypassed)');
{
    const pages = (await (await usaDestination.app.request('/api/pages/')).json()).data;
    const directory = pages.find(p => p.slug === 'explore');
    const publish = await usaDestination.app.request(`/api/pages/${directory.id}/publish/local/`, { method: 'POST' });
    assert.equal(publish.status, 422);
    const publishBody = await publish.json();
    assert.equal(publishBody.code ?? publishBody.detail, 'directory_runtime_pending');
    const noActivation = await usaDestination.app.request('/api/project/site-configuration/', { method: 'POST' });
    assert.equal(noActivation.status, 404, 'unsupported configuration POST must remain refused');
    const inactive=await usaDestination.app.request('/api/project/site-configuration/publication/state/');
    assert.equal(inactive.status,200);assert.equal((await inactive.json()).pointer,null);
    const again = await previewDirectory(usaDestination.app, { role: 'institution' });
    assert.equal(again.body.publicationAvailable, false);
    console.log('publish refused with directory_runtime_pending; unsupported configuration POST refused; preparation publicationAvailable=false');
    console.log('NOT RUN: clean-install capture review/activation/update/rollback journey; T3 controls have separate local proof');
}

// ---------------------------------------------------------------- phase 7
phase('7. Owner isolation (query level + HTTP level)');
{
    const usaConfig = usaInstall.configuration;
    const usaRegistry = createDirectoryQueries(usaConfig, usa.tenant, 'sqlite', (sql, p) => usaDestination.content.runner.query(sql, p));
    await assert.rejects(
        () => usaRegistry['directory.institution.list'].execute({}, { tenant: hungary.tenant, user: { id: 'owner' } }),
        /principal_context_required/,
        'another tenant must not execute USA-owned queries',
    );
    const hungaryPrincipal = hungaryDestination.principal;
    hungaryPrincipal.tenant = usa.tenant; // forged tenant on the Hungary app
    const cross = await previewDirectory(hungaryDestination.app, { role: 'institution' });
    assert.equal(cross.status, 422, 'forged tenant must not resolve the victim destination draft');
    const stolen = await hungaryDestination.app.request('/api/project/site-configuration/', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, expectedRevision: 0, configuration: usaConfig }),
    });
    hungaryPrincipal.tenant = hungary.tenant;
    assert.equal(stolen.status, 403, 'forged tenant must not bind another tenant datasource');
    console.log('query-level principal_context_required; forged tenant sees no victim draft (422) and cannot bind a usa-owned datasource (403)');
}

// ---------------------------------------------------------------- done
console.log('\nPROOF PASSED: synthetic USA/Hungary reuse, isolation, refusals, upgrade preservation and fail-closed publication all verified on isolated state.');
