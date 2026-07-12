# F5c — Supabase Provisioning: Operation-Mapping Decision Memo

**Date:** 2026-07-13 · **Status:** 🚩 DECISION NEEDED (blocks F5c-ops only)
**For:** senior / product · **From:** implementation
**Context:** `supabaseProvisioner` ships as a token-validating stub (`packages/edge-infra/src/provisioning/supabase.ts`). The interface (`handles`/`create`/`remove`/`validateToken`) + the live token check are done. **The one open question: what Supabase Management API operation should `create()` perform for each edge-resource `kind`?** This memo lays out the concrete options so you can pick. No code ships until a row is chosen.

---

## 1. Why this is a decision, not an implementation detail

The CF provisioner maps cleanly because each kind has a **cheap, fast, reversible** CF primitive:

| kind | CF op | create time | reversible? | cost |
|------|-------|-------------|-------------|------|
| database | Create D1 | ~1s | yes (DELETE) | free tier |
| cache | Create KV namespace | ~1s | yes (DELETE) | free tier |
| queue | Create Queue | ~1s | yes (DELETE) | paid, but instant |
| vector | Create Vectorize index | ~1s | yes (DELETE) | free tier |

Supabase has **no equivalent throwaway primitive**. Its Management API operates at the *project* granularity, and projects are heavy (spin-up in minutes, cost real money, and deleting one is destructive). So "provision a Supabase resource" needs a deliberate mapping choice — the wrong one is slow, expensive, or irreversible.

**The `Provisioner` contract we must satisfy:** `create(kind, name) → { provisioned, remoteId, info }`, `remove(kind, remoteId)`, `handles(kind)`. `remoteId` must be something `remove` can act on. Reversibility matters because the console's delete path (post-BUG-1/orphan-fix) calls `remove` on every delete.

---

## 2. The four candidate mappings

Ordered from most-conservative to most-capable. **Pick one (or a per-kind mix); the rest stay unimplemented.**

### Option A — Schema-per-resource inside ONE existing project (RECOMMENDED)

**Model:** the operator configures **one** Supabase project (its ref + a service key) as the "host." Each edge resource of kind `database` becomes a **dedicated Postgres schema** inside that project (`CREATE SCHEMA frontbase_<slug>`); `vector` becomes a schema with `pgvector` enabled + a vectors table.

| Property | Value |
|----------|-------|
| **create** | `execute_sql`: `CREATE SCHEMA IF NOT EXISTS …` (+ `CREATE EXTENSION vector` for vector) |
| **remoteId** | the schema name |
| **remove** | `DROP SCHEMA … CASCADE` |
| **create time** | <1s |
| **reversible** | ✅ yes, cleanly (drop schema) |
| **cost** | none beyond the one host project (which the operator already pays for) |
| **kinds covered** | `database`, `vector` (cache/queue → config-only) |
| **auth** | uses the existing `supabaseRunner` path + service key — **no Management API needed at all** |

**Why recommended:** it's the *only* option that is cheap + fast + cleanly reversible, and it reuses machinery we already have (`supabaseRunner`, the F6 encrypted-config path). It mirrors exactly how the **product** already scopes Supabase edge state (`frontbase_edge` schema — see `Frontbase-/services/edge/src/storage/SupabaseRestProvider.ts`). "Provision" = carve out a namespace; "de-provision" = drop it. No project lifecycle, no Management-API cost surface.
**Downside:** all resources share one project's compute/storage quota (multi-tenant noisy-neighbor within the host project). Acceptable for the common case; document it.

### Option B — Database branch per resource (Management API, GA-gated)

**Model:** each `database` resource = a Supabase **branch** (`POST /v1/projects/{ref}/branches`) under a configured parent project.

| Property | Value |
|----------|-------|
| **create** | `POST /v1/projects/{ref}/branches { branch_name }` |
| **remoteId** | the branch id |
| **remove** | `DELETE /v1/branches/{id}` |
| **create time** | ~30-90s (branch spin-up) |
| **reversible** | ✅ yes |
| **cost** | **each branch is a billable compute instance** on paid plans |
| **kinds covered** | `database` only |
| **auth** | Personal Access Token (Management API) |

**Why maybe:** true isolation (separate Postgres per resource), native Supabase concept.
**Downside:** slow (breaks the "provisioned in 1s" UX the CF path sets), **costs real money per resource** (a surprise on the bill), requires branching enabled (GA-gated on the org), and the create is async (need polling for "ready"). Heavy for what the console offers.

### Option C — Full project per resource (Management API)

**Model:** each resource = a new Supabase **project** (`POST /v1/projects`).

| Property | Value |
|----------|-------|
| **create** | `POST /v1/projects { name, organization_id, db_pass, region }` |
| **remoteId** | the project ref |
| **remove** | `DELETE /v1/projects/{ref}` (**destructive**) |
| **create time** | **minutes** (project provisioning) |
| **reversible** | ⚠️ technically, but delete destroys a whole project |
| **cost** | **a full project's cost per resource** (expensive) |
| **kinds covered** | `database` (over-scoped for the others) |
| **auth** | PAT + `organization_id` + region |

**Why probably not:** slowest, most expensive, most dangerous delete path. Only makes sense if a "resource" is meant to be a fully isolated environment — which is not what the CF mapping implies. **Not recommended.**

### Option D — Keep the stub (validate-only) permanently

**Model:** `create()` stays `{ provisioned: false }`; the provisioner only validates credentials. Supabase datasources still work (via `supabaseRunner`, F7c/CF-20) — you just can't *provision* Supabase resources from the Edge Resources panel; you point at pre-existing ones.

| Property | Value |
|----------|-------|
| **create** | no-op (validate token only) |
| **kinds covered** | none (provision) — but datasource **use** is unaffected |
| **cost / risk** | zero |

**Why maybe:** if "provision Supabase infra from the console" isn't actually a user need — people bring their own Supabase project and just *connect* it (which already works). Then F5c is "done" as-is and F5c-ops closes as **won't-do**.

---

## 3. Recommendation

**Option A (schema-per-resource in one host project)** for `database` + `vector`; `cache`/`queue`/`engine` stay config-only (Supabase has no native cache/queue). Fall back to **Option D** if you decide console-driven Supabase provisioning isn't a real need.

Rationale: A is the only mapping that preserves the CF path's UX contract (fast, cheap, cleanly reversible), reuses existing code (`supabaseRunner` + encrypted config), and matches the product's own `frontbase_edge`-schema precedent. B and C break the "1-second, free, safe-delete" expectations the rest of the Edge Resources panel sets.

---

## 4. What I need from you (one line)

Pick one:
- **[ ] A** — schema-per-resource (I build it; ~1 day incl. tests; credential-gated live test).
- **[ ] B** — database branch per resource (I build it; ~1.5 days; note the per-branch cost + async polling in the UI).
- **[ ] C** — project per resource (I build it, with a hard confirm-guard on delete; ~1.5 days; flag cost prominently).
- **[ ] D** — keep stub; close F5c-ops as won't-do (0 days; I update the ledger).

If **A** or **D**, no further questions. If **B**/**C**, I'll also need the target `organization_id` (and region for C) as deploy config, and a decision on whether delete requires an explicit UI confirm.

---

## 5. Notes / constraints (apply to whatever you pick)

- **remoteId round-trips through the config** (encrypted, F6) so the delete path can de-provision — same mechanism as the CF fix (P2-c).
- **RULE 1/4 hold:** the token/service key is server-only; provisioning errors surface opaque.
- **`handles(kind)` gates the UI:** whichever kinds the chosen option supports, `handles` returns true for those; the Edge Resources "Add" form already reads it.
- **A needs no Management API** (pure SQL over the service key) — the smallest new surface. B/C need a Personal Access Token, a new credential the operator must mint + store.
