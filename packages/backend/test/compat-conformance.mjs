/**
 * CF-22 Gate 1 — response conformance, measured against the vendored contract.
 *
 * The drift gate cannot see this. `buildFrameworkSpec()` clones the vendored
 * product doc and stamps `x-implemented` from a manual registry, so it compares
 * the contract to itself and reports 0 divergent no matter what the handlers
 * actually return. Gate 0 proved that empirically: 4 of 30 param-less GETs were
 * violating the contract while the gate was green.
 *
 * This probe drives the REAL compat app and validates REAL responses against the
 * generated Zod, so a handler that drifts from the contract shows up here.
 *
 * Every operation lands in exactly one bucket:
 *   CONFORMS     documented 2xx returned and it validates
 *   VIOLATES     documented 2xx returned and it does NOT validate  ← the number
 *   UNREACHABLE  handler answered 4xx/5xx — needs fixtures this probe lacks
 *   NO_SCHEMA    contract documents no $ref 2xx body (nothing to check)
 *
 * UNREACHABLE is honest ignorance, not a pass: it is reported separately and
 * never counted as success. Driving it to zero is Gate 1/Gate 3 work.
 */
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import * as Z from '../dist/compat/zod.gen.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'openapi.community.json'), 'utf8'));
const deref = (node) => node?.$ref ? deref(spec.components.schemas[node.$ref.split('/').pop()]) : node;

/** Minimal body that satisfies a schema's required fields — enough to reach the handler. */
function synth(schema, depth = 0) {
    const s = deref(schema);
    if (!s || depth > 4) return {};
    if (s.default !== undefined) return s.default;
    if (s.enum) return s.enum[0];
    if (s.anyOf || s.oneOf) {
        const branch = (s.anyOf ?? s.oneOf).find((b) => deref(b)?.type !== 'null');
        return branch ? synth(branch, depth + 1) : null;
    }
    switch (s.type) {
        case 'string': return s.format === 'date-time' ? '2026-01-01T00:00:00Z'
            : s.format === 'email' ? 'probe@example.com'
                : s.format === 'uuid' ? '11111111-1111-4111-8111-111111111111' : 'probe';
        case 'integer': case 'number': return s.minimum ?? 1;
        case 'boolean': return false;
        case 'array': return [];
        case 'object': {
            const out = {};
            for (const key of s.required ?? []) out[key] = synth(s.properties?.[key] ?? {}, depth + 1);
            return out;
        }
        default: return {};
    }
}

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'owner', email: 'owner@example.com', role: 'master_admin' }, tenant: '_default' }),
    now: () => '2026-01-01T00:00:00.000Z',
});

// Path params: reuse ids minted by real POSTs where we can, so param routes reach
// their handlers instead of 404ing. Falls back to a well-formed synthetic id.
// Keyed by COLLECTION (the /api/<collection>/ segment), not by param name: a POST
// to /api/edge-caches/ mints the id that /api/edge-caches/{cache_id} needs, and
// the param's spelling varies per tag (cache_id, db_id, engine_id...). Falls back
// to the most recent id minted anywhere, then to a well-formed synthetic one.
const SYNTHETIC = '11111111-1111-4111-8111-111111111111';
const idPool = new Map();
let lastId = null;
const collectionOf = (path) => path.split('/')[2] ?? '';
function fillPath(path) {
    const id = idPool.get(collectionOf(path)) ?? lastId ?? SYNTHETIC;
    return path.replace(/\{[^}]+\}/g, id);
}
function harvest(path, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return;
    const id = body.id ?? body.data?.id;
    if (typeof id !== 'string') return;
    idPool.set(collectionOf(path), id);
    lastId = id;
}

const zodFor = (ref) => Z['z' + ref.split('/').pop()];
const buckets = { CONFORMS: [], VIOLATES: [], UNREACHABLE: [], NO_SCHEMA: [] };

// POSTs first so creates populate the id pool before param routes are probed.
const entries = [];
for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) continue;
        entries.push({ path, method, op });
    }
}
entries.sort((a, b) => (a.method === 'post' ? -1 : 1) - (b.method === 'post' ? -1 : 1));

for (const { path, method, op } of entries) {
    const resp = Object.entries(op.responses ?? {}).find(([c]) => c.startsWith('2'));
    const ref = resp?.[1]?.content?.['application/json']?.schema?.$ref;
    const label = `${method.toUpperCase()} ${path}`;

    let res;
    try {
        const init = { method: method.toUpperCase() };
        if (op.requestBody) {
            const schema = op.requestBody.content?.['application/json']?.schema;
            init.headers = { 'content-type': 'application/json' };
            init.body = JSON.stringify(synth(schema));
        }
        res = await app.fetch(new Request('http://probe.local' + fillPath(path), init));
    } catch (e) {
        buckets.UNREACHABLE.push(`${label} — threw: ${e.message}`);
        continue;
    }

    const body = await res.clone().json().catch(() => null);
    if (res.ok && method === 'post') harvest(path, body);

    if (!ref) { buckets.NO_SCHEMA.push(label); continue; }
    if (!String(res.status).startsWith('2')) { buckets.UNREACHABLE.push(`${label} → ${res.status}`); continue; }

    const zod = zodFor(ref);
    if (!zod) { buckets.NO_SCHEMA.push(`${label} (no generated validator for ${ref.split('/').pop()})`); continue; }
    const parsed = zod.safeParse(body);
    if (parsed.success) buckets.CONFORMS.push(label);
    else {
        const issue = parsed.error.issues?.[0];
        buckets.VIOLATES.push(`${label} → ${ref.split('/').pop()}: ${issue?.path?.join('.') || '(root)'} ${issue?.message}`);
    }
}

const total = entries.length;
const measured = buckets.CONFORMS.length + buckets.VIOLATES.length;
console.log(`\ncompat conformance — ${total} operations\n`);
console.log(`  CONFORMS    ${String(buckets.CONFORMS.length).padStart(3)}`);
console.log(`  VIOLATES    ${String(buckets.VIOLATES.length).padStart(3)}   ← contract divergence the drift gate cannot see`);
console.log(`  UNREACHABLE ${String(buckets.UNREACHABLE.length).padStart(3)}   (needs fixtures — NOT a pass)`);
console.log(`  NO_SCHEMA   ${String(buckets.NO_SCHEMA.length).padStart(3)}   (contract documents no $ref 2xx body)`);
console.log(`\n  measured: ${measured}/${total} (${((measured / total) * 100).toFixed(0)}%)`);

if (buckets.VIOLATES.length) {
    console.log('\nVIOLATIONS:');
    for (const v of buckets.VIOLATES) console.log(`  ✗ ${v}`);
}
if (process.argv.includes('--verbose') && buckets.UNREACHABLE.length) {
    console.log('\nUNREACHABLE:');
    for (const u of buckets.UNREACHABLE) console.log(`  · ${u}`);
}

// Reporting mode by default: this measures a known-bad baseline. `--gate` is what
// CI will run once Gate 1 has burned the violations down to zero.
if (process.argv.includes('--gate') && buckets.VIOLATES.length > 0) process.exit(1);
