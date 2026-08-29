# Phase 3 Follow-ups — Junior-Agent Implementation Sprint (P0–P3)

**Date:** 2026-07-13 · **Owner:** (assign) · **Source of truth:** [`phase-3-consolidated-delivery.md`](../phase-3-consolidated-delivery.md)

This is a step-by-step build sheet for the open Phase-3 follow-ups, **excluding F8b Stripe** (deferred as its own task — Stripe billing is not stable yet; see `docs/plans/f8b-stripe-billing-DEFERRED.md`).

## How to work this sprint

- **One task = one commit.** Do them top-to-bottom (P0 first). Don't batch.
- **Every task ships a test** wired into `packages/backend/package.json` `"test"` (or the relevant package's test script) — append ` && node test/<name>.mjs` in run order.
- **Build before test:** `pnpm --filter @frontbase/<pkg> build` then run the node test. Tests import from `dist/`, so a stale build = false pass/fail.
- **Full gate before each commit:** `pnpm -r test` (must stay all-green) + `pnpm -r test:mutation` (RED-on-break intact) + `pnpm --filter @frontbase/example-cf-full smoke` (must be < 1 MB gzip).
- **GOLDEN RULES apply.** RULE 1: new server code lives in `edge-infra`/`backend`, never browser-imported. RULE 2: every store query filters `tenant_slug`; routes stay behind `defaultDenyAuth`. RULE 4: errors are opaque codes, no secret/internal detail.
- **Do NOT commit real secrets.** `examples/cf-full/wrangler.toml` has a real `database_id` locally — run `git restore examples/cf-full/wrangler.toml` before every commit (the repo ships a placeholder).
- **Commit trailer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Test helper double-wrap gotcha:** the local `req(method, path, body)` helpers in these test files JSON-stringify `body` for you — pass a **raw object** (`{ name: 'x' }`), NOT `{ body: {...} }`. (This bit F4/F8c tests during Phase 3 — see the fixed pattern in `test/plans.mjs`.)
- **libsql file URLs on Windows:** a datasource pointing at a file needs `file:` + forward slashes (`'file:' + path.replace(/\\/g, '/')`). Bare `C:\...` is rejected. (See `test/data-studio.mjs`.)

---

## PREREQUISITE — P0-PRE: add a storage-provider injection seam to `createConsole`

**Why first:** BUG-1 and F4b both need an end-to-end test through a routed request, but `createConsole` today only accepts storage *credentials* (`deps.storage = {accessKeyId,...}`) and builds an S3 client internally (`packages/backend/src/index.ts:139`). You cannot exercise the delete/upload routes against the in-memory provider without this seam. This is a ~20-line change that unblocks P0 + P1 tests.

**Files:** `packages/backend/src/index.ts`

**Steps:**
1. In `CreateConsoleDeps` (around line 63), add an optional field alongside `storage`:
   ```ts
   /** A pre-built StorageProvider (tests / advanced hosts). Takes precedence over
    *  `storage` credentials. */
   storageProvider?: StorageProvider;
   ```
2. Where `storageProvider` is built (line 139), prefer the injected one:
   ```ts
   const storageProvider: StorageProvider | undefined =
       deps.storageProvider ?? (deps.storage ? s3StorageProvider(deps.storage) : undefined);
   ```
3. `StorageProvider` is already imported on line 19 — no new import needed.
4. `pnpm --filter @frontbase/backend build` — must compile clean.

**Commit:** `feat(backend): inject pre-built StorageProvider into createConsole (test seam for P0/P1)`

---

## P0 — BUG-1: storage delete leaves orphaned objects

**Bug:** `DELETE /storage/files/:id` calls `storage.delete('', fileId)` — empty bucket + the file **id** where the object **key/path** belongs (`packages/backend/src/routes/phase2.ts:266-277`). The real R2/S3 object is never removed; only the metadata row. The inline comment falsely claims the schema lacks `bucket_id` — it does not (`storage_files` has `bucket_id` + `path`, `db/migrations.ts:63`).

**Fix — 3 edits + 1 test.**

### 1. Add `getFile(id)` to the store
**File:** `packages/backend/src/db/phase2-store.ts` (after `deleteFile`, ~line 192)
```ts
/** A single file row by id (for resolving bucket_id + path before object delete). */
async getFile(id: string): Promise<{ bucketId: string; path: string } | null> {
    const rows = await this.runner.query(
        'SELECT bucket_id, path FROM storage_files WHERE id = ? AND tenant_slug = ?',
        [id, this.tenant],
    );
    const row = rows[0];
    return row ? { bucketId: String(row.bucket_id), path: String(row.path) } : null;
}
```

### 2. Fix the delete route to resolve + pass the real key
**File:** `packages/backend/src/routes/phase2.ts` (replace the `app.delete('/storage/files/:id', …)` body, ~line 266)
```ts
app.delete('/storage/files/:id', async (c) => {
    const store = storeFor(c.get('tenant'));
    // Resolve bucket + path BEFORE deleting the row, so we can remove the real object.
    if (storage) {
        const file = await store.getFile(c.req.param('id'));
        if (file) {
            try { await storage.delete(file.bucketId, file.path); }
            catch { /* best-effort: metadata row still goes; object may already be gone */ }
        }
    }
    await store.deleteFile(c.req.param('id'));
    return c.json({ ok: true });
});
```
Delete the stale comment block that claimed the schema couldn't support this.

### 3. Build
`pnpm --filter @frontbase/backend build`

### 4. Test — `packages/backend/test/storage-delete.mjs` (NEW)
Prove the **object** is gone from the provider, not just the row. Use the P0-PRE injection seam + `memoryStorageProvider` (exposes `_store`, a `Map<'bucket/key', …>`).
```js
import { createConsole } from '../dist/index.js';
import { sqliteRunner, memoryStorageProvider } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const storage = memoryStorageProvider();
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    now: () => `2026-07-12T00:00:${String(clock++).padStart(2, '0')}Z`,
    storageProvider: storage,             // P0-PRE seam
});
const req = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b),
}));

// Bucket + a file WITH real bytes (base64 content path).
await req('PUT', '/storage/buckets/b1', { name: 'B1' });
const content = Buffer.from('hello').toString('base64');
const put = await req('POST', '/storage/buckets/b1/files', { path: 'docs/f.txt', name: 'f.txt', content });
const { id } = await put.json();
check('object present in provider after upload', storage._store.has('b1/docs/f.txt'));

// Delete → BOTH the row AND the object must be gone.
await req('DELETE', `/storage/files/${id}`);
const list = await (await req('GET', '/storage/buckets/b1/files')).json();
check('metadata row removed', list.files.length === 0);
check('BUG-1: real object removed from provider', !storage._store.has('b1/docs/f.txt'));

console.log(failures === 0 ? '\nstorage-delete: PASS ✅' : `\nstorage-delete: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
```
Wire it: add ` && node test/storage-delete.mjs` to the backend `"test"` script (after `storage.mjs`).

**Acceptance:** the 3 checks pass; `pnpm -r test` stays green. Before the fix, the 3rd check MUST fail (verify by temporarily reverting the route — proves the test has teeth).

**Commit:** `fix(backend): BUG-1 storage delete now removes the real object, not just metadata`

---

## P1 — F4b: multipart + presigned-upload path

**Goal:** stop forcing every upload through base64-in-JSON (33% inflation, request-size caps). Add two capabilities: (a) a **presigned PUT URL** so the browser uploads bytes directly to R2/S3; (b) accept **`multipart/form-data`** on the existing upload route for server-proxied uploads.

**Depends on:** P0-PRE (injection seam), and P0 (getFile) landed.

### 1. Add `signedUploadUrl` to the provider interface
**File:** `packages/edge-infra/src/storage/providers.ts`
- Interface (after `signedUrl`, line 20):
  ```ts
  /** A presigned URL the client can PUT bytes to directly (default 15 min). */
  signedUploadUrl(bucket: string, key: string, contentType?: string, expiresInSeconds?: number): Promise<string>;
  ```
- S3 impl (mirror `signedUrl`, but with `PutObjectCommand`):
  ```ts
  async signedUploadUrl(bucket, key, contentType, expiresInSeconds = 900) {
      const client = await getClient();
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      return getSignedUrl(client as never, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: expiresInSeconds });
  }
  ```
- Memory impl: `async signedUploadUrl(bucket, key) { return \`memory://upload/${bucket}/${key}\`; }`

### 2. Route: presigned-upload endpoint
**File:** `packages/backend/src/routes/phase2.ts` (in the STORAGE section)
```ts
// Issue a presigned URL for direct-to-provider upload (F4b). Client PUTs bytes to
// the returned URL, then calls POST .../files with { path, name } to record metadata.
app.post('/storage/buckets/:id/upload-url', async (c) => {
    if (!storage) return c.json({ error: 'storage_not_configured' }, 501);
    const body = await c.req.json().catch(() => null) as { path?: string; contentType?: string } | null;
    if (!body?.path) return c.json({ error: 'validation_failed' }, 400);
    const url = await storage.signedUploadUrl(c.req.param('id'), body.path, body.contentType);
    return c.json({ url, method: 'PUT' });
});
```

### 3. Route: accept multipart on the existing file-create route
**File:** same file, the `app.post('/storage/buckets/:id/files', …)` handler.
Branch on content-type at the top of the handler:
```ts
const ct = c.req.header('content-type') ?? '';
if (storage && ct.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    const path = String(form.get('path') ?? '');
    if (!(file instanceof File) || !path) return c.json({ error: 'validation_failed' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { await storage.put({ bucket: c.req.param('id'), key: path, bytes, contentType: file.type }); }
    catch { return c.json({ error: 'storage_upload_failed' }, 500); }
    const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await store.createFile({ id: fileId, bucketId: c.req.param('id'), path, name: file.name, size: bytes.length, mimeType: file.type }, now());
    return c.json({ id: fileId, ok: true, stored: true });
}
// … existing JSON/base64 path unchanged below …
```
Keep the base64 JSON path as-is (backward compatible).

### 4. Build both packages
`pnpm --filter @frontbase/edge-infra build && pnpm --filter @frontbase/backend build`

### 5. Test — `packages/backend/test/storage-upload.mjs` (NEW)
Cover: presigned-upload-URL returned; multipart upload stores real bytes + a row; base64 path still works.
- Use the injection seam + `memoryStorageProvider`.
- For multipart, build a `FormData` with a `new File([bytes], 'f.txt', { type: 'text/plain' })` and `path`, and `app.fetch` a `Request` with that `body` (do NOT set content-type manually — `FormData` sets the boundary).
- Assert `storage._store.has('b1/docs/f.txt')` after the multipart POST.
Wire into the backend `"test"` script after `storage-delete.mjs`.

**Acceptance:** presigned URL is a non-empty string; multipart round-trips bytes into the provider; existing base64 test (`storage.mjs`) still passes.

**Commit:** `feat(storage): F4b presigned-upload URL + multipart upload path`

---

## P2 — three independent items

Do these in any order; each is self-contained. One commit each.

### P2-a — F7c: Postgres datasource runner

**Goal:** make `kind: 'postgres'` runnable (today it throws `postgres_runner_not_implemented`, `datasource-runner.ts:41`).

1. **Add a `postgresRunner` to edge-infra.** New file `packages/edge-infra/src/providers/postgres.ts`. Use `@neondatabase/serverless` (already an optional/stubbed dep — check `examples/cf-full/build.mjs` OPTIONAL list; it's there). Dynamic-import it (lazy), mirror the `supabaseRunner` shape — return a `DbRunner` with `query(sql, params)` and `exec(sql, params)`:
   ```ts
   import type { DbRunner } from './types.js'; // match the path used by runners.ts
   export interface PostgresOpts { connectionString: string; }
   export function postgresRunner(opts: PostgresOpts): DbRunner {
       let sqlPromise: Promise<any> | null = null;
       const getSql = async () => {
           if (!sqlPromise) sqlPromise = import('@neondatabase/serverless').then(m => m.neon(opts.connectionString));
           return sqlPromise;
       };
       return {
           async query(text, params = []) { const sql = await getSql(); return sql.query(text, params); },
           async exec(text, params = []) { const sql = await getSql(); const r = await sql.query(text, params); return r.length ?? 0; },
       };
   }
   ```
   ⚠️ Verify the neon client's actual call shape against its installed version before finalizing (`node -e "console.log(Object.keys(require('@neondatabase/serverless')))"`). Adjust `query`/`exec` to match. The DbRunner contract is: `query` → array of row objects; `exec` → affected-row count (best-effort).
2. **Export it** from `packages/edge-infra/src/index.ts` next to `supabaseRunner`.
3. **Wire the factory.** `packages/backend/src/db/datasource-runner.ts`:
   - import `postgresRunner`;
   - replace the throwing `case 'postgres':` with `return postgresRunner({ connectionString: String(config.connectionString ?? config.url ?? '') });`
   - add `'postgres'` to `isIntrospectable` (it will use the Postgres-dialect introspection from P2-b; until P2-b lands, introspection returns SQLite-shaped SQL that Postgres rejects → route surfaces opaque error, acceptable interim).
4. **Build** both packages.
5. **Test — `packages/backend/test/postgres-datasource.mjs` (NEW), credential-gated.** Guard on `process.env.POSTGRES_URL`; if unset, print `(postgres: credential-gated — set POSTGRES_URL to run)` and `process.exit(0)`. When set: create a `kind:'postgres'` datasource, list tables, run `SELECT 1`. Mirror `data-studio.mjs`. Wire into the backend test script.

**Commit:** `feat(datasource): F7c Postgres runner (kind:postgres now runnable)`

### P2-b — F7b: per-dialect introspection

**Goal:** `tables`/`columns` work for Postgres + Supabase, not just SQLite. Today the routes hardcode `sqlite_master` + `PRAGMA table_info` (`data-studio.ts:60-83`).

1. **Add a dialect resolver.** In `datasource-runner.ts`, export `dialectOf(kind)`:
   ```ts
   export type Dialect = 'sqlite' | 'postgres';
   export function dialectOf(kind: string): Dialect {
       return (kind === 'supabase' || kind === 'postgres') ? 'postgres' : 'sqlite';
   }
   ```
2. **Branch the introspection SQL** in `data-studio.ts`. The `runnerFor` helper already returns the runner; also thread the `kind`/dialect through (extend `runnerFor` to also return `dialect`). Then:
   - **tables:** sqlite → existing; postgres → `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`.
   - **columns:** sqlite → existing PRAGMA; postgres → `SELECT column_name AS name, data_type AS type, (is_nullable = 'NO') AS "notNull" FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position` (pk detection can be a follow-up — return `pk: false` for postgres for now, note it in a comment).
   - **rows:** the `SELECT * FROM "table" LIMIT ? OFFSET ?` is portable enough; Postgres uses `$1` params though — if the neon client needs `$1`/`$2`, add a tiny param-placeholder swap keyed on dialect, OR keep `?` if the client accepts it (verify).
3. **Build + test.** Extend the P2-a credential-gated `postgres-datasource.mjs` to also assert `columns` returns the expected shape. SQLite path stays covered by `data-studio.mjs`.

**Commit:** `feat(data-studio): F7b per-dialect introspection (postgres information_schema)`

### P2-c — F5b: Vectorize + Workers-deploy provisioning + edge-resource delete cleanup

**Goal:** (1) `vector` kind → Cloudflare Vectorize; `engine` kind → note it's a deploy op; (2) fix the **second orphan bug** — `DELETE /edge-resources/:id` never calls `provisioner.remove` (`phase2.ts:167`), so provisioned D1/KV/Queues leak on delete exactly like BUG-1.

1. **Extend `cloudflareProvisioner`** (`packages/edge-infra/src/provisioning/cloudflare.ts`):
   - `handles`: add `'vector'`.
   - `create`: add `case 'vector'` → `POST /accounts/{id}/vectorize/v2/indexes` with `{ name, config: { dimensions: 768, metric: 'cosine' } }` (make dimensions/metric overridable later; hardcode sane defaults now, note in comment). `remoteId` = the index name.
   - `remove`: add the `vector` branch → `DELETE /accounts/{id}/vectorize/v2/indexes/{name}`.
   - Leave `engine` returning `{ provisioned: false }` but update the file header comment: engine provisioning = a Worker deploy (out of scope; use `frontbase deploy`).
2. **Fix edge-resource delete to call `remove` (orphan-bug fix).** `phase2.ts`, the `app.delete('/edge-resources/:id', …)` handler:
   ```ts
   app.delete('/edge-resources/:id', async (c) => {
       const store = storeFor(c.get('tenant'));
       // De-provision the real resource before dropping the row (mirror of BUG-1 fix).
       if (provisioner) {
           const list = await store.listEdgeResources();
           const res = list.find((r) => String(r.id) === c.req.param('id'));
           if (res && res.config) {
               try {
                   const cfg = JSON.parse(String(res.config));
                   if (cfg.remoteId && provisioner.handles(String(res.kind))) {
                       await provisioner.remove(String(res.kind), String(cfg.remoteId));
                   }
               } catch { /* best-effort */ }
           }
       }
       await store.deleteEdgeResource(c.req.param('id'));
       return c.json({ ok: true });
   });
   ```
3. **Build + test.** Extend `packages/backend/test/provisioning.mjs`: use a mock provisioner whose `remove` records calls; create a resource with `remoteId`, delete it, assert `remove(kind, remoteId)` was called. Add a `vector` case to the mock's `handles`/`create`.

**Commit:** `feat(provisioning): F5b Vectorize + de-provision on edge-resource delete (orphan fix)`

---

## P3 — two items

### P3-a — F5c: Supabase provisioning

**Goal:** create Supabase resources behind the same `Provisioner` interface (today CF-only).

1. New file `packages/edge-infra/src/provisioning/supabase.ts` → `supabaseProvisioner(opts: { accessToken: string; projectRef?: string })`. Supabase Management API base `https://api.supabase.com/v1`, Bearer `accessToken`. Realistic scope for v1: `handles('database')` only → create a Postgres **branch** or **project** is heavy; instead scope to what's cheap and reversible — e.g. provisioning is a no-op stub that validates the token and returns `{ provisioned: false }` UNLESS a concrete, reversible operation is chosen. **Decision needed from senior before building** (see note). Implement whatever operation the senior specifies behind `create`/`remove`/`handles`.
2. Export + add an optional `supabaseProvisioning` dep to `createConsole` that builds it; when both CF and Supabase are configured, compose them (try CF first, then Supabase) — OR keep them mutually exclusive per config. Senior to confirm composition model.
3. Credential-gated test (`SUPABASE_ACCESS_TOKEN`).

⚠️ **This item has an open design question (what CF-cheap-and-reversible operation maps to "provision a Supabase resource").** Do NOT guess — flag it and get a one-line answer before coding `create`.

**Commit:** `feat(provisioning): F5c Supabase provisioner`

### P3-b — F4c + F5d: credential-gated live CI gates

**Goal:** prove the REAL R2/S3 and CF provisioning paths (not just the memory/mock) when creds are present.

1. **`packages/backend/test/storage-live.mjs`** — guard on `STORAGE_ACCESS_KEY` + `STORAGE_SECRET_KEY` + `STORAGE_ENDPOINT` + `STORAGE_BUCKET`. Build a real `s3StorageProvider`, `put`/`get`/`signedUrl`/`delete` a probe object, assert round-trip + that `get` after `delete` throws. Unset → print skip line, exit 0.
2. **`packages/backend/test/provisioning-live.mjs`** — guard on `CF_ACCOUNT_ID` + `CF_API_TOKEN`. Build a real `cloudflareProvisioner`, `create('cache', 'fb-probe-<rand>')` (KV is cheapest/fastest), assert `remoteId`, then `remove('cache', remoteId)`. Unset → skip, exit 0.
3. Wire both into the backend test script (they self-skip without creds, so CI stays green).

**Commit:** `test: F4c/F5d credential-gated live storage + provisioning gates`

---

## Final acceptance for the whole sprint

- `pnpm -r test` — all green (new tests self-skip when credential-gated).
- `pnpm -r test:mutation` — unchanged, all RED-on-break.
- `pnpm --filter @frontbase/example-cf-full smoke` — 10/10, worker still < 1 MB gzip (the new deps are optional/stubbed; confirm the OPTIONAL list in `examples/cf-full/build.mjs` covers `@neondatabase/serverless` — it already should).
- Update the ledger in `phase-3-consolidated-delivery.md`: move BUG-1, F4b, F5b, F7b, F7c, F4c, F5d, F5c to CLOSED (or note the P3-a design-gated status). Bump the "Total to close" line.
- Each commit's message states which follow-up ID it closes.

## Escalate to senior (do not guess)

- **P3-a** Supabase-provisioning operation choice (what maps to "provision") — blocking that item only.
- Any test that needs a schema change (none expected — `storage_files` and `edge_resources` already have the needed columns).
- If `@neondatabase/serverless` call shape differs materially from the sketch in P2-a.
