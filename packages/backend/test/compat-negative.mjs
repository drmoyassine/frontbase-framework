/**
 * CF-22 Gate 1c(3) — contract-derived negative/fuzz sweep.
 *
 * Every operation is inspected. Whenever generated Zod can distinguish an
 * invalid path, query, or JSON body, the real app must reject that request at
 * the boundary. Operations without a falsifiable input contract are recorded
 * as intentionally non-applicable rather than silently skipped.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import * as Z from '../dist/compat/zod.gen.js';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'openapi.community.json'), 'utf8'));
const deref = (node) => node?.$ref
    ? deref(spec.components.schemas[node.$ref.split('/').pop()])
    : node;
const pascalCase = (value) => value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

function synth(schema, depth = 0) {
    const s = deref(schema);
    if (!s || depth > 6) return {};
    if (s.default !== undefined) return s.default;
    if (s.enum) return s.enum[0];
    if (s.const !== undefined) return s.const;
    if (s.allOf) return Object.assign({}, ...s.allOf.map((branch) => synth(branch, depth + 1)));
    if (s.anyOf || s.oneOf) {
        const branch = (s.anyOf ?? s.oneOf).find((item) => deref(item)?.type !== 'null');
        return branch ? synth(branch, depth + 1) : null;
    }
    if (s.type === 'string') {
        let value = s.format === 'date-time' ? '2026-01-01T00:00:00Z'
            : s.format === 'email' ? 'probe@example.com'
                : s.format === 'uuid' ? '11111111-1111-4111-8111-111111111111'
                    : s.format === 'uri' || s.format === 'url' ? 'https://probe.example'
                        : 'probe';
        if (s.pattern === '^[a-zA-Z0-9_-]+$') value = 'probe';
        return value.padEnd(s.minLength ?? 0, 'x').slice(0, s.maxLength ?? undefined);
    }
    if (s.type === 'integer' || s.type === 'number') return s.minimum ?? 1;
    if (s.type === 'boolean') return false;
    if (s.type === 'array') {
        return Array.from({ length: s.minItems ?? 0 }, () => synth(s.items ?? {}, depth + 1));
    }
    if (s.type === 'object') {
        const value = {};
        for (const key of s.required ?? []) value[key] = synth(s.properties?.[key] ?? {}, depth + 1);
        return value;
    }
    return {};
}

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({
        user: { id: 'negative-owner', email: 'negative@example.com', role: 'master_admin' },
        tenant: '_default',
    }),
    now: () => '2026-01-01T00:00:00.000Z',
    sessionSecret: 'negative-sweep-secret-not-for-prod',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    includeProductRoot: true,
});

const invalidScalars = ['__definitely_invalid__', 'not-a-number', '-1', '1.5', 'not-a-uuid', 'not-an-email'];
const invalidBodies = [null, [], {}, '', 0, false, '__definitely_invalid__', { unexpected: true }];
const acceptedErrorStatuses = new Set([400, 422]);
const results = [];
const failures = [];

function requestValidator(operation, suffix) {
    return Z[`z${pascalCase(operation.operationId)}${suffix}`];
}

function parameterObject(operation, location) {
    const value = {};
    for (const parameter of operation.parameters ?? []) {
        if (parameter.in === location) value[parameter.name] = synth(parameter.schema);
    }
    return value;
}

function invalidParameterCase(operation, location) {
    const validator = requestValidator(operation, location === 'path' ? 'Path' : 'Query');
    if (!validator) return null;
    const base = parameterObject(operation, location);
    for (const parameter of (operation.parameters ?? []).filter((item) => item.in === location)) {
        if (location === 'query' && parameter.required) {
            const omitted = { ...base };
            delete omitted[parameter.name];
            if (!validator.safeParse(omitted).success) {
                return { values: omitted, name: parameter.name, kind: 'missing-required' };
            }
        }
        for (const candidate of invalidScalars) {
            const values = { ...base, [parameter.name]: candidate };
            if (!validator.safeParse(values).success) {
                return { values, name: parameter.name, kind: 'invalid-value' };
            }
        }
    }
    return null;
}

function invalidBodyCase(operation) {
    if (!operation.requestBody?.content?.['application/json']?.schema) return undefined;
    const validator = requestValidator(operation, 'Body');
    if (!validator) return null;
    return invalidBodies.find((candidate) => !validator.safeParse(candidate).success);
}

function invalidMultipartCase(operation) {
    if (!operation.requestBody?.content?.['multipart/form-data']?.schema) return false;
    const validator = requestValidator(operation, 'Body');
    return Boolean(validator && !validator.safeParse({}).success);
}

function pathFor(template, values) {
    return template.replace(/\{([^}]+)\}/g, (_, name) =>
        encodeURIComponent(String(values[name] ?? '11111111-1111-4111-8111-111111111111')));
}

async function execute(entry, mutation) {
    const validPath = parameterObject(entry.operation, 'path');
    const validQuery = parameterObject(entry.operation, 'query');
    const pathValues = mutation.location === 'path' ? mutation.values : validPath;
    const queryValues = mutation.location === 'query' ? mutation.values : validQuery;
    const url = new URL(`http://negative.local${pathFor(entry.path, pathValues)}`);
    for (const [name, value] of Object.entries(queryValues)) {
        if (Array.isArray(value)) {
            for (const item of value) url.searchParams.append(name, String(item));
        } else {
            url.searchParams.set(name, String(value));
        }
    }
    const init = { method: entry.method.toUpperCase() };
    const multipartSchema = entry.operation.requestBody?.content?.['multipart/form-data']?.schema;
    if (multipartSchema) {
        const form = new FormData();
        if (mutation.location !== 'multipart') {
            for (const [name, value] of Object.entries(synth(multipartSchema))) {
                if (name === 'file') {
                    form.set(name, new Blob(['probe'], { type: 'text/plain' }), 'probe.txt');
                } else {
                    form.set(name, String(value));
                }
            }
        }
        init.body = form;
    } else if (entry.operation.requestBody) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(
            mutation.location === 'body'
                ? mutation.value
                : synth(entry.operation.requestBody.content?.['application/json']?.schema),
        );
    }
    return app.fetch(new Request(url, init));
}

for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) continue;
        const entry = { path, method, operation };
        const cases = [];
        const pathCase = invalidParameterCase(operation, 'path');
        const queryCase = invalidParameterCase(operation, 'query');
        const bodyCase = invalidBodyCase(operation);
        const multipartCase = invalidMultipartCase(operation);
        if (pathCase) cases.push({ location: 'path', ...pathCase });
        if (queryCase) cases.push({ location: 'query', ...queryCase });
        if (bodyCase !== undefined && bodyCase !== null) cases.push({ location: 'body', value: bodyCase });
        if (bodyCase === null && invalidBodies.some((candidate) =>
            requestValidator(operation, 'Body')?.safeParse(candidate).success === false)) {
            cases.push({ location: 'body', value: null });
        }
        if (multipartCase) cases.push({ location: 'multipart' });

        const label = `${method.toUpperCase()} ${path}`;
        if (cases.length === 0) {
            results.push({ label, status: 'NOT_APPLICABLE', reason: 'no falsifiable typed input' });
            continue;
        }
        for (const mutation of cases) {
            const response = await execute(entry, mutation);
            if (!acceptedErrorStatuses.has(response.status)) {
                failures.push(`${label} (${mutation.location}) returned ${response.status}`);
            }
        }
        results.push({ label, status: 'REJECTS_INVALID', cases: cases.length });
    }
}

const exercised = results.filter((item) => item.status === 'REJECTS_INVALID');
const notApplicable = results.filter((item) => item.status === 'NOT_APPLICABLE');
const caseCount = exercised.reduce((sum, item) => sum + item.cases, 0);
if (results.length !== 286) failures.push(`operation ledger has ${results.length}, expected 286`);
if (failures.length) {
    console.error(`compat-negative: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(
    `compat-negative: PASS — ${results.length}/286 audited, `
    + `${exercised.length} operations rejected ${caseCount} generated invalid cases, `
    + `${notApplicable.length} had no falsifiable typed input`,
);
