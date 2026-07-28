/**
 * CF-22 differential parity runner.
 *
 * This runner deliberately requires two live targets and an explicit, reviewed
 * corpus. It cannot turn a framework-only smoke probe into a parity PASS.
 *
 * Usage:
 *   node test/differential-parity.mjs \
 *     --product http://127.0.0.1:8001 \
 *     --framework http://127.0.0.1:8788 \
 *     --corpus test/fixtures/cf22-differential-corpus.json
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

function option(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

const productBase = option('--product') ?? process.env.CF22_PRODUCT_BASE_URL;
const frameworkBase = option('--framework') ?? process.env.CF22_FRAMEWORK_BASE_URL;
const corpusPath = option('--corpus') ?? process.env.CF22_DIFFERENTIAL_CORPUS;

if (!productBase || !frameworkBase || !corpusPath) {
    console.error(
        'CF-22 differential parity requires --product, --framework, and --corpus. '
        + 'No comparison was run.',
    );
    process.exit(2);
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const spec = JSON.parse(readFileSync(
    new URL('../contracts/openapi.community.json', import.meta.url),
    'utf8',
));

const operations = new Set();
for (const methods of Object.values(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'options'].includes(method)) {
            operations.add(operation.operationId);
        }
    }
}

assert.ok(Array.isArray(corpus.cases), 'corpus.cases must be an array');
assert.ok(Array.isArray(corpus.normalization), 'corpus.normalization must be an array');
for (const rule of corpus.normalization) {
    // A rule is either an exact JSON pointer or a field name stripped at ANY depth.
    // Field rules exist because volatile values are nested inside collections
    // (drafts[].id, data.items[].created_at) and a pointer cannot express "wherever
    // this appears". Both forms demand a written reason: each rule is a comparison
    // deliberately NOT made, and an over-broad list quietly turns this into a no-op.
    const hasPointer = typeof rule.pointer === 'string';
    const hasField = typeof rule.field === 'string';
    assert.ok(hasPointer || hasField, 'normalization rule needs a pointer or a field');
    if (hasPointer) assert.ok(rule.pointer.startsWith('/'), 'pointers must be explicit JSON pointers');
    if (hasField) assert.ok(/^[A-Za-z_][\w]*$/.test(rule.field), 'field must be a plain key name');
    assert.equal(typeof rule.reason, 'string', 'normalization rule needs a reviewable reason');
    assert.ok(rule.reason.trim(), 'normalization reason may not be empty');
}

const coverage = new Map();
for (const testCase of corpus.cases) {
    assert.ok(operations.has(testCase.operationId), `unknown operationId: ${testCase.operationId}`);
    assert.ok(testCase.kind === 'success' || testCase.kind === 'failure');
    const kinds = coverage.get(testCase.operationId) ?? new Set();
    kinds.add(testCase.kind);
    coverage.set(testCase.operationId, kinds);
}
for (const operationId of operations) {
    const kinds = coverage.get(operationId);
    assert.ok(kinds?.has('success'), `missing success case: ${operationId}`);
    assert.ok(kinds?.has('failure'), `missing failure case: ${operationId}`);
}

function removePointer(value, pointer) {
    const parts = pointer.slice(1).split('/').map((part) =>
        part.replaceAll('~1', '/').replaceAll('~0', '~'));
    let current = value;
    for (let index = 0; index < parts.length - 1; index++) {
        if (current === null || typeof current !== 'object') return;
        current = current[parts[index]];
    }
    if (current !== null && typeof current === 'object') {
        delete current[parts.at(-1)];
    }
}

function removeField(node, field) {
    if (Array.isArray(node)) {
        for (const item of node) removeField(item, field);
    } else if (node !== null && typeof node === 'object') {
        delete node[field];
        for (const value of Object.values(node)) removeField(value, field);
    }
}

function normalized(value) {
    const copy = structuredClone(value);
    for (const rule of corpus.normalization) {
        if (typeof rule.pointer === 'string') removePointer(copy, rule.pointer);
        if (typeof rule.field === 'string') removeField(copy, rule.field);
    }
    return copy;
}

/**
 * Per-target variable store.
 *
 * The two systems mint their own identifiers, so `/api/pages/{id}/` cannot use one
 * literal for both. A case may `capture` a value out of its own response into a named
 * variable; later cases interpolate `{{name}}`. Each target keeps its OWN bindings, so
 * both sides address the resource THEY created — the only way to compare a stateful
 * API whose ids are not shared.
 */
function readPointer(value, pointer) {
    const parts = pointer.slice(1).split('/').map((part) =>
        part.replaceAll('~1', '/').replaceAll('~0', '~'));
    let current = value;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

function interpolate(value, vars) {
    if (typeof value === 'string') {
        return value.replace(/\{\{(\w+)\}\}/g, (whole, name) =>
            (name in vars ? String(vars[name]) : whole));
    }
    if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, vars)]));
    }
    return value;
}

/** Per-target cookie jar: sessions are HttpOnly cookies, so each system needs its own. */
const jars = new Map();
function jarFor(base) {
    if (!jars.has(base)) jars.set(base, new Map());
    return jars.get(base);
}
function cookieHeader(base) {
    const jar = jarFor(base);
    return jar.size ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : undefined;
}
function storeCookies(base, response) {
    const jar = jarFor(base);
    for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const index = pair.indexOf('=');
        if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
}

/**
 * Authenticate against a target before replaying the corpus.
 *
 * Auth is infrastructure, not a comparison case: both systems must be logged in or
 * every case merely proves they agree on 401. Credentials come from the CLI because
 * the two deployments are seeded independently.
 */
async function authenticate(base, email, password) {
    const response = await fetch(new URL('/api/auth/login', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    storeCookies(base, response);
    if (!response.ok) {
        throw new Error(`login failed against ${base}: ${response.status}. `
            + 'Differential parity cannot run unauthenticated.');
    }
}

async function snapshot(base, testCase, vars) {
    const path = interpolate(testCase.path, vars);
    const payload = testCase.body === undefined ? undefined : interpolate(testCase.body, vars);
    const cookie = cookieHeader(base);
    // Bounded per request: the surface includes SSE streams that never close, and an
    // unbounded fetch would hang the whole comparison on the first one. A timeout is
    // itself a comparable outcome — if one system streams and the other does not,
    // that IS a parity difference and must be reported, not hidden.
    let response;
    try {
        response = await fetch(new URL(path, base), {
            method: testCase.method,
            headers: { ...(testCase.headers ?? {}), ...(cookie ? { cookie } : {}) },
            body: payload === undefined ? undefined : JSON.stringify(payload),
            signal: AbortSignal.timeout(Number(process.env.CF22_CASE_TIMEOUT_MS ?? 20000)),
        });
    } catch (error) {
        return { status: 'timeout-or-network-error', mediaType: '', body: String(error?.name ?? error) };
    }
    storeCookies(base, response);
    const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    // Never JSON.parse blindly: a truncated or mislabelled body must surface as a
    // difference between the two systems, not abort the entire run.
    let text;
    try {
        text = await response.text();
    } catch (error) {
        return { status: response.status, mediaType, body: `<body read failed: ${error?.name}>` };
    }
    let raw = text;
    let parsed = false;
    if (mediaType === 'application/json') {
        try { raw = JSON.parse(text); parsed = true; }
        catch { raw = { __unparseable_json__: text }; }
    }
    // Capture BEFORE normalisation: ids are normalised away for comparison, but they
    // are exactly what later cases need in order to address the resource.
    for (const [name, pointer] of Object.entries(testCase.capture ?? {})) {
        const captured = raw && typeof raw === 'object' ? readPointer(raw, pointer) : undefined;
        if (captured !== undefined) vars[name] = captured;
    }
    return {
        status: response.status,
        mediaType,
        body: parsed ? normalized(raw) : raw,
    };
}

const adminEmail = option('--admin-email') ?? process.env.CF22_ADMIN_EMAIL;
const adminPassword = option('--admin-password') ?? process.env.CF22_ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) {
    console.error('CF-22 differential parity requires --admin-email and --admin-password.');
    process.exit(2);
}
await authenticate(productBase, adminEmail, adminPassword);
await authenticate(frameworkBase, adminEmail, adminPassword);

let compared = 0;
const productVars = {};
const frameworkVars = {};
for (const testCase of corpus.cases) {
    const [product, framework] = await Promise.all([
        snapshot(productBase, testCase, productVars),
        snapshot(frameworkBase, testCase, frameworkVars),
    ]);
    assert.deepEqual(
        framework,
        product,
        `${testCase.operationId} (${testCase.kind}) differs`,
    );
    compared++;
}

console.log(
    `CF-22 differential parity: PASS — ${compared} real product/framework cases, `
    + `${operations.size}/${operations.size} operations with success + failure coverage`,
);
