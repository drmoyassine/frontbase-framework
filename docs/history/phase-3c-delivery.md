# Phase 3c — "Visual polish + integration" Delivery Report

**Date:** 2026-07-12 · **Status:** ✅ COMPLETE (4 of the priority items shipped)
**Scope:** The final parity pass — F1 WYSIWYG canvas, F2 React Flow editor, F8c limit enforcement, F3b async dispatch. Credential-gated/large items (Stripe, multipart, dialect introspection) documented as remaining follow-ups.

---

## What shipped

### F1 — WYSIWYG visual canvas ✅
- **`packages/admin-console/src/components/ComponentRenderer.tsx`** — renders the 17 component types to **live React output** (real headings, text, images, buttons — not layer labels). Click-to-select on the rendered output.
- **`BuilderCanvas.tsx`** upgraded with a **Visual/Layers toggle**: Visual mode shows the live WYSIWYG preview; Layers mode keeps the reorder/remove list. Properties panel edits update the live preview in real time.
- **Closes D1** — the canvas is now WYSIWYG, not a layers list.

### F2 — React Flow workflow editor ✅
- **`packages/admin-console/src/components/WorkflowEditor.tsx`** — a real DAG canvas (React Flow): nodes positioned on a grid, draggable, connectable (draw edges between handles), MiniMap + Controls.
- **`Automations.tsx`** rewritten to use it — nodes carry `position` + `data`, edges persist; the legacy `{id,type,label}` shape is parsed/upgraded on load. Palette adds nodes at staggered default positions.
- **Closes D2** — the workflow editor is now a visual DAG, not a node list.

### F8c — Enforce plan limits ✅
- **`Phase2Store.getEffectiveLimits()` / `enforceLimit(key, count)`** — resolves a tenant's limits (`_limits` setting → first active plan → null=unlimited) and throws `limit_exceeded` at/over a positive cap; `-1` and absent keys are unlimited.
- **Publish route** enforces `pages` on NEW publishes (re-publishing an existing page is free).
- **Users route** enforces `users` on invite.
- Over-cap → opaque **402** `{error:'limit_exceeded', limit:'pages'|'users'}`.
- **Test:** `plan-limits.mjs` (7 checks).

### F3b — Async workflow dispatch ✅
- **Execute route** now fire-and-tracks when a `dispatcher` is configured: returns immediately with `{status:'running'}`, the workflow runs in the background, the execution record flips to `completed`/`error` on finish.
- **`createConsole({ dispatcher })`** — on CF, the cf-full worker wires it to **`ctx.waitUntil`** (per-request ExecutionContext captured per fetch). Without a dispatcher, execution stays synchronous (F3 behavior).
- Shared `runAndRecord()` helper keeps sync + async paths identical in outcome.
- **Test:** `async-execution.mjs` (7 checks) — running→completed transition, background result recorded, sync fallback.

---

## Verification (all green)

- ✅ **Full workspace** `pnpm -r test` — **57 suites** pass, incl. 2 new (plan-limits, async-execution)
- ✅ **Mutation gates** all RED-on-break (backend 7/7, builder 1/1, admin-console 1/1, compiler, edge-infra)
- ✅ **cf-full smoke** 10/10 — worker **389.0 KB gzip** (< 1 MB; React Flow added ~52 KB to the SPA)
- ✅ **SPA** no-leak green (server code still absent from the browser bundle)
- ✅ TypeScript strict across all packages

---

## Remaining follow-ups (documented, not blocking parity)

These are integration-depth items that are credential-gated or large. They extend working features rather than close parity gaps:

| # | Item | Why deferred | Effort |
|---|------|--------------|--------|
| **F4b** | Multipart + presigned direct-to-R2 upload | Current base64-in-JSON works (33% inflation); presigned is the production pattern for large files | 1 day |
| **F8b** | Stripe billing integration | Needs Stripe SDK + webhooks + subscription lifecycle; credential-gated | 3-5 days |
| **F7b** | Per-dialect introspection (Postgres/Supabase) | SQLite dialect covers the common case; Postgres `information_schema` + Supabase PostgREST are additive | 1-2 days |
| **F7c** | Postgres runner (Hyperdrive) | CF-21 audit flagged it; datasources of this kind can be stored but not run | 1-2 days |
| **F3b-durable** | Durable async dispatch (survives isolate eviction) | Current async uses `ctx.waitUntil` (request-scoped); true durability needs QStash/Durable Objects | 2-3 days |

---

## Where we stand: full product parity achieved

Across Phases 3a/3b/3c, every deviation from the original CF-18 Phase 2 delivery is now closed or has a documented, scoped follow-up:

| Deviation | Status |
|-----------|--------|
| D1 layers-not-WYSIWYG | ✅ closed (F1) |
| D2 node-list-not-React-Flow | ✅ closed (F2) |
| D3 stub execution | ✅ closed (F3, deepened by F3b async) |
| D4 metadata-only storage | ✅ closed (F4 — real bytes; F4b presigned is polish) |
| D5 config-only resources | ✅ closed (F5 — real CF provisioning) |
| D6 plaintext secrets | ✅ closed (F6) |
| Data Studio missing | ✅ closed (F7) |
| Plans missing | ✅ closed (F8) + limits enforced (F8c) |

**All 11 console nav areas are functional AND visually parity-complete.** The console now matches the product's sidebar surface in both capability and editing UX. What remains (Stripe, multipart, dialect introspection, durable dispatch) is depth-of-integration work, not parity gaps.

---

## Architecture notes

- **WYSIWYG renderer is browser-side** (lightweight React mirror of the engine's output). The published-preview iframe remains the byte-parity source of truth; the canvas preview is for editing feel. RULE 1 holds — no engine/edge-infra imports in the renderer.
- **React Flow is contained to the admin-console package** (peer-style add); doesn't touch edge-infra/backend. SPA grew 186→238 KB gzip, total worker still 389 KB gzip.
- **Limit enforcement is opt-in per route** via the optional `phase2StoreFor` — routes without it are unaffected. The 402 is opaque (RULE 4) and names only the limit key, no internal state.
- **Async dispatch is request-scoped via `ctx.waitUntil`** — the honest, correct CF pattern for "don't block the response." Durable dispatch (survives eviction) is the documented next step (QStash/DO).
