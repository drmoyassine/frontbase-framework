/**
 * Query registrar test (A-16) — defineQueries() → registrar → manifest.queries.
 * Verifies the edge projection retains `execute`, the browser projection strips
 * it, and keys are deterministically sorted.
 */
import { z } from 'zod';
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
check('browser keeps params (for the SW to know the shape)', !!browser['zebra.last'].params);
check('browser has NO execute on any query', Object.values(browser).every((q) => q.execute === undefined));

// Determinism: re-projecting yields identical structure
check('edge projection is deterministic', JSON.stringify(toEdgeQueries(registry)) === JSON.stringify(edge));

// execute actually runs (server-side simulation)
const rows = await edge['zebra.last'].execute({}, {});
check('edge execute runs and returns rows', Array.isArray(rows) && rows.length === 1);

console.log(failures === 0 ? '\nqueries: PASS ✅' : `\nqueries: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
