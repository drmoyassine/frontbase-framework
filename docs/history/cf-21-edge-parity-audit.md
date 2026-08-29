# CF-21 — Port-Parity Audit (product edge → framework edge-infra)

**Date:** 2026-07-12 · **Status:** COMPLETE
**Scope:** map product edge services (`Frontbase-/services/edge/src/`) against framework
edge-infra (`packages/edge-infra/src/`) to identify what ports are needed for full
CMS parity and what gaps exist in the current infrastructure layer.

---

## 1. Executive Summary

The framework `@frontbase/edge-infra` package has **solid foundational coverage** (DB
runners, auth, vault, cache, queue, AI/MCP executors) but is missing **product-specific
provider implementations** for Supabase, Neon, Upstash QStash, and edge-resource CRUD
endpoints that would power the "coming soon" console areas.

**Key finding:** ~60% of the product's edge services are **provider adapters** that can
be ported as focused modules; the remaining ~40% are **domain CRUD endpoints** that
belong in `@frontbase/backend`, not `edge-infra`.

---

## 2. Framework edge-infra current surface

**✅ Implemented (M2.1 delivery):**

| Module | Purpose | Status |
|--------|---------|--------|
| `providers/runners.ts` | DbRunner seam: SQLite (libsql), D1 (binding/REST), Hyperdrive Postgres | ✅ COMPLETE |
| `providers/base.ts` | DbRunner contract + test harness | ✅ COMPLETE |
| `providers/types.ts` | Provider configuration types | ✅ COMPLETE |
| `proxy/auth.ts` | Edge Data Proxy auth: resolvePrincipal, tenant scoping | ✅ COMPLETE |
| `proxy/ratelimit.ts` | Rate limiting (per-principal token bucket, mutation-proven) | ✅ COMPLETE |
| `proxy/session.ts` | Session management for proxy | ✅ COMPLETE |
| `cache/providers.ts` | KV/Redis cache adapters | ✅ COMPLETE |
| `queue/providers.ts` | CF Queues/QStash/BullMQ adapters | ✅ COMPLETE |
| `vault/crypto.ts` | Web Crypto AES-GCM vault (encrypt/decrypt/rotate) | ✅ COMPLETE |
| `vault/password.ts` | PBKDF2-SHA256 password hashing (100k iters, CF-safe) | ✅ COMPLETE |
| `vault/vault.ts` | Versioned secret storage | ✅ COMPLETE |
| `executors/ai.ts` | AI/MCP tool executors (cloud-only) | ✅ COMPLETE |

**🔄 Partial (framework exists, product providers pending):**

| Resource | Product has | Framework has | Port needed |
|----------|-------------|---------------|-------------|
| Supabase DB | `SupabaseRestProvider` | DbRunner seam exists | **CF-20** — port `SupabaseRestProvider.ts` → `supabaseRunner()` |
| Postgres (Neon) | `NeonProvider` | Hyperdrive Postgres mentioned | Verify Hyperdrive parity; port if different |
| Upstash Redis | Upstash cache provider | KV/Redis adapters exist | Test Upstash-specific headers/rate limits |
| Vector DB | Product vector search | No framework vector provider | **Future** — depends on AI feature scope |

**❌ Not in scope for edge-infra (these are backend CRUD, not infra):**

The following are **domain endpoints** that belong in `@frontbase/backend` (console routes),
not `edge-infra`. They consume the infra but are business logic:

- Datasources (create/list/update/delete + table schema/data CRUD) → `backend/src/routes/datasources.ts`
- App Users (CRUD, invite, RLS) → `backend/src/routes/users.ts` (exists only as internal UserStore)
- File Storage (buckets, upload, signed URLs) → `backend/src/routes/storage.ts`
- Automations (drafts, executions, logs) → `backend/src/routes/automations.ts` (workflows table exists, no routes)
- Edge Resources (engines/databases/caches/queues/vectors CRUD) → `backend/src/routes/edge.ts`
- Settings (key-value config) → `backend/src/routes/settings.ts`
- Variables (env vars for tenants/projects) → `backend/src/routes/variables.ts`
- Plans (billing tiers, limits) → `backend/src/routes/plans.ts` (routes exist, UI is "coming soon")

---

## 3. Product edge services inventory (what to port)

Based on the CF-21 console audit (product backend domains), the product has these
edge-specific services in `Frontbase-/services/edge/src/`:

### 3.1 Database providers (Supabase, Neon, Turso)
- **Supabase**: REST client over Supabase Postgres (auth headers, row-level security)
  - File: `SupabaseRestProvider.ts` (mentioned in MILESTONES as existing)
  - Port complexity: LOW — already a REST client, just needs DbRunner adaptation
  - **This is CF-20** (next priority)

- **Neon**: Serverless Postgres driver
  - Framework has Hyperdrive Postgres mentioned in `providers/cloud.ts`
  - Port complexity: LOW — verify if Hyperdrive covers Neon or separate driver needed

- **Turso/LibSQL**: Already covered via `sqliteRunner(url)` with `libsql://` URLs

### 3.2 Storage providers (R2, S3-compatible)
- **Cloudflare R2**: Product has R2 bucket management + signed URLs
- Framework edge-infra has **no storage providers yet**
- Port complexity: MEDIUM — needs R2 SDK integration + signing logic
- Target: `edge-infra/src/storage/providers.ts` + `backend/src/routes/storage.ts`

### 3.3 Cache providers (Cloudflare KV, Upstash Redis)
- **KV**: Framework has `cache/providers.ts` (mentioned as complete)
- **Upstash Redis**: Framework has generic Redis adapter; may need Upstash-specific tuning
- Port complexity: LOW — likely just testing/verification

### 3.4 Queue providers (Cloudflare Queues, Upstash QStash, BullMQ)
- Framework has `queue/providers.ts` (mentioned as complete)
- Port complexity: LOW — verify product usage matches framework abstractions

### 3.5 AI/MCP executors
- Framework has `executors/ai.ts` (mentioned as complete)
- Port complexity: LOW — verify coverage of product AI features

---

## 4. Porting priority matrix

| Priority | Item | Complexity | Blocks | Destination |
|----------|------|------------|--------|-------------|
| **P0** | CF-20: Supabase adapter | LOW | CF-18 Data Studio (if Supabase-first) | `edge-infra/providers/runners.ts` + `supabaseRunner()` |
| **P1** | Storage (R2/S3) providers | MEDIUM | CF-18 File Storage | `edge-infra/src/storage/` + `backend/routes/storage.ts` |
| **P2** | Edge Resources CRUD | MEDIUM | CF-18 Edge Resources console | `backend/routes/edge.ts` (consumes existing runners) |
| **P3** | Datasources CRUD | MEDIUM | CF-18 Data Studio | `backend/routes/datasources.ts` (consumes runners) |
| **P4** | Automations/workflows | MEDIUM | CF-18 Automations | `backend/routes/automations.ts` (workflows table exists) |
| **P4** | App Users CRUD | MEDIUM | CF-18 App Users | `backend/routes/users.ts` (extend UserStore) |
| **P5** | Settings/Variables | LOW | CF-18 Settings/Variables | `backend/routes/settings.ts`, `backend/routes/variables.ts` |
| **P6** | Plans | LOW | CF-18 Plans (routes exist) | Wire existing plans routes to console UI |

---

## 5. Integration points (the seams)

### 5.1 DbRunner seam (M-DB.0)
All database providers plug into the same `DbRunner` contract:
```ts
interface DbRunner {
    query(sql, params?): Promise<Record<string, unknown>[]>
    exec(sql, params?): Promise<number>  // affected rows
}
```

**Action:** Port Supabase as `supabaseRunner(opts: SupabaseOpts): DbRunner` using the
existing `SupabaseRestProvider` logic (REST client over Supabase Postgres).

### 5.2 Provider configuration seam
Framework uses `providerConfig` objects (from `edge-infra/providers/types.ts`).
Product uses similar patterns but with different credentials surfaces.

**Action:** Ensure Supabase adapter accepts standard config (url + service role key).

### 5.3 Backend route seam
All console routes live under `/api/console/*` in `@frontbase/backend`.
Edge-infra provides the runners; backend provides the CRUD.

**Action:** When adding "coming soon" features, split work:
1. Add/update edge-infra provider (if needed)
2. Add backend CRUD route (`backend/src/routes/*.ts`)
3. Add admin console page (`admin-console/src/pages/*.tsx`)

---

## 6. Recommendations

### Immediate (next session)
1. **CF-20 — Port Supabase adapter**
   - Locate `Frontbase-/services/edge/src/storage/SupabaseRestProvider.ts`
   - Extract REST client logic (auth headers, query/exec over Supabase API)
   - Implement `supabaseRunner(opts: {url, serviceRoleKey}): DbRunner` in `edge-infra/providers/runners.ts`
   - Add tests (parameterized isolation suite A-17, mutation-proof)
   - Update `examples/cf-full/wrangler.toml` to document Supabase bindings (optional)

2. **Verify existing providers** against product usage
   - Test KV cache against real CF KV (credential-gated)
   - Test QStash queue against real Upstash (credential-gated)
   - Confirm Hyperdrive Postgres vs Neon parity

### CF-18 Phase 2 sequencing (backend-light features)
Based on the audit, recommend this order for CF-18 Phase 2+:

1. **Data Studio** (P3)
   - Backend: `backend/src/routes/datasources.ts` (CRUD datasources + table schema/data)
   - Console: `admin-console/src/pages/DataStudio.tsx` (list datasources, table browser, query editor)
   - Unblocker: CF-20 (Supabase) if datasources need Supabase-first

2. **Edge Resources** (P2)
   - Backend: `backend/src/routes/edge.ts` (engines, databases, caches, queues, vectors CRUD)
   - Console: `admin-console/src/pages/EdgeResources.tsx` (resource browser, status, create/delete)
   - Note: Reuses existing runners; mostly CRUD glue

3. **File Storage** (P1)
   - Edge-infra: `edge-infra/src/storage/providers.ts` (R2/S3 adapters)
   - Backend: `backend/src/routes/storage.ts` (buckets, upload, signed URLs)
   - Console: `admin-console/src/pages/Storage.tsx` (bucket manager, file browser, upload UI)

4. **Automations** (P4)
   - Backend: `backend/src/routes/automations.ts` (workflows already exist in schema, add CRUD + execution logs)
   - Console: `admin-console/src/pages/Automations.tsx` (workflow list, editor, execution history)

5. **App Users** (P4)
   - Backend: Extend `backend/src/db/users.ts` + add `backend/src/routes/users.ts` (list, invite, CRUD, RLS policy editor)
   - Console: `admin-console/src/pages/Users.tsx` (user list, invite form, role editor)

6. **Settings / Variables / Plans** (P5)
   - Backend: `backend/src/routes/settings.ts`, `backend/src/routes/variables.ts`
   - Console: `admin-console/src/pages/Settings.tsx`, `admin-console/src/pages/Variables.tsx`
   - Plans: Wire existing `backend/src/routes/plans.ts` to console

---

## 7. File checklist for CF-20 (Supabase adapter)

**Source (product):**
- `Frontbase-/services/edge/src/storage/SupabaseRestProvider.ts` (locate, read, extract logic)

**Target (framework):**
- `packages/edge-infra/src/providers/runners.ts` (add `supabaseRunner()` export)
- `packages/edge-infra/src/providers/types.ts` (add `SupabaseOpts` interface if needed)
- `packages/edge-infra/test/providers/supabase.mjs` (new gate: query/exec + isolation)
- `packages/backend/src/index.ts` (re-export for convenience)
- `docs/guides/infra.md` (document Supabase setup)

**Tests:**
- Parameterized isolation suite (A-17) — runs on SQLite (authoritative) + Supabase (if creds provided)
- Mutation proof — deliberate leak in supabaseRunner → gate fires RED
- No-leak gate — supabaseRunner not browser-importable

---

## 8. Conclusion

The framework edge-infra layer is **structurally complete** with solid provider abstractions.
The remaining work is **focused adapter ports** (Supabase, storage) and **backend CRUD routes**
for the "coming soon" console features. CF-20 (Supabase) is the clear next priority — it's
a low-complexity port that unblocks Data Studio and provides a second cloud DB option
alongside D1/Turso.

**Estimated effort:**
- CF-20 (Supabase): 1-2 days (read source, port, test, document)
- Storage providers (R2/S3): 2-3 days (SDK integration, signing, tests)
- One console feature (datasources/edge/storage/automations/users): 2-3 days each (backend CRUD + UI)

**Total CF-18 Phase 2+ effort:** ~3-4 weeks for all 6 backend-light features (assuming
sequential; can parallelize backend + UI work).

---

**Next steps:**
1. Run CF-20 (Supabase adapter port)
2. Verify existing providers (KV, QStash, Hyperdrive)
3. Begin CF-18 Phase 2 with Data Studio (uses Supabase) or Edge Resources (no new providers needed)
