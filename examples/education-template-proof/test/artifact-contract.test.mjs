/**
 * Artifact-contract tests (workstream B prototype): exclusion enforcement,
 * no-secret scanning, readiness/binding declaration, collision and capability
 * refusal, and upgrade-merge preservation semantics. Runs fast, no database.
 */
import assert from 'node:assert/strict';
import { buildArtifact, buildTemplateSource, DESTINATION_BINDINGS } from '../src/template-source.mjs';
import { validateTemplateArtifact, exportTemplateArtifact, evaluateCapabilities, findCollisions, mergeArtifactUpgrade } from '../src/artifact.mjs';
import { bindConfiguration, bindDetailPaths } from '../src/install.mjs';

const samplePaths = { institution: '/institution-sample/', program: '/program-sample/', article: '/blog/sample/' };

// Validation and structure.
const artifact = buildArtifact(1, samplePaths);
const validation = validateTemplateArtifact(artifact);
assert.deepEqual(validation.errors, [], validation.errors.join(' | '));
assert.equal(validation.ok, true);
assert.equal(artifact.artifact.exportSchema, 1);
assert.equal(artifact.configuration.datasourceId, '');
assert.ok(artifact.pages.length === 5);
for (const gap of ['datasourceId', 'site.name', 'site.origin']) assert.ok(artifact.destinationBindings.includes(gap), `binding declaration missing ${gap}`);
assert.ok(DESTINATION_BINDINGS.length >= 15);

// Deterministic export: same source, same bytes.
assert.equal(JSON.stringify(buildArtifact(1, samplePaths)), JSON.stringify(artifact));

// No-secret scan: exporter refuses canary-shaped content.
const poisoned = structuredClone(buildTemplateSource(1, samplePaths));
poisoned.pages[0].layout.content.push({ id: 'x', type: 'Text', props: { text: 'PRIVATE_PROVIDER_CANARY_TEST' } });
assert.throws(() => exportTemplateArtifact(poisoned), error => /excluded_content|secret/i.test(error.message));
const jwtPoison = structuredClone(buildTemplateSource(1, samplePaths));
jwtPoison.notes = 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxInQ placeholder';
assert.throws(() => exportTemplateArtifact(jwtPoison), /excluded_content|secret/i);

// Forbidden keys never ship: unknown source keys refuse; forbidden keys inside
// the artifact body fail validation.
const rowsPoison = structuredClone(buildTemplateSource(1, samplePaths));
rowsPoison.records = [{ id: 1, title: 'row' }];
assert.throws(() => exportTemplateArtifact(rowsPoison), /allowlist|unknown/i);
const forbiddenNested = structuredClone(artifact);
forbiddenNested.pages[0].layout.content[0].props.approvals = [{ reviewer: 'x' }];
const forbiddenValidation = validateTemplateArtifact(forbiddenNested);
assert.equal(forbiddenValidation.ok, false);
assert.ok(forbiddenValidation.errors.some(e => /forbidden-key/.test(e)));

// Destination-bound values refuse to export.
const boundSource = buildTemplateSource(1, samplePaths);
boundSource.configuration.datasourceId = 'some-datasource';
assert.throws(() => exportTemplateArtifact(boundSource), /datasourceId/);
const scopedSource = buildTemplateSource(1, samplePaths);
scopedSource.configuration.collections.institution.scope.value = 840;
assert.throws(() => exportTemplateArtifact(scopedSource), /scope\.value/);

// An untrusted artifact that hides a canary fails validation.
const tampered = structuredClone(artifact);
tampered.pages[0].layout.content[1].props.text = 'postgres://admin:hunter2@db.example/x';
const tamperedValidation = validateTemplateArtifact(tampered);
assert.equal(tamperedValidation.ok, false);
assert.ok(tamperedValidation.errors.some(e => /secret-shaped/.test(e)));

// A gap not declared in destinationBindings fails validation clearly.
const undeclared = structuredClone(artifact);
delete undeclared.destinationBindings;
const undeclaredValidation = validateTemplateArtifact(undeclared);
assert.equal(undeclaredValidation.ok, false);
assert.ok(undeclaredValidation.errors.some(e => /destinationBindings/.test(e)));

// Broken layout grammar fails validation.
const brokenLayout = structuredClone(artifact);
brokenLayout.pages[0].layout.content[2].type = 'Container'; // list query must sit on a Repeater
assert.equal(validateTemplateArtifact(brokenLayout).ok, false);

// Capability evaluation: missing SQL datasource fails clearly with a resolution path.
const missing = evaluateCapabilities(artifact, { sqlDatasourceKinds: [], objectStorageKinds: [], publicationRuntime: false });
assert.equal(missing.ok, false);
assert.deepEqual(missing.missing.map(m => m.id), ['sql.datasource']);
assert.match(missing.missing[0].resolveVia, /frontbase-admin/);
const satisfied = evaluateCapabilities(artifact, { sqlDatasourceKinds: ['sqlite'], objectStorageKinds: [], publicationRuntime: false });
assert.equal(satisfied.ok, true);
const publicationPending = evaluateCapabilities(artifact, { sqlDatasourceKinds: ['sqlite'], objectStorageKinds: [], publicationRuntime: false });
assert.ok(artifact.requiredCapabilities.find(c => c.id === 'publication.runtime').required === false, 'publication capability must stay optional/pending');

// Collisions: slug and reserved-route detection.
assert.deepEqual(findCollisions(artifact, { existingPageSlugs: ['explore', 'other'], existingRoutes: [] }), [{ kind: 'page-slug', detail: 'explore' }]);
assert.deepEqual(findCollisions(artifact, { existingPageSlugs: [], existingRoutes: ['/explore/'] }).map(c => c.detail), ['/explore/']);
assert.deepEqual(findCollisions(artifact, { existingPageSlugs: [], existingRoutes: [] }), []);

// Binding: fixture values land on the right paths; unknown/invalid values refuse.
const bound = bindConfiguration(artifact, {
    datasourceId: 'ds-1',
    site: { name: 'Fixture', destination: 'Fixtureland', origin: 'https://fixture.example', locale: 'en' },
    contacts: { email: 'a@fixture.example', whatsapp: '' },
    routes: { directory: '/explore/', blog: '/blog/' },
    collections: {
        institution: { table: 'f_institutions', scopeField: 'country', scopeValue: 840, fields: { title: 'name_col' } },
        program: { table: 'f_programs', scopeValue: 840, fields: { institutionId: 'parent_col' } },
        city: { table: 'f_cities', scopeValue: 840 },
        article: { table: 'f_articles', scopeValue: 840, fields: { contentRole: 'kind', sourceOrigin: 'origin', body: 'body' } },
    },
});
assert.equal(bound.collections.institution.fields.title, 'name_col', 'field overrides merge over template defaults');
assert.equal(bound.collections.institution.fields.id, 'id');
assert.equal(bound.collections.city.fields.originalPath, '');
assert.equal(bound.datasourceId, 'ds-1');
assert.throws(() => bindConfiguration(artifact, { site: { name: 'x' } }), /datasourceId/, 'incomplete binding must refuse with the exact gap');
assert.throws(() => bindConfiguration(artifact, { datasourceId: 'ds', site: { origin: 'not a url' } }), /invalid|refine|origin/i);

// Detail path binding rewrites saved sample paths per destination.
const hu = bindDetailPaths(artifact, { institution: '/duna/', program: '/p-hu/', article: '/b-hu/' });
const detailNode = hu.find(p => p.role === 'institution').layout.content[0];
assert.equal(detailNode.props.directoryQuery.params.path, '/duna/');
const usaDetail = bindDetailPaths(artifact, { institution: '/springfield/', program: '/p-usa/', article: '/b-usa/' });
assert.equal(usaDetail.find(p => p.role === 'institution').layout.content[0].props.directoryQuery.params.path, '/springfield/');
assert.equal(artifact.pages.find(p => p.role === 'institution').layout.content[0].props.directoryQuery.params.path, '/institution-sample/', 'bindDetailPaths must not mutate the artifact');

// Upgrade merge: v2 additions land, v1→v2 text/style changes apply, owner content preserved.
const artifactV2 = buildArtifact(2, samplePaths);
const v1Directory = artifact.pages.find(p => p.slug === 'explore').layout;
const v2Directory = artifactV2.pages.find(p => p.slug === 'explore').layout;
const live = structuredClone(v1Directory);
live.content.splice(0, 0, { id: 'owner-note', type: 'Text', props: { text: 'mine' } });
const merge = mergeArtifactUpgrade({ previousLayout: v1Directory, liveLayout: live, nextLayout: v2Directory });
assert.deepEqual(merge.errors, []);
assert.ok(merge.report.preservedOwnerTopLevel.includes('owner-note'));
assert.ok(merge.report.added.includes('tpl-directory-footer-note'));
assert.ok(JSON.stringify(merge.layout).includes('mine'));
assert.ok(JSON.stringify(merge.layout).includes('Find your institution or program'));

// Owner-edited template node stays; page root metadata stays owner-owned.
const edited = structuredClone(v1Directory);
edited.content.find(n => n.id === 'tpl-directory-heading').props.text = 'Custom heading';
edited.root.customMetadata = { owner: 'kept' };
const mergeEdited = mergeArtifactUpgrade({ previousLayout: v1Directory, liveLayout: edited, nextLayout: v2Directory });
assert.ok(mergeEdited.report.preservedCustomized.includes('tpl-directory-heading'));
assert.equal(mergeEdited.layout.root.customMetadata.owner, 'kept');
assert.ok(!JSON.stringify(mergeEdited.layout).includes('Find your institution or program'), 'customized node must not be auto-upgraded');

console.log('artifact-contract: validation, exclusions, no-secret, capability, collision, binding and merge-preservation semantics passed');
