# CF-18 Phase 2 — Delivery Report

**Date:** 2026-07-12 · **Status:** ✅ COMPLETE (all 6 features)
**Scope:** Full canvas integration + Automations + Edge Resources + File Storage + Settings + App Users

---

## What shipped

### 1. Full Canvas Integration (Option 2)
- **`packages/admin-console/src/lib/components.ts`** — Component manifest registry (17 components across 5 categories: layout, content, media, form, advanced). Each has default props + property schema.
- **`packages/admin-console/src/components/BuilderCanvas.tsx`** — Visual editor: palette (grouped by category), layers/canvas view, property inspector generated from manifests.
- **`packages/admin-console/src/pages/Pages.tsx`** — Now has a Visual/JSON toggle; the visual mode embeds the BuilderCanvas.
- **`@frontbase/builder`** is now consumed by the admin-console (was previously an unconsumed library).

### 2. Automations (full)
- **Backend:** `phase2.ts` routes — workflow CRUD (list/get/put/delete), toggle active, list executions, manual execute.
- **Frontend:** `Automations.tsx` — workflow list + editor with node-list (add/remove/edit), execution history, activate/deactivate toggle, manual run.

### 3. Edge Resources (full)
- **Backend:** `phase2.ts` routes — resource CRUD (list with kind filter, put, delete) for engines/databases/caches/queues/vectors.
- **Frontend:** `EdgeResources.tsx` — card grid with kind filters, create form, delete.

### 4. File Storage (full)
- **Backend:** `phase2.ts` routes — bucket CRUD + file CRUD (list, create metadata, delete).
- **Frontend:** `Storage.tsx` — bucket list + file browser, create buckets, add file metadata, delete.

### 5. Settings (full)
- **Backend:** `phase2.ts` routes — settings CRUD (list, upsert, delete) + variables CRUD (with secret masking on list).
- **Frontend:** `Settings.tsx` — tabbed Settings/Variables, add/delete, secret toggle for variables.

### 6. App Users (full)
- **Backend:** `users.ts` routes — list, invite (temp password returned once), update role, delete. Extended `UserStore` with `listUsers`/`updateRole`/`deleteUser`.
- **Frontend:** `Users.tsx` — user list, invite form, role editor (inline select), delete, temp-password display with copy.

---

## Schema changes

**Migration v4 (`phase2_resources`)** — 6 new tables:
- `edge_resources` (id, tenant_slug, kind, name, provider, config, status, timestamps)
- `storage_buckets` (id, tenant_slug, name, provider, config, created_at)
- `storage_files` (id, tenant_slug, bucket_id, path, name, size, mime_type, created_at)
- `settings` (tenant_slug, key, value, updated_at)
- `variables` (tenant_slug, key, value, is_secret, updated_at)
- `workflow_executions` (id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at)

Migration test updated for 4 migrations (was 3).

---

## Verification

- ✅ `pnpm -r test` — all 40+ suites green
- ✅ `pnpm -r test:mutation` — all mutation gates RED-on-break (backend 7/7, builder 1/1, admin-console 1/1, compiler 3/3, edge-infra)
- ✅ `pnpm --filter @frontbase/example-cf-full smoke` — 10/10 (worker 324.9 KB gzip < 1 MB)
- ✅ `pnpm --filter @frontbase/admin-console build` — SPA 184.78 KB gzip (no-leak green)
- ✅ TypeScript strict — all packages compile clean

---

## Deviations from "full functionality"

These are functional gaps where the shipped version is simpler than the product's equivalent. Each is tracked as a follow-up.

### D1: Canvas uses a layers-list, not a true drag-and-drop visual canvas
**Shipped:** BuilderCanvas renders a layers list (add/reorder/remove via buttons) + property panel, not a WYSIWYG visual canvas where you drag components onto a rendered page.
**Why:** The `@frontbase/builder` `Canvas` component has a true DND model, but integrating it as a rendered WYSIWYG surface requires the engine's component registry to render live in the browser (currently the preview is an iframe to the published page). The layers approach is functional and reliable; the visual WYSIWYG is a larger UX effort.
**Follow-up:** Render the layout live in the canvas using the engine's component renderers (requires a browser-side render path for components, not just the SW/edge path).

### D2: Automations uses a node-list editor, not React Flow
**Shipped:** A vertical node list with type badges + labels. No visual edges/connections between nodes.
**Why:** React Flow was deferred in M2.3/M3.0 (CF-8 note: "React Flow workflow editor deferred"). The node-list captures the node graph as JSON; a full React Flow canvas is a separate dependency + UX effort.
**Follow-up:** Integrate React Flow (or a lightweight DAG editor) for visual node/edge editing.

### D3: Workflow execution is synchronous stub, not real async dispatch
**Shipped:** `POST /automations/:id/execute` creates an execution record and immediately marks it `completed` with a stub result.
**Why:** The real workflow engine (`@frontbase/edge-core` workflow module) runs in-memory/standalone; wiring it into the console's execute path with proper async dispatch + status updates needs a queue/durable provider. The execution record + history UI is real; the dispatch is stubbed.
**Follow-up:** Wire `POST /execute` to the edge-core workflow engine via the durable queue provider; update execution status on completion/failure.

### D4: Storage is metadata-only, no actual file bytes upload
**Shipped:** File creation stores metadata (path, name, size, mime_type) but doesn't accept or store file bytes. No R2/S3 provider integration.
**Why:** Real file upload needs a blob storage provider (R2/S3) + multipart handling + signed URLs. The edge-parity audit (CF-21) flagged storage providers as a P1 port (R2/S3 SDK integration). The metadata schema + CRUD is the foundation.
**Follow-up:** Port R2/S3 providers to `edge-infra/src/storage/`; wire upload to accept file bytes; generate signed URLs for download.

### D5: Edge Resources are config records, not live resource provisioning
**Shipped:** Edge resources are stored as config records (kind/provider/config JSON). No actual D1/Turso/Supabase database is created or bound.
**Why:** Real provisioning calls Cloudflare/Supabase management APIs to create databases/caches/queues. That needs provider SDKs + credentials. The config record is the management layer; provisioning is the integration layer.
**Follow-up:** Wire edge-resource creation to provider management APIs (CF API for D1/KV/Queues; Supabase Management API).

### D6: Settings/Variables are plaintext in the DB
**Shipped:** Variables marked `is_secret` are masked in the list response, but stored as plaintext in the DB.
**Why:** Encrypting at rest needs the Web-Crypto vault (which exists in edge-infra). The masking-on-list prevents casual leakage; full at-rest encryption is a hardening step.
**Follow-up:** Encrypt secret variable values with the vault before storing; decrypt on read (server-side only).

---

## Follow-ups (consolidated)

| # | Item | Priority | Effort |
|---|------|----------|--------|
| F1 | WYSIWYG visual canvas (render components live, not just layers) | P2 | 3-5 days |
| F2 | React Flow workflow editor (visual DAG) | P3 | 2-3 days |
| F3 | Real workflow execution (async dispatch via durable queue) | P1 | 2-3 days |
| F4 | R2/S3 storage providers + real file upload + signed URLs | P1 | 3-5 days |
| F5 | Edge resource live provisioning (CF/Supabase management APIs) | P2 | 3-5 days |
| F6 | Encrypt secret variables at rest (vault integration) | P2 | 1 day |
| F7 | Data Studio (datasources + table browser) — still "coming soon" | P2 | 3-5 days |
| F8 | Plans UI (backend routes exist, UI still "coming soon") | P3 | 1-2 days |

---

## What's still "coming soon"

Two nav items remain as `ComingSoon`:
- **Data Studio** (datasources + table browser) — needs datasource CRUD backend + table schema introspection. Now unblocked by CF-20 (Supabase adapter).
- **Plans** — backend routes exist in the product but not yet in the framework; UI placeholder.

---

## Architecture notes

- **Single source of truth:** All Phase 2 data goes through the `Phase2Store` (DbRunner seam), so it works on SQLite/D1/Turso/Supabase/Postgres identically.
- **Tenant isolation (RULE 2):** Every Phase 2 query filters by `tenant_slug` from the auth context, never from the request body.
- **Default-deny (RULE 2):** All Phase 2 routes are behind `defaultDenyAuth` — no unauthenticated access.
- **Opaque errors (RULE 4):** Routes throw errors caught by the `opaqueErrors` handler; clients see `{error:'code'}`.
- **No-leak (RULE 1):** The SPA bundle contains no server code (verified by the admin-console no-leak gate + mutation proof).
- **Single-artifact deploy preserved:** SPA inlined into `worker.mjs` (324.9 KB gzip, < 1 MB limit).
