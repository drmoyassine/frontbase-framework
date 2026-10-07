/**
 * Import/shape selfcheck for the example (runs under pnpm -r build/check).
 * Verifies every framework surface the prototype depends on actually resolves
 * from this workspace, so a broken export fails here and not mid-proof.
 */
import assert from 'node:assert/strict';
import { sqliteRunner as _sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp as _app, createSecretCipher as _cipher, migrateUp as _migrateUp } from '@frontbase/backend';
import {
    directoryConfigurationSchema as _cfg, emptyDirectoryConfiguration as _empty,
    directoryConfigurationReadiness as _ready, directoryLayoutQueries as _queries,
    sitePageReferenceSchema as _ref, sitePageRoles as _roles, projectSharedDirectoryPreview as _project,
} from '@frontbase/edge-core/directory/configuration';
import { createDirectoryQueries as _create, directoryOriginalPath as _path } from '@frontbase/compiler/queries/directory';
import { buildArtifact, buildTemplateSource, REQUIRED_CAPABILITIES } from './template-source.mjs';
import { validateTemplateArtifact, exportTemplateArtifact, evaluateCapabilities, findCollisions, mergeArtifactUpgrade, nodeFingerprint } from './artifact.mjs';
import { bindConfiguration, bindDetailPaths, installTemplate, previewDirectory, createSqliteDatasource } from './install.mjs';

const artifact = buildArtifact(1, { institution: '/i/', program: '/p/', article: '/b/' });
assert.equal(artifact.artifact.kind, 'frontbase-template-export');
assert.equal(validateTemplateArtifact(artifact).ok, true);
assert.equal(typeof nodeFingerprint({ a: 1 }), 'string');
assert.deepEqual(evaluateCapabilities(artifact, { sqlDatasourceKinds: [] }).missing.map(m => m.id), ['sql.datasource']);
assert.deepEqual(findCollisions(artifact, { existingPageSlugs: ['explore'], existingRoutes: [] }).map(c => c.detail), ['explore']);
console.log('education-template-proof selfcheck: framework imports and prototype surfaces resolve');
