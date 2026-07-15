# CF-22 P1 — Product-Compat Surface + Drift Gate Delivery Report

**Date:** 2026-07-15 · **Status:** ✅ DELIVERED (all gates green)
**Repo:** framework `frontbase-framework` (`packages/backend`)
**Parent plan:** [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) §5a · **P0 report:** [`cf-22-p0-delivery.md`](./cf-22-p0-delivery.md)

> P1's job: after P0 produced the product's committed contract, the framework
> now **emits its own spec** for a product-compatible `/api` surface, **diffs it**
> against that contract, and ships **one fully-implemented tag** as proof the
> pipeline works end-to-end. The drift gate's burn-down table is P2's worklist.

---

## 1. Headline

| Metric | Result |
|---|---|
| Vendored contract | product community spec **pinned to `afe9e03`** (284 ops / 202 schemas / 31 tags) + vendored zod |
| Framework emitted spec | **deterministic** `contracts/framework.openapi.json`, all **284 ops** declared |
| Drift gate | **PASS** — 0 missing, 0 divergent (6 implemented `variables` / 278 stubbed) |
| Proof tag | **`variables`** — 6 ops real, responses validated against vendored Zod |
| Mutation proof (RULE 8) | deleted op → MISSING detected; corrupted schema → DIVERGENT detected |
| Backend suite | **22 suites green** (4 credential-gated live suites skip), incl. 2 new (compat-variables 9/9, contract-diff 3/3) |
| CI | `.github/workflows/contracts.yml` — staleness + drift + suite + mutation |

The drift gate's per-tag table **is** the P2 burn-down chart (every tag shows
`implemented / stubbed`); P2 drives the stubbed count to zero, tag by tag.

---

## 2. Deliverables (D1–D5)

### D1 — Contract vendoring (`packages/backend/contracts/`)
- `openapi.community.json` + `template-registry.json` (the record) +
  `PRODUCT_COMMIT` (pin `afe9e03`).
- Vendored `zod.gen.ts` → `src/compat/zod.gen.ts` (compiled; `rootDir` is `src/`).
- Vendored spec **embedded** as `src/compat/community-spec.ts` — Workers-safe
  (the runtime can't `node:fs`; see §5 lesson).
- `scripts/sync-contract.mjs`: one command re-vendors from a product checkout
  (`--product`/`--commit`), updates the pin, regenerates the embedded copy.

### D2 — Compat surface (`packages/backend/src/compat/`)
- `createCompatApp()` — a Hono app serving the product's `/api/*` paths, **behind
  `defaultDenyAuth` from the first route** (RULE 2). Coexists with `/api/console`
  until P3 cuts the SPA over.
- `registerStubs(app, implemented)` — **table-driven 501 stubs**: iterates the
  vendored spec, registers one stub per non-implemented op. Adding stubs is
  automatic (re-vendor); removing one is a deliberate deletion the gate catches
  as MISSING.
- `IMPLEMENTED` registry — the 6 `variables` op keys (P2 grows this set).
- No sub-app mounts: routes are registered with the **exact product paths**
  (incl. trailing slashes) — a sub-app mount mismatched the trailing slashes the
  product client calls verbatim (§5 lesson).

### D3 — Spec emission + drift gate
- `scripts/emit-openapi.mjs` → `contracts/framework.openapi.json` (deterministic;
  `--check` = staleness gate).
- `scripts/contract-diff.mjs` — **native-Node comparator** (the npm `oasdiff` is a
  `0.0.1-security` placeholder; a dependency-free comparator is more robust for CI
  and gives the exact semantics needed). Resolves `$ref`, ignores key order +
  the framework-only `x-implemented` flag. **MISSING / DIVERGENT → FAIL**;
  `x-implemented: false` stubs = the burn-down (reported, not failed). Emits the
  per-tag conformance table.
- `test/contract-diff.mjs` — proves the gate GREEN on the committed specs and
  **RED on deliberate breaks** (RULE 8).

### D4 — Proof tag `variables`
- `routes/variables.ts` — real handlers for all 6 ops, request bodies validated
  against the vendored `zVariableCreateRequest`/`zVariableUpdateRequest`, responses
  shaped to the product `VariableResponse`.
- `store.ts` (`TemplateVariableStore`) + migration **v7** (`template_variables`) +
  `schema.ts` entry — the product's formula-variable model, persisted via the
  existing `DbRunner` seam.
- `template-registry.ts` — the product's static registry **vendored** (captured
  from the product's `/api/variables/registry/`).
- `test/compat-variables.mjs` (9/9) — exercises the product client's exact call
  shapes and `zVariableResponse.parse()`s every response; also pins stub→501 and
  unauth→401.

### D5 — Mutation proof
- `test/contract-diff.mjs` deletes one op → gate exits 1 (`missing=1`); corrupts
  one schema → gate exits 1 (`divergent=N`). The gate provably detects both
  failure classes.

---

## 3. Verification (all machine-checkable)

```
contracts:check (staleness) ......... framework.openapi.json up to date
contracts:emit determinism ......... byte-identical across runs
contracts:diff (drift gate) ........ 6 implemented, 278 stubbed, 0 missing, 0 divergent — PASS
compat-variables ................... 9/9 passed
contract-diff (gate + mutation) .... 3/3 passed
backend suite ...................... 22 suites PASS (4 live suites SKIP no creds)
pnpm -r build ...................... all packages incl. cf-full (435.9 KB SPA)
```

---

## 4. Spec deviation — `@hono/zod-openapi` → plain Hono + vendored zod (the documented fallback)

§5a specified `@hono/zod-openapi` with derived Zod schemas. Its latest version
pulls `@asteasolutions/zod-to-openapi@8.x`, which **requires zod v4**; the
framework (compiler + edge-core + all suites) is on **zod 3.25**. Upgrading the
whole framework to zod 4 is far out of P1 scope, so the §5a "Risks" fallback was
taken: **plain Hono + the vendored `zod.gen.ts` (zod v3) for runtime validation
+ vendored JSON-Schema for emission.** Same derivation guarantee (the contract is
the single source for both validation and the emitted spec), no version churn.
The drift gate's divergence detection is proven by the mutation test; the live
`variables` tag reuses the vendored schema so it is trivially conformant — P2
tags that hand-write schemas get real divergence checking.

---

## 5. Lessons (for the P2 implementer)

- **Workers-safe runtime:** the backend runs in a CF Worker — **no `node:fs` /
  `node:crypto`**. The vendored spec + registry are embedded as `.ts` modules,
  and IDs use the Web-Crypto `crypto.randomUUID()` global. Any new compat code
  must stay Workers-clean.
- **Exact paths, no sub-app mounts:** the product client calls OpenAPI paths
  verbatim, trailing slashes included (`/api/variables/{id}/`). Register compat
  routes with the full exact path on the main app; a `app.route('/api/x', sub)`
  mount mismatches the trailing slash and 404s.
- **`JSON.stringify(x, keyArray, 2)` is a trap:** an array-replacer filters keys
  at *every* nesting level, silently emptying nested objects. Determinism comes
  from deterministic insertion order, not a replacer.
- **Migration count is a test literal:** adding migration v7 required bumping the
  `migrateDown(a, 6)` / `[1..6]` literals in `test/migrations.mjs` to 7.

---

## 6. The P2 worklist (from the gate's burn-down table)

278 ops across 30 tags remain stubbed, ordered roughly by framework-primitive
readiness (P2 §5b waves): `Edge Engines` (33), `Actions` (24), `storage` (23),
`Authentication` (18), `edge-providers` (18), `pages` (17), `agent-integrations`
(15), `rls` (14), `settings` (12), `database`/`edge-databases` (10 each), … down
to `variables` (**6 — done**). Implementing a tag = move its ops into `IMPLEMENTED`,
write handlers reusing vendored Zod + existing framework stores, run `contracts:diff`
until the tag goes green.

---

## 7. File inventory

**New (`packages/backend/src/compat/`):** `app.ts`, `stubs.ts`, `registry.ts`,
`spec.ts`, `store.ts`, `zod.gen.ts` (vendored), `community-spec.ts` (vendored,
embedded), `template-registry.ts` (vendored, embedded), `routes/variables.ts`.

**New (contracts/scripts/test):** `contracts/{openapi.community.json,
framework.openapi.json, template-registry.json, PRODUCT_COMMIT}`,
`scripts/{emit-openapi.mjs}`, `test/{compat-variables.mjs, contract-diff.mjs}`,
root `scripts/{sync-contract.mjs, contract-diff.mjs}`, `.github/workflows/contracts.yml`.

**Modified:** `db/migrations.ts` (v7), `db/schema.ts` (`templateVariables`),
`src/index.ts` (exports), `package.json` (scripts), root `package.json` (scripts),
`test/migrations.mjs` (count literal 6→7).

---

## 8. Unblocks

- **P2 (#108):** implement the 30 remaining tags, wave by wave, against the gate's
  burn-down table.
- **P3 (#109):** mount `createCompatApp()` at `/api` in the cf-full worker
  (path reconciliation with `/api/console` + the engine's `/api/*` proxy), then
  serve the product community console bundle.

> **Re-sync note:** the product's `op_responses.py` schema refactor (parallel
> session) will change the vendored spec when it lands on product `main`. Re-run
> `pnpm contracts:sync` → `contracts:emit` → `contracts:diff`; the gate will show
> the new product shapes vs the framework's stubs (the drift alarm working).
