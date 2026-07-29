#!/usr/bin/env node
/**
 * CF-22 Work A3 — generate the differential parity corpus.
 *
 * The corpus is DERIVED from the vendored contract, never hand-maintained: a
 * hand-written list of 334 operations is exactly the artifact Gate 1b deleted, and it
 * would silently stop covering the surface the first time the contract widened.
 *
 * For every operation it emits two cases:
 *   success — a request the operation should accept (synthesised body, seeded params)
 *   failure — a request it should reject (a well-formed id that does not exist)
 *
 * Both are replayed against the product and the framework by
 * test/differential-parity.mjs, which diffs status + normalised body. The generator
 * asserts nothing about behaviour; it only guarantees COVERAGE. Any behavioural
 * difference is the runner's finding, not the generator's.
 *
 *   node scripts/generate-differential-corpus.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve('packages/backend');
const spec = JSON.parse(readFileSync(resolve(ROOT, 'contracts/openapi.community.json'), 'utf8'));
const OUT = resolve(ROOT, 'test/fixtures/cf22-differential-corpus.json');
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options'];

const deref = (node) => node?.$ref
    ? deref(spec.components.schemas[node.$ref.split('/').pop()])
    : node;

/** Smallest body that satisfies a schema's required fields. */
function synth(schema, depth = 0) {
    const s = deref(schema);
    if (!s || depth > 4) return {};
    if (s.default !== undefined) return s.default;
    if (s.enum) return s.enum[0];
    if (s.const !== undefined) return s.const;
    if (s.anyOf || s.oneOf) {
        const branch = (s.anyOf ?? s.oneOf).find((b) => deref(b)?.type !== 'null');
        return branch ? synth(branch, depth + 1) : null;
    }
    switch (s.type) {
        case 'string': {
            // A declared alternation IS the enum, spelled differently. The product
            // rejects `type: "parity"` against `^(variable|calculated)$`, and a
            // generator that ignores `pattern` produces a body no system can accept —
            // which then reads as a parity difference instead of a synthesis miss.
            const alternation = /^\^\(([^)]+)\)\$$/.exec(s.pattern ?? '');
            if (alternation) return alternation[1].split('|')[0];
            const value = s.format === 'date-time' ? '2026-01-01T00:00:00Z'
                : s.format === 'email' ? 'parity@example.com'
                    : s.format === 'uuid' ? '11111111-1111-4111-8111-111111111111'
                        : s.format === 'uri' || s.format === 'url' ? 'https://parity.example'
                            : 'parity';
            return value.length >= (s.minLength ?? 0) ? value : value.padEnd(s.minLength, 'x');
        }
        case 'integer': case 'number': return s.minimum ?? 1;
        case 'boolean': return false;
        case 'array': return Array.from({ length: s.minItems ?? 0 }, () => synth(s.items ?? {}, depth + 1));
        case 'object': {
            const out = {};
            for (const key of s.required ?? []) out[key] = synth(s.properties?.[key] ?? {}, depth + 1);
            return out;
        }
        default: return {};
    }
}

/**
 * Seed operations: a collection POST whose response id later cases interpolate.
 * Keyed by the path prefix its children share, so `/api/pages/{page_id}/` reuses the
 * page created by `POST /api/pages/`.
 */
const SEEDS = [
    { prefix: '/api/pages/', path: '/api/pages/', variable: 'page_id' },
    { prefix: '/api/actions/drafts', path: '/api/actions/drafts', variable: 'draft_id' },
    { prefix: '/api/variables/', path: '/api/variables/', variable: 'variable_id' },
    { prefix: '/api/themes/', path: '/api/themes/', variable: 'theme_id' },
    { prefix: '/api/auth-forms/', path: '/api/auth-forms/', variable: 'form_id' },
    { prefix: '/api/edge-engines/', path: '/api/edge-engines/', variable: 'engine_id' },
    { prefix: '/api/edge-providers/', path: '/api/edge-providers/', variable: 'provider_id' },
    { prefix: '/api/edge-databases/', path: '/api/edge-databases/', variable: 'db_id' },
    { prefix: '/api/edge-caches/', path: '/api/edge-caches/', variable: 'cache_id' },
    { prefix: '/api/edge-queues/', path: '/api/edge-queues/', variable: 'queue_id' },
    { prefix: '/api/edge-vectors/', path: '/api/edge-vectors/', variable: 'vector_id' },
    { prefix: '/api/sync/datasources/', path: '/api/sync/datasources/', variable: 'datasource_id' },
];

/** A syntactically valid identifier that will never exist — drives the failure case. */
const ABSENT = '00000000-0000-4000-8000-000000000000';

/**
 * A value that violates a declared type without being unparseable JSON.
 *
 * Type violation rather than a bad format: every validator on both sides enforces
 * types, while `format` support varies (pydantic checks `email`, Zod may not), so a
 * format violation would measure the validators' disagreement instead of the
 * operation's.
 */
const INVALID_FOR_TYPE = {
    string: [],
    integer: 'not-a-number',
    number: 'not-a-number',
    boolean: 'maybe',
    array: 'not-an-array',
    object: 'not-an-object',
};

/** The first required property whose declared type can actually be violated. */
function falsifiableField(schema) {
    const s = deref(schema);
    if (!s || s.type !== 'object' || !s.required?.length) return null;
    for (const key of s.required) {
        const property = deref(s.properties?.[key]);
        if (!property) continue;
        if (property.enum) return { key, value: '__invalid_enum_value__' };
        if (property.type in INVALID_FOR_TYPE) {
            return { key, value: INVALID_FOR_TYPE[property.type] };
        }
    }
    return null;
}

/** The first required query parameter whose declared type can be violated. */
function falsifiableQuery(op) {
    for (const parameter of op.parameters ?? []) {
        const p = deref(parameter);
        if (p.in !== 'query' || !p.required) continue;
        const schema = deref(p.schema);
        if (schema?.enum) return { key: p.name, value: '__invalid_enum_value__' };
        if (schema?.type === 'integer' || schema?.type === 'number') {
            return { key: p.name, value: 'not-a-number' };
        }
    }
    return null;
}

function seedFor(path) {
    return SEEDS.find((seed) => path.startsWith(seed.prefix) && path !== seed.path);
}

function fillParams(path, { absent }) {
    const seed = seedFor(path);
    return path.replace(/\{([^}]+)\}/g, (_, name) => {
        if (absent) return ABSENT;
        // Reuse the seeded resource for the FIRST param; nested params (a version of a
        // page, a policy on a table) have no generic seed, so they fall back to a
        // literal both targets see identically.
        if (seed && name === seed.variable) return `{{${seed.variable}}}`;
        if (name.endsWith('_name') || name === 'table' || name === 'column') return 'parity_table';
        return ABSENT;
    });
}

const cases = [];
/** Operations with no input a validator can reject — recorded, never fabricated. */
const nonFalsifiable = [];

/**
 * Give a seed body values nothing else will collide with.
 *
 * A re-seed reuses the same create, and the product enforces uniqueness on slug
 * (`A page with this slug already exists`), so a fixed "parity" would succeed once
 * and 400 forever after. `{{seq}}` is substituted by the runner with a counter that
 * is allocated ONCE per seeding and used for both targets, so the two requests stay
 * byte-identical while every seeding is distinct.
 */
function uniqueSeedBody(body) {
    if (!body || typeof body !== 'object') return body;
    const out = { ...body };
    for (const [key, value] of Object.entries(out)) {
        // Uniqueness is enforced on identity AND on endpoint URLs — the product answers
        // "A cache with this URL already exists ('parity')" — so both have to vary.
        if (typeof value !== 'string') continue;
        if (!/^(name|slug|title)$/.test(key) && !/(^|_)url$/.test(key)) continue;
        out[key] = `${value}-{{seq}}`;
    }
    return out;
}

/**
 * Setup recipes, keyed by the variable they bind. These are NOT comparison cases —
 * the runner replays one before every case that needs it, and discards the response.
 *
 * This is what makes a case independent of everything that ran before it. Previously
 * one create ran up front and 112 cases shared the resource, so any destructive case
 * in between removed it; the read that followed then diverged for reasons that had
 * nothing to do with the read. Measured, not theorised: GET /api/edge-engines/{id}
 * was product 200 / framework 404 in the full corpus and 200 on both in isolation.
 */
const seedRecipes = {};
for (const seed of SEEDS) {
    const post = spec.paths[seed.path]?.post;
    if (!post) continue;
    seedRecipes[seed.variable] = {
        operationId: post.operationId,
        method: 'POST',
        path: seed.path,
        headers: { 'content-type': 'application/json' },
        body: uniqueSeedBody(synth(post.requestBody?.content?.['application/json']?.schema)),
        // Tried in order. The two systems do not agree on the create envelope — one
        // answers `{id}`, the other `{data:{id}}` — and a single pointer silently
        // fails to bind on whichever shape it does not match. The unbound variable
        // then travels into the path as the literal `{{engine_id}}`, and the 404 that
        // follows looks like a missing route instead of a harness miss.
        capture: ['/id', '/data/id'],
    };
}

for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
        const op = item[method];
        if (!op) continue;
        const jsonSchema = op.requestBody?.content?.['application/json']?.schema;
        const body = jsonSchema ? synth(jsonSchema) : undefined;
        const headers = body === undefined ? undefined : { 'content-type': 'application/json' };

        const successPath = fillParams(path, { absent: false });
        // Logging out is a legitimate operation to compare, but it takes the session
        // with it and every authed case after it would answer 401 — 476 of them, on
        // whichever system actually honours the logout. Flag it so the runner can
        // re-establish the session afterwards.
        const invalidatesSession = path.startsWith('/api/auth/logout');
        // Whatever this case interpolates, it gets freshly created first.
        const requires = [...new Set(
            [...successPath.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]),
        )].filter((name) => name in seedRecipes);
        cases.push({
            operationId: op.operationId,
            kind: 'success',
            method: method.toUpperCase(),
            path: successPath,
            ...(headers ? { headers } : {}),
            ...(body === undefined ? {} : { body }),
            ...(requires.length ? { requires } : {}),
            ...(invalidatesSession ? { invalidatesSession } : {}),
        });

        // Failure: make THIS operation reject THIS request.
        //
        // The rejection must come from the operation itself. Appending a segment to a
        // parameterless path does not do that — it addresses a route the operation does
        // not own, so both systems answer from their 404 handler and the case measures
        // their catch-alls instead. Strategies, in order of preference:
        //   absent-path-id — a well-formed id the store cannot contain
        //   invalid-body   — a required property sent with the wrong declared type
        //   invalid-query  — a required query parameter with the wrong declared type
        // When none applies the operation is not falsifiable by input, and that is
        // recorded rather than faked.
        const invalidField = jsonSchema ? falsifiableField(jsonSchema) : null;
        const invalidParam = falsifiableQuery(op);
        if (path.includes('{')) {
            cases.push({
                operationId: op.operationId,
                kind: 'failure',
                strategy: 'absent-path-id',
                method: method.toUpperCase(),
                path: fillParams(path, { absent: true }),
                ...(headers ? { headers } : {}),
                ...(body === undefined ? {} : { body }),
            });
        } else if (invalidField) {
            cases.push({
                operationId: op.operationId,
                kind: 'failure',
                strategy: 'invalid-body',
                method: method.toUpperCase(),
                path,
                headers: { 'content-type': 'application/json' },
                body: { ...body, [invalidField.key]: invalidField.value },
                note: `required "${invalidField.key}" sent with the wrong declared type`,
            });
        } else if (invalidParam) {
            cases.push({
                operationId: op.operationId,
                kind: 'failure',
                strategy: 'invalid-query',
                method: method.toUpperCase(),
                path: `${path}?${invalidParam.key}=${encodeURIComponent(invalidParam.value)}`,
                ...(headers ? { headers } : {}),
                ...(body === undefined ? {} : { body }),
                note: `required query "${invalidParam.key}" sent with the wrong declared type`,
            });
        } else {
            nonFalsifiable.push({
                operationId: op.operationId,
                method: method.toUpperCase(),
                path,
                reason: jsonSchema
                    ? 'no path parameter, and every required body property is an unconstrained string or open object'
                    : 'no path parameter, no request body, and no constrained required query parameter',
            });
        }
    }
}

const corpus = {
    generatedBy: 'scripts/generate-differential-corpus.mjs',
    contract: 'packages/backend/contracts/openapi.community.json',
    // Only fields that MAY legitimately differ between two independent systems. Keep
    // this list small and justified: every entry is a comparison you are choosing not
    // to make, so an over-broad rule silently turns the harness into a no-op.
    // Field rules strip a key wherever it appears, because these values are nested
    // inside collections (drafts[].id) that a fixed pointer cannot reach. Nine rules,
    // all of them "two independent systems cannot agree on this by construction":
    // generated identifiers and wall-clock times. Nothing behavioural is normalised.
    normalization: [
        { field: 'id', reason: 'each system mints its own identifiers, at any nesting depth' },
        { field: 'created_at', reason: 'wall-clock at row creation' },
        { field: 'updated_at', reason: 'wall-clock at row update' },
        { field: 'createdAt', reason: 'camelCase variant of created_at' },
        { field: 'updatedAt', reason: 'camelCase variant of updated_at' },
        { field: 'timestamp_utc', reason: 'response generation time' },
        { field: 'last_tested_at', reason: 'wall-clock of the last connectivity probe' },
        { field: 'expires_at', reason: 'derived from generation time' },
        { field: 'contentHash', reason: 'derived from generated ids embedded in the payload' },
    ],
    seeds: seedRecipes,
    nonFalsifiable,
    cases,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(corpus, null, 2) + '\n');

const ops = new Set(cases.map((c) => c.operationId));
const byStrategy = new Map();
for (const testCase of cases) {
    if (testCase.kind !== 'failure') continue;
    byStrategy.set(testCase.strategy, (byStrategy.get(testCase.strategy) ?? 0) + 1);
}
console.log(`corpus written: ${cases.length} cases across ${ops.size} operations → ${OUT}`);
console.log(`  failure strategies: ${[...byStrategy].map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`  non-falsifiable by input: ${nonFalsifiable.length} (recorded with a reason, not fabricated)`);
console.log(`  seed recipes: ${Object.keys(seedRecipes).length}; cases re-seeded before they run: `
    + `${cases.filter((testCase) => testCase.requires).length}`);
