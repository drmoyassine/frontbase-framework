/**
 * P1-B isolated behavior evidence candidate — Wave 1 packet (worker P1-B).
 *
 * MEASUREMENT-INTEGRITY CANDIDATE for primary review. This is NOT a passing
 * behavior gate. It does not import, call, or modify the existing conformance
 * probe, its classifier, or any behavior/conformance ledger. The behavior
 * ledger is only hashed (before/after) to prove it stays byte-identical.
 *
 * Design (per docs/plans/wordpress-pilot-two-session-waves.md P1-B and
 * docs/history/PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md sections 1-3):
 *   1. Fresh per-operation state: every measured operation runs in its own
 *      migrated in-memory SQLite runner, app instance, memory storage,
 *      reset-token map, and tracing context, constructed immediately before
 *      fixture preparation and disposed afterward. One invented owner
 *      principal per context (owner A); a dedicated cross-owner assertion
 *      exercises owner B against the same app.
 *   2. Nonempty positive fixtures for the observed cases from the repair
 *      plan's table (storage compute/list/delete-provider, queue list,
 *      vector list, agent settings, primary auth form, project asset
 *      upload, datasource search) with operation-specific success
 *      predicates that target the seeded data, not envelope shape.
 *   3. Meaningful refusal cases (edge database role password reset without
 *      resolvable credentials; vector connection test without a configured
 *      transport) classified refusal/incomplete ONLY when their documented
 *      expected evidence matches specifically — expected HTTP code, the
 *      specific expected error/denial marker, and the expected transport
 *      behavior (attempts/denials counted). An unrelated 404/500 is
 *      classified unexpected-response and fails refusal-evidence detection
 *      (proven by the refusal-wrong-route / refusal-server-error degraded
 *      substitution modes). Predicates assert documented expected semantics
 *      (route source + isolation observation), never frozen observations.
 *      A throwing offline guard replaces BOTH the injected transport and
 *      global fetch, so nothing contacts a network; any raw/global fallback
 *      attempt is recorded as an integrity failure.
 *   4. Order invariance: forward, reverse, and two fixed-seed shuffles
 *      (mulberry32 seeds 1 and 2) must produce identical per-operation
 *      semantic outcomes.
 *   5. Counterfactuals: for five read candidates, remove ONLY the seeded
 *      target row (supporting auth/owner/config rows stay) and require the
 *      operation-specific success predicate to flip.
 *   6. Negative self-tests live in parallel-wave1-behavior-candidate-negative.mjs
 *      and invoke this module's exported runCandidate() in degraded modes.
 *
 * DIST HANDLING: this candidate exercises compiled handlers. Before running
 * it verifies dist exists, samples dist mtimes for concurrent-build
 * instability, hashes every compiled entry it consumes, and reports whether
 * any src file is newer than the consumed dist. All results from a run that
 * primary did not gate behind its exclusive build lock are PRELIMINARY.
 *
 * Run (report the exact command and Node version):
 *   pnpm --filter @frontbase/backend exec node test/parallel-wave1-behavior-candidate.mjs
 *
 * Evidence JSON goes to an OS temp directory whose path this command prints.
 * The only repository artifacts are the P1-B owned files.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCompatApp } from '../dist/compat/app.js';
import { datasourceRunner } from '../dist/db/datasource-runner.js';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { hashPassword, memoryStorageProvider, sqliteRunner } from '@frontbase/edge-infra';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const repoRoot = join(backendRoot, '..', '..');
const LEDGER_PATH = join(backendRoot, 'contracts', 'behavior.ledger.json');
const PROBE_SOURCE_PATH = join(here, 'compat-conformance.mjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSha256 = (path) => sha256(readFileSync(path));

/** Compiled entries this candidate consumes or whose handlers it exercises. */
const COMPILED_ENTRIES = {
    'dist/compat/app.js': join(backendRoot, 'dist/compat/app.js'),
    'dist/compat/routes/storage.js': join(backendRoot, 'dist/compat/routes/storage.js'),
    'dist/compat/routes/edge-generic.js': join(backendRoot, 'dist/compat/routes/edge-generic.js'),
    'dist/compat/routes/auth-forms.js': join(backendRoot, 'dist/compat/routes/auth-forms.js'),
    'dist/compat/routes/agent-compat.js': join(backendRoot, 'dist/compat/routes/agent-compat.js'),
    'dist/compat/routes/project.js': join(backendRoot, 'dist/compat/routes/project.js'),
    'dist/compat/routes/sync.js': join(backendRoot, 'dist/compat/routes/sync.js'),
    'dist/compat/routes/edge-databases.js': join(backendRoot, 'dist/compat/routes/edge-databases.js'),
    'dist/db/migrations.js': join(backendRoot, 'dist/db/migrations.js'),
    'dist/db/users.js': join(backendRoot, 'dist/db/users.js'),
    'dist/db/datasource-runner.js': join(backendRoot, 'dist/db/datasource-runner.js'),
    '@frontbase/edge-infra dist/index.js': join(repoRoot, 'packages/edge-infra/dist/index.js'),
};
/** src counterparts checked for newer-than-dist staleness (best effort per entry). */
const SRC_COUNTERPARTS = {
    'dist/compat/app.js': join(backendRoot, 'src/compat/app.ts'),
    'dist/compat/routes/storage.js': join(backendRoot, 'src/compat/routes/storage.ts'),
    'dist/compat/routes/edge-generic.js': join(backendRoot, 'src/compat/routes/edge-generic.ts'),
    'dist/compat/routes/auth-forms.js': join(backendRoot, 'src/compat/routes/auth-forms.ts'),
    'dist/compat/routes/agent-compat.js': join(backendRoot, 'src/compat/routes/agent-compat.ts'),
    'dist/compat/routes/project.js': join(backendRoot, 'src/compat/routes/project.ts'),
    'dist/compat/routes/sync.js': join(backendRoot, 'src/compat/routes/sync.ts'),
    'dist/compat/routes/edge-databases.js': join(backendRoot, 'src/compat/routes/edge-databases.ts'),
    'dist/db/migrations.js': join(backendRoot, 'src/db/migrations.ts'),
    'dist/db/users.js': join(backendRoot, 'src/db/users.ts'),
    'dist/db/datasource-runner.js': join(backendRoot, 'src/db/datasource-runner.ts'),
    '@frontbase/edge-infra dist/index.js': join(repoRoot, 'packages/edge-infra/src/index.ts'),
};

// ---- offline transport guards ------------------------------------------------
// Injected transport: every compat provider call is recorded and DENIED. No
// scripted success envelopes exist in this candidate: a "successful" provider
// check cannot be faked by transport scripting.
const injectedTransportAttempts = [];
const denyingExternalFetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    injectedTransportAttempts.push({ url, method });
    throw new Error(`P1B offline guard: injected transport denies all external calls (${method} ${url})`);
};
// Global fallback guard: installed at module load so raw/global SDK fallbacks
// can never reach a network in this process. Any attempt is an integrity
// failure to RECORD — never a pass.
const globalTransportAttempts = [];
if (!globalThis.__p1bOfflineGuardInstalled) {
    globalThis.__p1bOfflineGuardInstalled = true;
    globalThis.fetch = async (input, init = {}) => {
        const url = input instanceof Request ? input.url : String(input);
        const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        globalTransportAttempts.push({ url, method });
        throw new Error(`P1B offline guard: unconfigured global transport attempted (${method} ${url})`);
    };
}

// ---- deterministic PRNG and volatile masking ---------------------------------
const mulberry32 = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffledOrder = (items, seed) => {
    const array = items.slice();
    const rand = mulberry32(seed);
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};
const maskVolatile = (text) => String(text)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<ts>')
    .replace(/favicon-[0-9a-f]{8}\.png/g, 'favicon-<hex>.png');

// ---- per-operation fresh context --------------------------------------------
let contextSerial = 0;
let fixtureSerial = 0;
const TEST_PASSWORD = 'P1b-candidate-password-1!';
const cachedPasswordHash = await hashPassword(TEST_PASSWORD);
const NOW = () => '2026-01-01T00:00:00.000Z';
const OWNERS = {
    A: { tenant: '_p1b_owner_a', user: { id: 'p1b-owner-a', email: 'p1b-owner-a@probe.invalid', role: 'master_admin' } },
    B: { tenant: '_p1b_owner_b', user: { id: 'p1b-owner-b', email: 'p1b-owner-b@probe.invalid', role: 'master_admin' } },
};
const tempFilesGlobal = new Set();
process.on('exit', () => {
    for (const path of tempFilesGlobal) {
        try { rmSync(path, { force: true }); } catch { /* already absent */ }
    }
});

async function createContext() {
    const contextId = `ctx-${++contextSerial}`;
    const state = {
        starveReads: false,
        traceEnabled: false,
        sqlTrace: [],
        ledgerOfAttempts: () => injectedTransportAttempts.length,
    };
    const baseRunner = sqliteRunner(':memory:');
    const runner = {
        async query(sql, params = []) {
            if (state.starveReads) return [];
            const rows = await baseRunner.query(sql, params);
            if (state.traceEnabled && !sql.includes('user_session_versions')) {
                state.sqlTrace.push({ kind: 'query', sql: maskVolatile(sql), rows: rows.length });
            }
            return rows;
        },
        async exec(sql, params = []) {
            const affected = await baseRunner.exec(sql, params);
            if (state.traceEnabled && !sql.includes('user_session_versions')) {
                state.sqlTrace.push({ kind: 'exec', sql: maskVolatile(sql), affected });
            }
            return affected;
        },
    };
    await migrateUp(runner);
    const passwordResetTokens = new Map();
    const storageProvider = memoryStorageProvider();
    // One invented owner principal per context (owner A is the default);
    // owner B exists only for the explicit cross-owner isolation assertion.
    for (const owner of Object.values(OWNERS)) {
        await new UserStore(runner, owner.tenant).createUser({
            email: owner.user.email,
            passwordHash: cachedPasswordHash,
            role: 'master_admin',
            now: NOW(),
            id: owner.user.id,
        });
    }
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async (request) => {
            const owner = OWNERS[request.headers.get('x-p1b-owner') ?? 'A'] ?? OWNERS.A;
            return { user: owner.user, tenant: owner.tenant };
        },
        now: NOW,
        sessionSecret: 'p1b-candidate-secret-not-for-prod',
        userStoreFor: (tenant) => new UserStore(runner, tenant),
        includeProductRoot: true,
        passwordResetDelivery: async (email, token) => {
            passwordResetTokens.set(email.toLowerCase(), token);
        },
        externalFetch: denyingExternalFetch,
        storageProvider,
    });
    const requestJson = async (method, path, body, owner = 'A') => {
        const headers = { 'x-p1b-owner': owner };
        if (body !== undefined) headers['content-type'] = 'application/json';
        const res = await app.fetch(new Request(`http://p1b.probe.invalid${path}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        }));
        const responseBody = await res.clone().json().catch(() => null);
        return { res, body: responseBody };
    };
    const createFixture = async (path, body, owner = 'A') => {
        const created = await requestJson('POST', path, body, owner);
        if (!created.res.ok) throw new Error(`fixture ${path} returned ${created.res.status}`);
        return created.body;
    };
    const fixtureId = (body) =>
        body?.id ?? body?.execution_id ?? body?.data?.id ?? body?.bucket?.id ?? body?.version?.id ?? null;
    const dispose = () => {
        // In-memory SQLite and memory storage are garbage-collected; temp
        // datasource files are removed here (and backstopped at process exit).
        for (const path of state.tempFiles ?? []) {
            try { rmSync(path, { force: true }); } catch { /* absent */ }
            tempFilesGlobal.delete(path);
        }
    };
    state.tempFiles = [];
    return { contextId, state, runner, app, requestJson, createFixture, fixtureId, dispose };
}

/** Temporary file-backed SQLite URL for datasource fixtures (cleaned per context). */
function temporaryDatabaseUrl(ctx) {
    const path = join(tmpdir(), `frontbase-p1b-${randomUUID()}.db`);
    ctx.state.tempFiles.push(path);
    tempFilesGlobal.add(path);
    return `file:${path.replaceAll('\\', '/')}`;
}

// ---- measurement model -------------------------------------------------------
// Classification is this candidate's OWN, orthogonal to the probe's four
// statuses. It is recorded per operation next to the observed HTTP code and
// the operation-specific success predicate; it never feeds the ledger.
const CLASSIFICATIONS = ['functional', 'refusal-incomplete', 'unexpected-response', 'inconclusive', 'integrity-failure', 'fixture-failure'];

function classifyOperation(op, res, body, predicate, options) {
    const twoxx = res.status >= 200 && res.status < 300;
    if (op.kind === 'refusal') {
        // Degraded misclassification under test: a 2xx envelope treated as
        // success regardless of the refusal semantics.
        if (options.degraded === 'success-false-as-success' && twoxx) return 'functional';
        // Only the operation's SPECIFIC documented refusal evidence (passed in
        // as the predicate: expected status, expected marker, expected transport
        // behavior) counts as refusal-incomplete. Any other envelope — in
        // particular an unrelated 404 or 500 — is an unexpected response and
        // must fail refusal-evidence detection, never pass as the designated
        // refusal.
        return predicate ? 'refusal-incomplete' : 'unexpected-response';
    }
    if (options.degraded === 'success-false-as-success' && twoxx) return 'functional';
    return twoxx && predicate ? 'functional' : 'inconclusive';
}

function buildMeasurement(op, order, res, body, predicate, detail, extras = {}) {
    const classification = extras.classification ?? classifyOperation(op, res, body, predicate, extras.options);
    return {
        operation: op.key,
        kind: op.kind,
        order,
        observedHttpCode: res?.status ?? null,
        successPredicate: predicate === true,
        predicateDetail: detail,
        classification,
        evidence: {
            bodyExcerpt: maskVolatile(JSON.stringify(body ?? null))?.slice(0, 400) ?? null,
            sqlObservations: extras.sqlObservations ?? 0,
            injectedTransportAttempts: extras.injectedAttempts ?? [],
            globalTransportAttempts: extras.globalAttempts ?? [],
            persistedEffect: extras.persistedEffect ?? null,
            ...extras.evidenceExtra,
        },
        notes: extras.notes ?? [],
    };
}

// ---- operation descriptors ----------------------------------------------------
// Storage chain used by three operations; `sharedKey` is only consulted in the
// degraded 'shared-state' mode, where it deliberately models the pre-isolation
// shared-state fault (prior-operation mutations pollute later measurements).
async function seedStorageChain(ctx, options) {
    const memoKey = 'storage-chain';
    if (options.degraded === 'shared-state' && ctx.state.sharedMemo?.has(memoKey)) {
        return ctx.state.sharedMemo.get(memoKey);
    }
    const account = await ctx.createFixture('/api/edge-providers/', {
        name: `P1B account ${ctx.contextId}`,
        provider: 'cloudflare',
        provider_credentials: { token: 'invented-token' },
    });
    const accountId = ctx.fixtureId(account);
    assert.ok(accountId, 'storage chain fixture: connected account id');
    const provider = await ctx.createFixture('/api/storage/providers/', {
        name: `P1B provider ${ctx.contextId}`,
        provider: 'local',
        provider_account_id: accountId,
    });
    const providerId = ctx.fixtureId(provider);
    assert.ok(providerId, 'storage chain fixture: storage provider id');
    const bucket = await ctx.createFixture(`/api/storage/buckets?provider_id=${providerId}`, {
        name: `p1b-seeded-bucket-${ctx.contextId}`,
        provider: 'local',
    });
    const bucketId = ctx.fixtureId(bucket);
    assert.ok(bucketId, 'storage chain fixture: bucket id');
    await ctx.runner.exec(
        'INSERT INTO storage_files (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [`p1b-file-${ctx.contextId}`, OWNERS.A.tenant, bucketId, '/sized.txt', 'sized.txt', 42, 'text/plain', NOW()],
    );
    const chain = { accountId, providerId, bucketId };
    if (options.degraded === 'shared-state') {
        ctx.state.sharedMemo ??= new Map();
        ctx.state.sharedMemo.set(memoKey, chain);
    }
    return chain;
}

const FILE_ROW_ONLY = 'DELETE FROM storage_files WHERE bucket_id = ? AND name = ?';

const OPERATIONS = [
    {
        key: 'storage-compute-size',
        kind: 'positive',
        label: 'GET /api/storage/compute-size',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            return seedStorageChain(ctx, options);
        },
        async measure(ctx, prepared, options) {
            const query = prepared
                ? `?provider_id=${prepared.providerId}&bucket=${prepared.bucketId}`
                : '?bucket=p1b-empty&provider_id=p1b-empty';
            const doRequest = () => ctx.requestJson('GET', `/api/storage/compute-size${query}`);
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const predicate = res.status === 200 && body?.success === true && body?.size === 42;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200, size 42 from the seeded 42-byte file' : `expected size 42 from seeded file, got status ${res.status} size ${JSON.stringify(body?.size)}`,
                { options, sqlObservations: ctx.state.sqlTrace.length });
        },
        async counterfactual(ctx, prepared) {
            await ctx.runner.exec(FILE_ROW_ONLY, [prepared.bucketId, 'sized.txt']);
            const { res, body } = await ctx.requestJson(
                'GET', `/api/storage/compute-size?provider_id=${prepared.providerId}&bucket=${prepared.bucketId}`,
            );
            const predicate = res.status === 200 && body?.success === true && body?.size === 42;
            return { res, body, predicate, removed: 'seeded storage_files row (provider/account/bucket rows retained)' };
        },
    },
    {
        key: 'storage-list',
        kind: 'positive',
        label: 'GET /api/storage/list',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            return seedStorageChain(ctx, options);
        },
        async measure(ctx, prepared, options) {
            const query = prepared
                ? `?provider_id=${prepared.providerId}&bucket=${prepared.bucketId}`
                : '?bucket=p1b-empty&provider_id=p1b-empty';
            const doRequest = () => ctx.requestJson('GET', `/api/storage/list${query}`);
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const files = Array.isArray(body?.files) ? body.files : [];
            const predicate = res.status === 200 && body?.success === true
                && body?.total === 1 && files.length === 1
                && files[0]?.name === 'sized.txt' && Number(files[0]?.size) === 42;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 listing exactly the named seeded file with total 1' : `expected the named seeded file with total 1, got status ${res.status} total ${JSON.stringify(body?.total)}`,
                { options, sqlObservations: ctx.state.sqlTrace.length });
        },
        async counterfactual(ctx, prepared) {
            await ctx.runner.exec(FILE_ROW_ONLY, [prepared.bucketId, 'sized.txt']);
            const { res, body } = await ctx.requestJson(
                'GET', `/api/storage/list?provider_id=${prepared.providerId}&bucket=${prepared.bucketId}`,
            );
            const files = Array.isArray(body?.files) ? body.files : [];
            const predicate = res.status === 200 && body?.success === true
                && body?.total === 1 && files.length === 1 && files[0]?.name === 'sized.txt';
            return { res, body, predicate, removed: 'seeded storage_files row (provider/account/bucket rows retained)' };
        },
    },
    {
        key: 'storage-delete-provider',
        kind: 'positive',
        label: 'DELETE /api/storage/providers/{provider_id}',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            return seedStorageChain(ctx, options);
        },
        async measure(ctx, prepared, options) {
            if (!prepared) {
                return buildMeasurement(this, 'measured', { status: 0 }, null, false,
                    'empty-fixtures mode: no provider chain seeded', { options, classification: 'inconclusive' });
            }
            const { res, body } = await ctx.requestJson('DELETE', `/api/storage/providers/${prepared.providerId}`);
            // Persisted effect: a separate post-deletion registry read (recorded
            // as evidence; it is not counted as the operation's own SQL).
            const after = await ctx.requestJson('GET', '/api/storage/providers/');
            const remaining = Array.isArray(after.body) ? after.body.filter((p) => p?.id === prepared.providerId) : null;
            const persistedEffect = { registryReadStatus: after.res.status, providerStillPresent: remaining === null ? 'unreadable' : remaining.length > 0 };
            const predicate = res.status === 200 && body?.success === true && persistedEffect.providerStillPresent === false;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 removal with persisted registry effect (provider gone)' : `expected persisted provider removal, got status ${res.status} stillPresent ${persistedEffect.providerStillPresent}`,
                { options, persistedEffect, sqlObservations: ctx.state.sqlTrace.length });
        },
    },
    {
        key: 'queue-list',
        kind: 'positive',
        label: 'GET /api/edge-queues/',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            fixtureSerial += 1;
            const created = await ctx.createFixture('/api/edge-queues/', {
                name: `P1B seeded queue ${fixtureSerial}`,
                provider: 'qstash',
                queue_url: `https://p1b.invalid/seeded-queue-${fixtureSerial}`,
            });
            return { seededId: ctx.fixtureId(created), seededName: created.name ?? null };
        },
        async measure(ctx, prepared, options) {
            const doRequest = () => ctx.requestJson('GET', '/api/edge-queues/');
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const list = Array.isArray(body) ? body : [];
            const found = prepared ? list.find((entry) => entry?.id === prepared.seededId) : undefined;
            const predicate = res.status === 200
                && Array.isArray(body) && list.length >= 1
                && Boolean(found) && found?.name === prepared?.seededName;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 list contains the API-created seeded queue (matched by id and name)' : `seeded queue absent from list response, status ${res.status}, listLength ${list.length}`,
                { options, sqlObservations: ctx.state.sqlTrace.length, evidenceExtra: { emptyListObservation: list.length === 0 ? 'empty list is inconclusive, never functional' : null } });
        },
    },
    {
        key: 'vector-list',
        kind: 'positive',
        label: 'GET /api/edge-vectors/',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            fixtureSerial += 1;
            const created = await ctx.createFixture('/api/edge-vectors/', {
                name: `P1B seeded vector ${fixtureSerial}`,
                provider: 'turso',
                vector_url: `https://p1b.invalid/seeded-vector-${fixtureSerial}`,
            });
            return { seededId: ctx.fixtureId(created), seededName: created.name ?? null };
        },
        async measure(ctx, prepared, options) {
            const doRequest = () => ctx.requestJson('GET', '/api/edge-vectors/');
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const list = Array.isArray(body) ? body : [];
            const found = prepared ? list.find((entry) => entry?.id === prepared.seededId) : undefined;
            const predicate = res.status === 200
                && Array.isArray(body) && list.length >= 1
                && Boolean(found) && found?.name === prepared?.seededName;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 list contains the API-created seeded vector (matched by id and name)' : `seeded vector absent from list response, status ${res.status}, listLength ${list.length}`,
                { options, sqlObservations: ctx.state.sqlTrace.length, evidenceExtra: { emptyListObservation: list.length === 0 ? 'empty list is inconclusive, never functional' : null } });
        },
    },
    {
        key: 'agent-settings',
        kind: 'positive',
        label: 'GET /api/agent/settings (after nondefault PUT)',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            const put = await ctx.requestJson('PUT', '/api/agent/settings', { general: { temperature: 0.23 }, system: {} });
            if (!put.res.ok) throw new Error(`agent settings PUT returned ${put.res.status}`);
            return { temperature: 0.23 };
        },
        async measure(ctx, prepared, options) {
            const doRequest = () => ctx.requestJson('GET', '/api/agent/settings');
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const temperature = body?.settings?.general?.temperature;
            const predicate = res.status === 200 && temperature === (prepared?.temperature ?? 0.23);
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 GET returns the nondefault PUT temperature 0.23 (default is 0.7)' : `expected nondefault temperature 0.23, got status ${res.status} temperature ${JSON.stringify(temperature)}`,
                { options, sqlObservations: ctx.state.sqlTrace.length });
        },
        async counterfactual(ctx) {
            await ctx.runner.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ?', [OWNERS.A.tenant, 'agent_settings']);
            const { res, body } = await ctx.requestJson('GET', '/api/agent/settings');
            const predicate = res.status === 200 && body?.settings?.general?.temperature === 0.23;
            return { res, body, predicate, removed: 'settings row agent_settings (owner/user rows retained)' };
        },
    },
    {
        key: 'auth-form-primary',
        kind: 'positive',
        label: 'GET /api/auth-forms/primary/ (CREATE, set-primary)',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            const form = await ctx.createFixture('/api/auth-forms/', {
                name: `P1B primary form ${ctx.contextId}`,
                type: 'login',
                config: {},
                is_active: true,
            });
            const formId = ctx.fixtureId(form);
            assert.ok(formId, 'auth form fixture: created id');
            const set = await ctx.requestJson('PUT', `/api/auth-forms/${formId}/set-primary/`);
            if (!set.res.ok || set.body?.success !== true) {
                throw new Error(`set-primary returned ${set.res.status}`);
            }
            return { formId };
        },
        async measure(ctx, prepared, options) {
            const doRequest = () => ctx.requestJson('GET', '/api/auth-forms/primary/');
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const predicate = res.status === 200 && body?.success === true
                && body?.data?.id === prepared?.formId && body?.data?.is_primary === true;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 primary GET returns the chosen form id with primary flag true (repaired column-based rule)' : `expected chosen form ${prepared?.formId ?? '(none seeded)'} as primary, got status ${res.status} success ${JSON.stringify(body?.success)} id ${JSON.stringify(body?.data?.id)}`,
                { options, sqlObservations: ctx.state.sqlTrace.length });
        },
        async counterfactual(ctx, prepared) {
            await ctx.runner.exec('DELETE FROM auth_forms WHERE tenant_slug = ? AND id = ?', [OWNERS.A.tenant, prepared.formId]);
            const { res, body } = await ctx.requestJson('GET', '/api/auth-forms/primary/');
            const predicate = res.status === 200 && body?.success === true && body?.data?.id === prepared.formId;
            return { res, body, predicate, removed: 'the chosen auth_forms row (owner rows retained)' };
        },
    },
    {
        key: 'project-asset-upload',
        kind: 'positive',
        label: 'POST /api/project/assets/upload/ (probe.png)',
        async prepare() {
            // The uploaded bytes are the operation's own request payload; no
            // target rows need seeding. Kept for descriptor symmetry.
            return { bytes: new TextEncoder().encode('p1b probe asset bytes') };
        },
        async measure(ctx, prepared, options) {
            const form = new FormData();
            form.set('file', new Blob([prepared?.bytes ?? new Uint8Array()], { type: 'image/png' }), 'probe.png');
            form.set('asset_type', 'favicon');
            const res = await ctx.app.fetch(new Request('http://p1b.probe.invalid/api/project/assets/upload/', {
                method: 'POST',
                headers: { 'x-p1b-owner': 'A' },
                body: form,
            }));
            const body = await res.clone().json().catch(() => null);
            const publicUrl = typeof body?.publicUrl === 'string' ? body.publicUrl : null;
            const filename = publicUrl?.startsWith('/static/assets/') ? publicUrl.slice('/static/assets/'.length) : null;
            // Persisted effect: the asset bytes live in the tenant settings KV
            // (meta row + at least one chunk row) — verified by direct read.
            let persistedEffect = null;
            if (filename) {
                const meta = await ctx.runner.query(
                    'SELECT key FROM settings WHERE tenant_slug = ? AND key = ?', [OWNERS.A.tenant, `project_asset:${filename}`],
                );
                const chunk = await ctx.runner.query(
                    'SELECT key FROM settings WHERE tenant_slug = ? AND key = ?', [OWNERS.A.tenant, `project_asset:${filename}#0`],
                );
                persistedEffect = { metaRowPresent: meta.length > 0, chunkRowPresent: chunk.length > 0, filename };
            }
            const predicate = res.status === 200 && body?.success === true
                && Boolean(publicUrl?.match(/^\/static\/assets\/favicon-[0-9a-f]{8}\.png$/))
                && persistedEffect?.metaRowPresent === true && persistedEffect?.chunkRowPresent === true;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 upload persisted a favicon-*.png asset with meta and chunk rows in tenant settings' : `expected persisted favicon asset, got status ${res.status} publicUrl ${JSON.stringify(publicUrl)} persisted ${JSON.stringify(persistedEffect)}`,
                { options, persistedEffect, sqlObservations: ctx.state.sqlTrace.length });
        },
    },
    {
        key: 'datasource-search-all',
        kind: 'positive',
        label: 'GET /api/sync/datasources/search-all/ (seeded sqlite row)',
        async prepare(ctx, options) {
            if (options.degraded === 'empty-fixtures') return null;
            const dbFile = temporaryDatabaseUrl(ctx);
            const dsRunner = datasourceRunner('sqlite', { url: dbFile });
            await dsRunner.exec('CREATE TABLE IF NOT EXISTS published_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT)');
            await dsRunner.exec("INSERT OR REPLACE INTO published_pages (id, slug, title) VALUES ('p1b-search-1', 'home', 'P1B searchable fixture')");
            const ds = await ctx.createFixture('/api/sync/datasources/', {
                name: `P1B search datasource ${ctx.contextId}`,
                type: 'sqlite',
                config: { url: dbFile },
            });
            const dsId = ctx.fixtureId(ds);
            assert.ok(dsId, 'datasource fixture: created id');
            return { dsId, dbFile };
        },
        async measure(ctx, prepared, options) {
            const doRequest = () => ctx.requestJson('GET', '/api/sync/datasources/search-all/?q=P1B%20searchable%20fixture');
            const { res, body } = options.degraded === 'starved-reads'
                ? await withStarvedReads(ctx, doRequest)
                : await doRequest();
            const matches = Array.isArray(body?.matches) ? body.matches : [];
            const intended = matches.find((m) => m?.datasource_id === prepared?.dsId
                && (String(m?.row_id) === 'p1b-search-1' || String(m?.record?.id) === 'p1b-search-1'));
            const predicate = res.status === 200 && matches.length >= 1 && Boolean(intended);
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate ? 'HTTP 200 matches include the intended seeded record p1b-search-1 of the seeded datasource' : `intended record p1b-search-1 not matched, status ${res.status}, matchCount ${matches.length}`,
                { options, sqlObservations: ctx.state.sqlTrace.length });
        },
        async counterfactual(ctx, prepared) {
            const dsRunner = datasourceRunner('sqlite', { url: prepared.dbFile });
            await dsRunner.exec("DELETE FROM published_pages WHERE id = 'p1b-search-1'");
            const { res, body } = await ctx.requestJson('GET', '/api/sync/datasources/search-all/?q=P1B%20searchable%20fixture');
            const predicate = res.status === 200 && Array.isArray(body?.matches)
                && body.matches.some((m) => m?.datasource_id === prepared.dsId
                    && (String(m?.row_id) === 'p1b-search-1' || String(m?.record?.id) === 'p1b-search-1'));
            return { res, body, predicate, removed: 'the seeded published_pages row inside the datasource file (datasource registry row retained)' };
        },
    },
    {
        key: 'edge-db-reset-role-password',
        kind: 'refusal',
        label: 'POST /api/edge-databases/reset-role-password (unresolvable credentials)',
        async prepare() { return null; /* intentionally no resolvable connected account */ },
        async measure(ctx, _prepared, options) {
            const startedGlobal = globalTransportAttempts.length;
            const startedInjected = injectedTransportAttempts.length;
            const requestBody = {
                provider_account_id: 'p1b-unresolvable-account',
                db_url: 'https://p1b.invalid/database',
                schema_name: 'frontbase_edge_p1b',
            };
            const doRequest = (requestPath) => ctx.requestJson('POST', requestPath, requestBody);
            const { res, body } = await applyRefusalSubstitution(options, doRequest, 'POST', '/api/edge-databases/reset-role-password');
            const injected = injectedTransportAttempts.slice(startedInjected);
            const globals = globalTransportAttempts.slice(startedGlobal);
            const evidence = {
                bodyExcerpt: maskVolatile(JSON.stringify(body ?? null))?.slice(0, 400) ?? null,
                sqlObservations: ctx.state.sqlTrace.length,
                injectedTransportAttempts: injected,
                globalTransportAttempts: globals,
            };
            // Documented expected refusal semantics (route source + isolation
            // observation, not a frozen observation): credential resolution must
            // fail LOCALLY — HTTP 400 carrying the specific credential marker,
            // with ZERO transport activity of any kind (no injected provider
            // call, no raw/global fallback), hence no DDL and no management
            // mutation. An unrelated 404/500 must NOT satisfy this predicate.
            const CREDENTIAL_MARKER = 'Could not resolve Supabase credentials';
            const detail = typeof body?.detail === 'string' ? body.detail : null;
            const predicate = res.status === 400
                && detail !== null && detail.includes(CREDENTIAL_MARKER)
                && injected.length === 0
                && globals.length === 0;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate
                    ? 'documented refusal matched: HTTP 400 with the credential-resolution marker and zero transport activity (credential resolution failed locally, no DDL)'
                    : `expected documented refusal (HTTP 400 "${CREDENTIAL_MARKER}" + zero transport attempts), got status ${res.status} detail ${JSON.stringify(detail)} injectedAttempts ${injected.length} globalAttempts ${globals.length}`,
                { options, injectedAttempts: injected, globalAttempts: globals, evidenceExtra: evidence,
                  notes: ['designated refusal: refusal-incomplete ONLY on the documented evidence above; unrelated errors are unexpected-response'] });
        },
    },
    {
        key: 'vector-test-connection',
        kind: 'refusal',
        label: 'POST /api/edge-vectors/test-connection (unconfigured transport)',
        async prepare() { return null; /* intentionally no configured transport */ },
        async measure(ctx, _prepared, options) {
            const startedGlobal = globalTransportAttempts.length;
            const startedInjected = injectedTransportAttempts.length;
            const requestBody = { provider: 'vectorize', vector_url: 'https://p1b.invalid/vector' };
            const doRequest = (requestPath) => ctx.requestJson('POST', requestPath, requestBody);
            const { res, body } = await applyRefusalSubstitution(options, doRequest, 'POST', '/api/edge-vectors/test-connection');
            const injected = injectedTransportAttempts.slice(startedInjected);
            const globals = globalTransportAttempts.slice(startedGlobal);
            const evidence = {
                bodyExcerpt: maskVolatile(JSON.stringify(body ?? null))?.slice(0, 400) ?? null,
                sqlObservations: ctx.state.sqlTrace.length,
                injectedTransportAttempts: injected,
                globalTransportAttempts: globals,
            };
            // Documented expected refusal semantics (route source + isolation
            // observation, not a frozen observation): HTTP 200 with success:false
            // where the ONLY transport activity is EXACTLY ONE legacy GET probe
            // denied by this candidate's offline guard (marker present in the
            // handler's failure message), ZERO raw/global calls, and therefore no
            // DDL/upsert/search/delete round trip. An unrelated 404/500 must NOT
            // satisfy this predicate.
            const GUARD_MARKER = 'P1B offline guard: injected transport denies all external calls';
            const message = typeof body?.message === 'string' ? body.message : null;
            const successfulRoundTrip = res.status >= 200 && res.status < 300 && body?.success === true;
            const predicate = res.status === 200
                && body?.success === false
                && message !== null && message.includes(GUARD_MARKER)
                && injected.length === 1
                && injected[0]?.method === 'GET' && injected[0]?.url === 'https://p1b.invalid/vector'
                && globals.length === 0
                && !successfulRoundTrip;
            return buildMeasurement(this, 'measured', res, body, predicate,
                predicate
                    ? 'documented refusal matched: HTTP 200 success:false after exactly one offline-guard-denied legacy GET probe; zero raw/global calls; no round trip'
                    : `expected documented refusal (HTTP 200 success:false + guard marker + exactly 1 denied GET probe + 0 global calls), got status ${res.status} success ${JSON.stringify(body?.success)} message ${JSON.stringify(message)} injectedAttempts ${injected.length} globalAttempts ${globals.length}`,
                { options, injectedAttempts: injected, globalAttempts: globals, evidenceExtra: evidence,
                  notes: ['designated refusal: refusal-incomplete ONLY on the documented evidence above; unrelated errors are unexpected-response'] });
        },
    },
];

async function withStarvedReads(ctx, fn) {
    ctx.state.starveReads = true;
    try {
        return await fn();
    } finally {
        ctx.state.starveReads = false;
    }
}

/**
 * Degraded substitution modes for refusal-measurement integrity testing: the
 * designated refusal operation is made to observe evidence that must NOT be
 * accepted as its documented refusal.
 *   - 'refusal-wrong-route': the request is re-issued against a nonexistent
 *     route, so the candidate observes the app's REAL unrelated 404.
 *   - 'refusal-server-error': the observation is replaced by a synthetic,
 *     clearly-labelled unrelated 500 (the same class of fault injection as
 *     starved reads).
 * The refusal predicates assert the documented expected evidence and must
 * reject both substitutions; the negative harness asserts the detectors fire.
 */
async function applyRefusalSubstitution(options, doRequest, method, path) {
    if (options.degraded === 'refusal-wrong-route') {
        return doRequest(path.replace('/api/', '/api/p1b-substituted-nonexistent/'));
    }
    if (options.degraded === 'refusal-server-error') {
        const res = new Response(JSON.stringify({ detail: 'Internal Server Error (P1B substituted unrelated 500)' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
        return { res, body: await res.clone().json() };
    }
    return doRequest(path);
}

// ---- order definitions ---------------------------------------------------------
const ORDER_DEFS = (keys) => [
    { name: 'forward', keys },
    { name: 'reverse', keys: keys.slice().reverse() },
    { name: 'shuffle-mulberry32-seed-1', keys: shuffledOrder(keys, 1) },
    { name: 'shuffle-mulberry32-seed-2', keys: shuffledOrder(keys, 2) },
];

// ---- core runner ----------------------------------------------------------------
/**
 * Runs the candidate. Options:
 *   degraded: 'none' | 'empty-fixtures' | 'starved-reads' | 'shared-state'
 *             | 'success-false-as-success' — degraded modes deliberately
 *             disable an integrity property; the candidate's assertions are
 *             expected to fire (see the negative self-test harness).
 *   evidenceDir: existing directory to write evidence into (default: a fresh
 *             OS temp directory).
 * Returns a summary; throws AssertionError when any expectation fails
 * (in normal mode this indicates a genuine measurement-integrity failure).
 */
export async function runCandidate(options = {}) {
    const degraded = options.degraded ?? 'none';
    const runOptions = { degraded };
    const evidenceDir = options.evidenceDir ?? mkdtempSync(join(tmpdir(), `frontbase-p1b-behavior-${degraded}-`));
    const ledgerBefore = fileSha256(LEDGER_PATH);
    const probeSourceBefore = fileSha256(PROBE_SOURCE_PATH);
    const compiledHashes = {};
    for (const [name, path] of Object.entries(COMPILED_ENTRIES)) {
        try { compiledHashes[name] = { sha256: fileSha256(path), mtime: statSync(path).mtime.toISOString() }; }
        catch (e) { compiledHashes[name] = { error: String(e) }; }
    }
    const staleness = {};
    for (const [name, path] of Object.entries(SRC_COUNTERPARTS)) {
        try {
            const srcMtime = statSync(path).mtime;
            const distMtime = statSync(COMPILED_ENTRIES[name]).mtime;
            staleness[name] = { srcNewerThanDist: srcMtime > distMtime, srcMtime: srcMtime.toISOString(), distMtime: distMtime.toISOString() };
        } catch (e) { staleness[name] = { error: String(e) }; }
    }

    const attemptsBefore = {
        injected: injectedTransportAttempts.length,
        global: globalTransportAttempts.length,
    };
    const measurements = new Map(); // key -> array of per-order measurements
    const contexts = [];
    const orders = degraded === 'shared-state'
        ? [{ name: 'forward', keys: OPERATIONS.map((o) => o.key) }, { name: 'reverse', keys: OPERATIONS.map((o) => o.key).reverse() }]
        : ORDER_DEFS(OPERATIONS.map((o) => o.key));
    const sharedContext = degraded === 'shared-state' ? await createContext() : null;
    if (sharedContext) contexts.push(sharedContext);

    try {
        for (const orderDef of orders) {
            for (const key of orderDef.keys) {
                const op = OPERATIONS.find((o) => o.key === key);
                assert.ok(op, `operation descriptor present for ${key}`);
                const ctx = sharedContext ?? await createContext();
                if (!sharedContext) contexts.push(ctx);
                let measurement;
                try {
                    const prepared = await op.prepare(ctx, runOptions); // may throw: explicit fixture failure below
                    measurement = await op.measure(ctx, prepared, runOptions);
                    // Counterfactual (read candidates): remove ONLY the seeded
                    // target row and require the success predicate to flip.
                    if (op.counterfactual && degraded !== 'shared-state' && degraded !== 'empty-fixtures' && prepared) {
                        const cf = await op.counterfactual(ctx, prepared);
                        const cfMeasurement = buildMeasurement(op, 'counterfactual', cf.res, cf.body, cf.predicate,
                            `counterfactual after removing ${cf.removed}: predicate ${cf.predicate}`, { options: runOptions, sqlObservations: ctx.state.sqlTrace.length });
                        measurement.counterfactual = {
                            removed: cf.removed,
                            observedHttpCode: cf.res?.status ?? null,
                            successPredicate: cf.predicate === true,
                            classification: cfMeasurement.classification,
                            predicateDetail: cfMeasurement.predicateDetail,
                        };
                    }
                } catch (error) {
                    measurement = {
                        operation: op.key, kind: op.kind, order: orderDef.name,
                        observedHttpCode: null, successPredicate: false,
                        predicateDetail: `fixture/measurement failure kept in the denominator: ${maskVolatile(error.message)}`,
                        classification: 'fixture-failure',
                        evidence: { injectedTransportAttempts: [], globalTransportAttempts: [], sqlObservations: 0 },
                        notes: [],
                    };
                }
                measurement.order = orderDef.name;
                if (!measurements.has(key)) measurements.set(key, []);
                measurements.get(key).push(measurement);
                if (!sharedContext) ctx.dispose();
            }
        }

        // Cross-owner isolation (normal mode only): owner B must not see
        // owner A's seeded resource through the same app.
        let isolation = null;
        if (degraded === 'none') {
            const ctx = await createContext();
            contexts.push(ctx);
            try {
                fixtureSerial += 1;
                const seeded = await ctx.createFixture('/api/edge-queues/', {
                    name: `P1B isolation queue ${fixtureSerial}`,
                    provider: 'qstash',
                    queue_url: `https://p1b.invalid/isolation-queue-${fixtureSerial}`,
                });
                const seededId = ctx.fixtureId(seeded);
                const ownerA = await ctx.requestJson('GET', '/api/edge-queues/', undefined, 'A');
                const ownerB = await ctx.requestJson('GET', '/api/edge-queues/', undefined, 'B');
                const listA = Array.isArray(ownerA.body) ? ownerA.body : [];
                const listB = Array.isArray(ownerB.body) ? ownerB.body : [];
                const primaryB = await ctx.requestJson('GET', '/api/auth-forms/primary/', undefined, 'B');
                isolation = {
                    seededQueueId: seededId,
                    ownerASeesSeeded: listA.some((e) => e?.id === seededId),
                    ownerBSeesSeeded: listB.some((e) => e?.id === seededId),
                    ownerBListLength: listB.length,
                    ownerBPrimarySuccess: primaryB.body?.success === true,
                };
            } finally {
                ctx.dispose();
            }
        }

        // ---- expectations (normal mode) and integrity invariants (every mode) ----
        const failures = [];
        const noteFailure = (message) => { failures.push(message); };
        for (const [key, runs] of measurements) {
            const op = OPERATIONS.find((o) => o.key === key);
            for (const run of runs) {
                // Hard invariants, enforced in EVERY mode including degraded ones.
                if (op.kind === 'refusal' && run.classification === 'functional') {
                    noteFailure(`[p1b-detector:refusal-invariant] ${key} (${run.order}): a designated refusal operation was classified functional — measurement integrity failure`);
                }
                if (!CLASSIFICATIONS.includes(run.classification)) {
                    noteFailure(`[p1b-detector:classification] ${key} (${run.order}): unknown classification ${run.classification}`);
                }
                if (run.globalTransportAttempts?.length) {
                    noteFailure(`[p1b-detector:offline-guard] ${key} (${run.order}): raw/global transport fallback attempted (${run.globalTransportAttempts.map((a) => `${a.method} ${a.url}`).join('; ')}) — recorded as integrity failure, not a pass`);
                }
                // Expectations — enforced in EVERY mode. Degraded modes are fault
                // injections: the candidate is EXPECTED to fail under them, and
                // the negative self-test harness proves those failures fire.
                if (op.kind === 'positive') {
                    if (run.classification !== 'functional' || run.successPredicate !== true) {
                        noteFailure(`[p1b-detector:positive-outcome] ${key} (${run.order}): expected functional with met success predicate, got ${run.classification} — ${run.predicateDetail}`);
                    }
                    if (degraded === 'none' && op.counterfactual && run.counterfactual) {
                        if (run.successPredicate !== true || run.counterfactual.successPredicate !== false) {
                            noteFailure(`[p1b-detector:counterfactual-flip] ${key} (${run.order}): predicate did not flip when only the seeded target row was removed (measured ${run.successPredicate}, counterfactual ${run.counterfactual.successPredicate}) — ${run.counterfactual.predicateDetail}`);
                        }
                    }
                }
                if (op.kind === 'refusal') {
                    if (run.classification !== 'refusal-incomplete' || run.successPredicate !== true) {
                        noteFailure(`[p1b-detector:refusal-evidence] ${key} (${run.order}): expected refusal-incomplete with captured evidence, got ${run.classification} — ${run.predicateDetail}`);
                    }
                }
            }
            // Order invariance (normal mode: four orders; shared-state: two).
            const semantic = runs.map((run) => JSON.stringify({
                httpStatus: run.observedHttpCode,
                predicate: run.successPredicate,
                classification: run.classification,
                detail: maskVolatile(run.predicateDetail),
            }));
            if (degraded === 'none' && new Set(semantic).size !== 1) {
                noteFailure(`[p1b-detector:order-invariance] ${key}: outcomes differ across orders — ${semantic.join(' | ')}`);
            }
        }
        if (degraded === 'none' && isolation) {
            if (isolation.ownerASeesSeeded !== true || isolation.ownerBSeesSeeded !== false
                || isolation.ownerBListLength !== 0 || isolation.ownerBPrimarySuccess !== false) {
                noteFailure(`[p1b-detector:owner-isolation] owner B observed owner A's state — ${JSON.stringify(isolation)}`);
            }
        }
        const globalAttemptsThisRun = globalTransportAttempts.slice(attemptsBefore.global);
        if (degraded === 'none' && globalAttemptsThisRun.length) {
            noteFailure(`[p1b-detector:offline-guard] run-level raw/global transport attempts: ${globalAttemptsThisRun.map((a) => `${a.method} ${a.url}`).join('; ')}`);
        }

        const ledgerAfter = fileSha256(LEDGER_PATH);
        if (ledgerAfter !== ledgerBefore) {
            noteFailure(`[p1b-detector:ledger-integrity] behavior ledger changed during the run (${ledgerBefore} -> ${ledgerAfter})`);
        }
        const probeSourceAfter = fileSha256(PROBE_SOURCE_PATH);
        if (probeSourceAfter !== probeSourceBefore) {
            noteFailure('[p1b-detector:probe-integrity] compat-conformance.mjs changed during the run');
        }

        const summary = {
            degraded,
            evidenceDir,
            orders: orders.map((o) => o.name),
            operations: Object.fromEntries([...measurements.entries()].map(([key, runs]) => [key, runs])),
            isolation,
            integrity: {
                ledgerSha256Before: ledgerBefore,
                ledgerSha256After: ledgerAfter,
                probeSourceSha256Before: probeSourceBefore,
                probeSourceSha256After: probeSourceAfter,
                compiledEntries: compiledHashes,
                staleness,
                injectedTransportAttemptsRun: injectedTransportAttempts.slice(attemptsBefore.injected),
                globalTransportAttemptsRun: globalAttemptsThisRun,
            },
            failures,
            passed: failures.length === 0,
        };
        try {
            writeFileSync(join(evidenceDir, `evidence-${degraded}.json`), JSON.stringify(summary, null, 2));
        } catch { /* evidence write must never mask a measurement result */ }
        if (failures.length > 0) {
            // Degraded modes are fault injections: throwing IS the candidate's
            // honest answer, and the negative self-test harness matches these
            // messages against their intended detector tags.
            throw new Error(`P1B candidate expectations failed (${failures.length}); evidence: ${evidenceDir}\n${failures.join('\n')}`);
        }
        return summary;
    } finally {
        for (const ctx of contexts) ctx.dispose();
    }
}

const readFileSyncSafe = (path) => { try { return readFileSync(path); } catch { return null; } };

/** Ledger SHA-256 for external before/after recording (hashes only — never reads content for classification). */
export const ledgerSha256ForReport = () => fileSha256(LEDGER_PATH);

// ---- dist preflight (concurrent-build detection) --------------------------------
/**
 * Verifies dist exists and samples compiled-entry mtimes twice. Returns
 * { ok, reason, hashes, stabilitySamples } — ok:false means an active or
 * missing build and the candidate must not run.
 */
export async function preflightDist(sampleDelayMs = 2000) {
    const missing = Object.entries(COMPILED_ENTRIES).filter(([, path]) => !readFileSyncSafe(path));
    if (missing.length) {
        return { ok: false, reason: `dist missing or unreadable for: ${missing.map(([n]) => n).join(', ')} — blocked pending a build slot` };
    }
    const sample = () => Object.fromEntries(Object.entries(COMPILED_ENTRIES)
        .map(([name, path]) => [name, statSync(path).mtimeMs]));
    const first = sample();
    await new Promise((resolve) => setTimeout(resolve, sampleDelayMs));
    const second = sample();
    const unstable = Object.keys(first).filter((name) => first[name] !== second[name]);
    if (unstable.length) {
        return { ok: false, reason: `dist mtimes changed during sampling (active concurrent build): ${unstable.join(', ')} — blocked pending a build slot`, stabilitySamples: [first, second] };
    }
    return { ok: true, reason: 'dist present and stable across samples', stabilitySamples: [first, second] };
}

// ---- main entry -------------------------------------------------------------------
async function main() {
    const print = (line) => process.stdout.write(`${line}\n`);
    print(JSON.stringify({ p1bCandidate: 'starting', node: process.version, platform: process.platform }));
    const preflight = await preflightDist();
    print(JSON.stringify({ preflight: { ok: preflight.ok, reason: preflight.reason } }));
    if (!preflight.ok) {
        print('P1B CANDIDATE BLOCKED: ' + preflight.reason);
        print('Deliverable status: blocked-pending-build-slot; rerun exactly this command once primary releases the build lock.');
        process.exitCode = 2;
        return;
    }
    let summary;
    try {
        summary = await runCandidate();
    } catch (error) {
        print(`P1B CANDIDATE FAILURES PRESENT — nothing was suppressed:\n${error.message}`);
        process.exitCode = 1;
        return;
    }
    print(JSON.stringify({
        degraded: summary.degraded,
        passed: summary.passed,
        failures: summary.failures,
        orders: summary.orders,
        operationCount: OPERATIONS.length,
        counterfactualOps: OPERATIONS.filter((o) => o.counterfactual).map((o) => o.key),
        ledgerSha256: summary.integrity.ledgerSha256After,
        ledgerUnchanged: summary.integrity.ledgerSha256Before === summary.integrity.ledgerSha256After,
        srcNewerThanDist: Object.entries(summary.integrity.staleness)
            .filter(([, v]) => v?.srcNewerThanDist).map(([k]) => k),
        injectedTransportAttempts: summary.integrity.injectedTransportAttemptsRun.length,
        globalTransportAttempts: summary.integrity.globalTransportAttemptsRun.length,
    }, null, 2));
    print(`EVIDENCE_DIR: ${summary.evidenceDir}`);
    if (!summary.passed) {
        print('P1B CANDIDATE FAILURES PRESENT — see failures above; nothing was suppressed.');
        process.exitCode = 1;
    } else {
        print('P1B candidate completed: positive, refusal, order-invariance, counterfactual, and owner-isolation sections all passed. Results are PRELIMINARY until primary reruns under its exclusive build lock. This is not a passing behavior gate and the behavior ledger was not modified.');
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
