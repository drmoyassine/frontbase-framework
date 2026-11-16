/**
 * Query registrar test (A-16) — defineQueries() → registrar → manifest.queries.
 * Verifies the edge projection retains `execute`, the browser projection strips
 * it, and keys are deterministically sorted.
 */
import assert from 'node:assert/strict';
import { z } from 'zod';
import { emptyDirectoryConfiguration, directorySources, immutableDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { createDirectoryQueries, createLiveDirectoryQueries } from '../dist/queries/directory.js';
import { defineQueries } from '../dist/queries/defineQueries.js';
import { toEdgeQueries, toBrowserQueries } from '../dist/queries/registrar.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const registry = defineQueries({
    'zebra.last': { params: z.object({ limit: z.number().optional() }), scope: 'public', ttlSeconds: 60, execute: async () => [{ z: 1 }] },
    'alpha.first': { execute: async () => [{ a: 1 }] },
    'static.rows': { rows: [{ x: 9 }] },
});

// Edge projection
const edge = toEdgeQueries(registry);
const edgeKeys = Object.keys(edge);
check('edge keys deterministically sorted', edgeKeys.join(',') === 'alpha.first,static.rows,zebra.last');
check('edge query carries queryId', edge['alpha.first'].queryId === 'alpha.first');
check('edge query carries params schema', !!edge['zebra.last'].params && typeof edge['zebra.last'].params.safeParse === 'function');
check('edge query carries scope + ttl', edge['zebra.last'].scope === 'public' && edge['zebra.last'].ttlSeconds === 60);
check('edge query RETAINS execute', typeof edge['alpha.first'].execute === 'function');
check('edge static query carries rows (no execute)', !!edge['static.rows'].rows && edge['static.rows'].execute === undefined);

// Browser projection — execute must be stripped
const browser = toBrowserQueries(registry);
check('browser query STRIPS execute', browser['alpha.first'].execute === undefined);
check('browser query keeps queryId + scope', browser['zebra.last'].queryId === 'zebra.last' && browser['zebra.last'].scope === 'public');
// SEC-1: browser projection is pure serializable data — NO Zod params schema
// (kept edge-side; the proxy validates), only a boolean marker.
check('browser does NOT ship the Zod params schema', browser['zebra.last'].params === undefined);
check('browser marks param-taking queries with hasParams', browser['zebra.last'].hasParams === true);
check('browser has NO execute on any query', Object.values(browser).every((q) => q.execute === undefined));
check('browser projection is fully JSON-serializable (no functions)', (() => {
    const round = JSON.parse(JSON.stringify(browser));
    return JSON.stringify(round) === JSON.stringify(browser);
})());

// Determinism: re-projecting yields identical structure
check('edge projection is deterministic', JSON.stringify(toEdgeQueries(registry)) === JSON.stringify(edge));

// execute actually runs (server-side simulation)
const rows = await edge['zebra.last'].execute({}, {});
check('edge execute runs and returns rows', Array.isArray(rows) && rows.length === 1);

const directory = emptyDirectoryConfiguration();
directory.site = {name: 'Fixture', origin: 'https://fixture.example', locale: 'en'};
directory.datasourceId = 'fixture';
for (const role of ['institution', 'program', 'city']) {
    const mapping = directory.collections[role];
    mapping.table = role;
    Object.assign(mapping.fields, {id: 'id', title: 'title', originalPath: 'path', institutionId: 'institution_id', cityId: 'city_id'});
    mapping.scope = {field: 'is_published', value: 0};
}
const legacyDirectory = structuredClone(directory);
for (const {fields} of Object.values(legacyDirectory.collections)) {
    for (const field of ['coverAlt', 'contentRole', 'sourceOrigin', 'byline', 'publishedAt']) delete fields[field];
}
assert.deepEqual(directorySources(legacyDirectory), directorySources(directory));
const immutableConfiguration=immutableDirectoryConfiguration(legacyDirectory);
assert.deepEqual(immutableConfiguration,directory,'legacy defaults normalized before reuse');
assert.ok(Object.isFrozen(immutableConfiguration.collections.program.fields));
assert.throws(()=>{immutableConfiguration.collections.program.table='unsafe;sql';},TypeError);
assert.strictEqual(directorySources(immutableConfiguration),directorySources(immutableConfiguration),'reuse only internally validated immutable definitions');
const forged=structuredClone(immutableConfiguration);forged.collections.program.scope.field='unsafe;sql';Object.freeze(forged);
assert.throws(()=>directorySources(forged),z.ZodError,'freezing caller input cannot bypass validation');
assert.notStrictEqual(directorySources(legacyDirectory),directorySources(legacyDirectory),'mutable authoring values are decoded anew');
const reads = [];
const readDirectory = async (sql, params) => {
    reads.push({sql, params});
    return [{total: 0}];
};
const live = createLiveDirectoryQueries(legacyDirectory, 'fixture', 'postgres', readDirectory);
assert.deepEqual(await live['directory.program.count'].execute({}, {tenant: 'fixture'}), [{total: 0}]);
assert.match(reads[0].sql, /FROM "program" d WHERE d\."is_published" = \$1/);
assert.deepEqual(reads[0].params, [0, 0, 0]);
legacyDirectory.collections.program.table = 'updated_program';
await createLiveDirectoryQueries(legacyDirectory, 'fixture', 'postgres', readDirectory)['directory.program.count'].execute({}, {tenant: 'fixture'});
assert.match(reads[1].sql, /FROM "updated_program" d/);
assert.match(reads[0].sql, /FROM "program" d/);
legacyDirectory.collections.program.scope.field = '';
for (const create of [createDirectoryQueries, createLiveDirectoryQueries]) {
    assert.throws(() => create(legacyDirectory, 'fixture', 'postgres', readDirectory), /directory_configuration_incomplete/);
}
legacyDirectory.collections.program.scope.field = 'unsafe;sql';
for (const create of [createDirectoryQueries, createLiveDirectoryQueries]) {
    assert.throws(() => create(legacyDirectory, 'fixture', 'postgres', readDirectory), z.ZodError);
}
check('directory compilation keeps legacy defaults, mutable mappings, scope values, and input validation', true);

console.log(failures === 0 ? '\nqueries: PASS ✅' : `\nqueries: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
