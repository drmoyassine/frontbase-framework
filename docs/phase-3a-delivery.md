# Phase 3a — "Make it real" Delivery Report

**Date:** 2026-07-12 · **Status:** ✅ COMPLETE (all 4 features)
**Scope:** Close deviations D3–D6 from CF-18 Phase 2 — turn the stub/config-only features into real, wired implementations.

---

## What shipped

### F6 — Encrypt secret variables at rest (D6) ✅
- **`packages/backend/src/db/secret-cipher.ts`** — `SecretCipher` over the Web-Crypto vault (AES-256-GCM, HKDF-derived key). Idempotent (`enc:` prefix prevents double-encrypt); legacy plaintext passes through.
- **Phase2Store** now encrypts secret variables on write, decrypts on read (`getVariable`), keeps non-secrets plaintext.
- **createConsole** builds the cipher from `sessionSecret` (or a dedicated key); falls back to `noopCipher` in dev.
- **Test:** `secret-cipher.mjs` (14 checks) — round-trip, wrong-key rejection, at-rest ciphertext, idempotent, noop fallback.

### F3 — Real workflow execution (D3) ✅
- **`POST /automations/:id/execute`** now runs the workflow through the **real edge-core workflow engine** (`executeWorkflow`), not a stub.
- Loads the workflow, validates the graph, executes nodes in topological order, records the **actual** result/error in `workflow_executions`.
- Refuses inactive workflows (409) and missing ones (404); failed runs still record an `error` execution.
- **Test:** `automations.mjs` (14 checks) — real run (trigger→transform), result captured, inactive/missing guards, invalid-graph error path.

### F4 — R2/S3 storage providers + real upload (D4) ✅
- **`packages/edge-infra/src/storage/providers.ts`** — `StorageProvider` interface + `s3StorageProvider` (S3-compatible: R2/S3/B2/MinIO via `endpoint` config) + `memoryStorageProvider` (tests/dev).
- AWS SDK dynamic-imported (lazy client) — only loads when storage is used; added to cf-full's optional-stub list so the edge artifact stays self-contained.
- **Storage routes** now accept base64 `content` (real bytes), serve raw download (`GET .../raw`), and issue presigned URLs (`GET .../url`). Metadata-only when no provider.
- **createConsole** builds the provider from `deps.storage` (access key/secret/endpoint).
- **Test:** `storage.mjs` (7 checks) — provider round-trip, content-type, signed URL, delete, metadata route, base64 decode.

### F5 — Edge resource live provisioning (D5) ✅
- **`packages/edge-infra/src/provisioning/cloudflare.ts`** — `Provisioner` interface + `cloudflareProvisioner` (CF Management REST API: database→D1, cache→KV, queue→Queues) + `noopProvisioner`.
- Plain `fetch` (no SDK) — the CF API is REST; token-based auth.
- **Edge-resource create** provisions a REAL resource when the provisioner handles the kind; merges `remoteId` into config; falls back to config-only otherwise. Provisioning failure → opaque 502.
- **createConsole** builds the provisioner from `deps.provisioning` (accountId/apiToken).
- **Test:** `provisioning.mjs` (10 checks) — mock provisioner interface, noop fallback, config-only create, kind-handling logic.

---

## Verification (all green)

- ✅ **Full workspace** `pnpm -r test` — 43+ suites green, incl. 4 new (secret-cipher, automations, storage, provisioning)
- ✅ **Mutation gates** `pnpm -r test:mutation` — all RED-on-break (backend 7/7, builder 1/1, admin-console 1/1, compiler, edge-infra)
- ✅ **cf-full smoke** 10/10 — worker **329.5 KB gzip** (< 1 MB); AWS SDK correctly stubbed as optional
- ✅ **TypeScript strict** across all packages

---

## Deviations remaining (D1–D2 carry to Phase 3c; new gaps below)

### Carried forward (unchanged from Phase 2)
- **D1** Canvas is layers-list, not WYSIWYG → Phase 3c (F1)
- **D2** Automations is node-list, not React Flow → Phase 3c (F2)

### New deviations introduced/closed in 3a

#### F3 — Execution is synchronous, not async-via-queue
**Status:** Real execution (the engine runs), but synchronous in the request handler — the HTTP request blocks until the workflow completes (bounded by the engine's `execution_timeout_ms`).
**Why:** True fire-and-forget async dispatch needs the durable queue provider wired to a background runner. The engine + execution record/history are fully real; only the dispatch model is sync.
**Follow-up (F3b):** Wire `POST /execute` to enqueue via `qstashWorkflowProvider` (or a Durable Object), update status on completion. Effort ~1-2 days.

#### F4 — Upload is base64-in-JSON, not multipart
**Status:** Real bytes round-trip, but encoded as base64 in the JSON body (not `multipart/form-data`).
**Why:** Matches the existing opaque-error JSON envelope; simpler for the SPA client. base64 inflates size ~33%.
**Follow-up (F4b):** Add a multipart upload route for large files (presigned direct-to-R2 upload is the production pattern). Effort ~1 day.

#### F4 — Live R2/S3 not exercised in CI
**Status:** The S3 provider is unit-tested via the memory provider (same interface); the real R2/S3 path is credential-gated (needs `STORAGE_ACCESS_KEY`/`SECRET`/`ENDPOINT`).
**Follow-up:** Add a credential-gated live test (mirrors the D1/Supabase runner pattern). Effort ~0.5 day.

#### F5 — Only CF-native kinds provisioned (database/cache/queue)
**Status:** `engine` and `vector` kinds return config-only (no clean single CF API: engine = Worker deploy, vector = Vectorize).
**Why:** Honest scoping — the 3 high-value kinds (D1/KV/Queues) cover the common case; the rest stay config-only.
**Follow-up (F5b):** Add `vector` → Vectorize, `engine` → Workers deploy. Effort ~2 days.

#### F5 — Supabase provisioning not implemented
**Status:** Only Cloudflare provisioning shipped; Supabase Management API (different auth flow) is deferred.
**Follow-up (F5c):** Add a Supabase provisioner behind the same `Provisioner` interface. Effort ~2 days.

#### F5 — Live CF provisioning not exercised in CI
**Status:** The CF provisioner is tested via a mock (same interface); real provisioning is credential-gated (`CF_ACCOUNT_ID`/`CF_API_TOKEN`).
**Follow-up:** Add a credential-gated live test. Effort ~0.5 day.

---

## Follow-ups (consolidated, post-3a)

| # | Item | Phase | Effort |
|---|------|-------|--------|
| F3b | Async workflow dispatch via durable queue | 3c polish | 1-2 days |
| F4b | Multipart + presigned direct-to-R2 upload | 3c polish | 1 day |
| F4c | Credential-gated live R2/S3 test | hardening | 0.5 day |
| F5b | Vector→Vectorize, engine→Workers deploy | 3c/future | 2 days |
| F5c | Supabase provisioner | future | 2 days |
| F5d | Credential-gated live CF provisioning test | hardening | 0.5 day |
| F1 | WYSIWYG visual canvas | 3c | 3-5 days |
| F2 | React Flow workflow editor | 3c | 2-3 days |
| F7 | Data Studio (datasources + table browser) | 3b | 3-5 days |
| F8 | Plans UI | 3b | 1-2 days |

---

## Architecture notes

- **All new providers are optional + lazy.** Storage (AWS SDK) and provisioning (CF API) are dynamic/conditional — the package builds and boots without them; they load only when credentials are configured. The cf-full edge artifact stubs the AWS SDK as optional (329.5 KB gzip, self-contained).
- **Single seam per concern:** `StorageProvider`, `Provisioner`, `SecretCipher` — each pluggable, each with a noop/default for dev. The `Phase2Store` and routes depend on the interfaces, not implementations.
- **RULE 1 (no-leak):** all new code is server-only (edge-infra/backend). Verified by the existing no-leak gates + the cf-full optional-stub.
- **RULE 2 (default-deny + tenant scope):** all new routes sit behind `defaultDenyAuth`; all store queries filter by `tenant_slug`.
- **RULE 4 (opaque errors):** storage/provisioning failures surface as `storage_upload_failed` / `provisioning_failed` / `storage_not_configured` — no secret leakage.
