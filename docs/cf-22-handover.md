# CF-22 — Handover

**Read this first, then read the source of truth.** This file is a map, not a spec.

- **Source of truth:** [`docs/cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md).
  It is the *only* CF-22 status document — seven earlier ones were folded into it and
  deleted. If any other note conflicts with it, it wins. Start at **§0** (status +
  measured/unmeasured table) and **§8** (the gate worklist).
- **Handed over:** 2026-07-27, at commit `0d26f9e`. CI green (`contracts` workflow).
- **Scope constraint:** self-host / single-tenant / community edition **only**. Cloud
  surfaces (tenants directory, plans, billing, SuperTokens signup/invite, agent quota)
  are out of scope — see §10.

---

## 1. What CF-22 is, in three sentences

The framework's admin console looked far worse than the product's. Rather than copy
400 files of product UI into this repo (a fork that decays), the framework **implements
the product's own OpenAPI contract** and **serves the product's own built console
bundle**. So the work is: make the framework's `/api/*` surface a faithful drop-in for
the product's community FastAPI backend.

## 2. Where things stand

| Gate | State |
|---|---|
| 0 — one source revision | ✅ Closed. Contract + console pins agree; disagreement is a hard error. |
| 1a — response conformance | ✅ Closed. 47 violations → 0, gated in CI. |
| 1b — handler-derived spec | ✅ Closed. Manual registry deleted; deleting a handler turns CI red. |
| **1c — close the measurement gap** | **← start here** |
| 2 — security | 🔴 Open. **Two defects are live in shipped code** (see §5). |
| 3 — behaviour | Open; merges with 1c. |
| 4 — acceptance | Open (Playwright, real CF deploy, owner sign-off). |

**The number to keep honest:**

```
CONFORMS 169 | VIOLATES 0 | UNREACHABLE 32 | NO_SCHEMA 85   →  measured 169/286 (59%)
```

`VIOLATES 0` means nothing without that denominator. 41% of the contract is unmeasured,
and **conformance says nothing about behaviour** — an op that returns a correctly-shaped
constant and ignores its store counts as `CONFORMS`. Do not report CF-22 as "green"
on the strength of a passing gate alone.

## 3. Commands you will actually use

```bash
pnpm -r build && pnpm --filter @frontbase/backend test
```

| What | Command |
|---|---|
| Everything CI runs | `pnpm -r build`, then the four gates below |
| Conformance report (readable) | `pnpm --filter @frontbase/backend run conformance` |
| Conformance report + unreachable list | `node packages/backend/test/compat-conformance.mjs --verbose` |
| Spec staleness gate | `pnpm --filter @frontbase/backend run contracts:check` |
| Drift gate (missing / divergent) | `pnpm run contracts:diff` |
| Console artifact + pin agreement | `pnpm run console:check` |
| Deployable worker, end to end | `pnpm --filter @frontbase/example-cf-full smoke` |
| Mutation gates (22, all must go RED on break) | `pnpm -r test:mutation` |
| Re-vendor the contract | `node scripts/sync-contract.mjs --commit <sha>` |
| Re-fetch the console bundle | `pnpm run fetch:console` |

## 4. Traps — each of these cost real time to find

1. **A 501 stub is a Hono route.** Deriving implemented-ops from a *finished* app counts
   stubs as handlers. Use `implementedOps(app)` (captured pre-stub), never `routedOps`
   on a built app. `implementedOps` throws rather than guessing.
2. **The auth surface is config-dependent.** The ~20 `/api/auth/*` ops register only when
   `sessionSecret` **and** `userStoreFor` are supplied. Any probe omitting them silently
   measures a smaller surface *and still reports clean*. This already happened once.
3. **`core.autocrlf` on Windows fakes staleness.** Generated artifacts get rewritten to
   CRLF on checkout, so byte-comparing gates see phantom edits. Both repos pin the
   relevant paths to LF in `.gitattributes`. Check `git diff --numstat` before believing
   a staleness report.
4. **The contract's `success` is often a list, not a boolean.** Every `edge-*/batch/*`
   op types `success` as the ids processed. Five tags got this wrong independently.
5. **`fastapi==0.139.0` is pinned in the product repo** because the version changes the
   emitted spec. It is part of contract determinism, not an arbitrary pin.
6. **Never hand-maintain a parallel list of ops.** Gate 1b deleted one such registry
   precisely because nothing verified it. Derive from the app.
7. **Trailing slashes are load-bearing.** Register the exact OpenAPI path; do not mount
   sub-apps (they mismatch trailing slashes).

## 5. Live security defects — not fixed, deliberately deferred

The owner sequenced Gate 2 after 1/3/4. Both are in released code:

- [`compat/routes/edge-misc.ts:10`](../packages/backend/src/compat/routes/edge-misc.ts) —
  the raw `fbk_*` API key is stored in the `key_hash` column, and `/reveal` returns it on
  every call. No hashing, no one-time semantics.
- [`compat/routes/auth-compat.ts:101`](../packages/backend/src/compat/routes/auth-compat.ts) —
  `reset-password` returns `success: true` while performing zero password mutations.

If you are about to ship or demo publicly, raise these first.

## 6. What to do next

**Gate 1c(1) — fixtures.** Drive `UNREACHABLE` from 32 to 0. 28 are 404s on nested param
routes where the probe's id pool cannot supply the right id (a version id, a sub-resource
id). By tag: pages 8, actions 4, variables 3, edge-providers 2, edge-engines 2,
auth-forms 2, then one each across storage / edge-{vectors,queues,databases,caches,api-keys}.
Plus 2×400, 1×401, 1×422. The pool lives at the top of
`packages/backend/test/compat-conformance.mjs` and currently keys by collection only.

**Then Gate 1c(2) + Gate 3 as ONE pass.** Classifying an op as `functional` requires
proving a write is observable in a read — that *is* the behavioural test. Derive the
`stub | shape-only | functional | external-disabled` status; **do not hand-annotate it**
(see trap 6). Order: Authentication/security → Storage/data → Actions → Edge lifecycle →
Agent/MCP.

Rationale for this sequencing is in §8 *Sequencing (revised 2026-07-27)*.

## 7. Repo layout you need

| Path | What |
|---|---|
| `packages/backend/src/compat/` | The whole compat surface: `app.ts` (assembly), `spec.ts` (derivation), `stubs.ts`, `routes/*` |
| `packages/backend/src/compat/routes/edge-shapes.ts` | Shared response shapes — fix once, lands everywhere |
| `packages/backend/contracts/` | Vendored product contract + `PRODUCT_COMMIT` pin + emitted `framework.openapi.json` |
| `packages/backend/test/compat-conformance.mjs` | The conformance probe/gate |
| `packages/backend/test/routed-ops.mjs` | Proves `x-implemented` is derived |
| `examples/cf-full/` | The deployable worker + smoke suite |
| `examples/cf-full/console-dist/` | Console shell (committed) + bundles (gitignored) — see §6a of the source of truth |
| `scripts/console-pin.mjs` | Three-level artifact validation (`pin` / `shell` / `deploy`) |

The product repo is a **local sibling checkout** (`../Frontbase-`, default). Several
scripts need it; there is no network fetch.
