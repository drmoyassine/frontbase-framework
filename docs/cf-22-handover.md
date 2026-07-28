# CF-22 — Handover

**Read this first, then read the source of truth.** This file is a map, not a spec.

- **Source of truth:** [`docs/cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md).
  It is the *only* CF-22 status document — seven earlier ones were folded into it and
  deleted. If any other note conflicts with it, it wins. Start at **§0** (status +
  measured/unmeasured table) and **§8** (the gate worklist).
- **Original handover:** 2026-07-27, at commit `0d26f9e`. Resumed locally through
  2026-07-28: Gates 1c, 2, and 3 are locally closed in one reproducible runner;
  remote CI awaits the next commit.
- **Implementing what is left:** [`cf-22-closure-plan.md`](./cf-22-closure-plan.md) —
  the 48 `/api/sync` ops, scheduled drift, `/api/console/*` retirement, deploy proof,
  and the definition of done. That document supersedes §6 below.
- **Scope constraint:** self-host / community edition **only**. Cloud services
  (billing, SuperTokens, provider-delivered signup/invite, agent quota) are out of
  scope; the compat layer now supplies local signup and one-time invite behavior.

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
| **1c — close the measurement gap** | ✅ Closed locally. 286/286 behavior-classified and negative-audited. |
| 2 — security | ✅ Closed locally. API-key/reset/session controls, tenant matrix, and mutation proofs are green. |
| 3 — behaviour | ✅ Closed for the recorded community scope: 163 functional, 10 deliberate shape-only, 113 explicit external-disabled. |
| 4 — acceptance | Open (Playwright, real CF deploy, owner sign-off). |

**The number to keep honest:**

```
CONFORMS 286 | VIOLATES 0 | UNREACHABLE 0 | NO_SCHEMA 0
EXTERNAL_DISABLED 0 | STUB 0   →  response-validated 286/286 (100%)
```

All operations now have a usable response contract and a reachable implementation:
named JSON
models, validated inline schemas, text/SSE/CSV, or explicit bodyless responses.
**Conformance still says nothing about behaviour** — an op that returns a
correctly-shaped constant and ignores its store counts as `CONFORMS`. Do not report
CF-22 as "green" on the strength of a passing shape gate alone.

## 3. Commands you will actually use

```bash
pnpm -r build && pnpm --filter @frontbase/backend test
```

| What | Command |
|---|---|
| Everything CI runs | `pnpm -r build`, then the four gates below |
| Complete CF-22 Gates 1c/2/3 | `pnpm --filter @frontbase/backend run gate:cf22` |
| Conformance report (readable) | `pnpm --filter @frontbase/backend run conformance` |
| Conformance report + unreachable list | `node packages/backend/test/compat-conformance.mjs --verbose` |
| Auth/security behavior gate | `pnpm --filter @frontbase/backend run behavior:auth` |
| Spec staleness gate | `pnpm --filter @frontbase/backend run contracts:check` |
| Drift gate (missing / divergent) | `pnpm run contracts:diff` |
| Console artifact + pin agreement | `pnpm run console:check` |
| Deployable worker, end to end | `pnpm --filter @frontbase/example-cf-full smoke` |
| Mutation gates (all must go RED on break) | `pnpm -r test:mutation` |
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

## 5. Security closure

The two previously live defects are closed. API keys now persist a SHA-256 verifier
and separately encrypted reveal material; reveal is tenant-scoped, audited, atomic,
and one-time. Password-reset capabilities are delivered out of band, stored only as
hashes, expire, cannot be replayed, change the password, and invalidate older
framework-issued sessions. Migration v14 adds the required state without
reinterpreting legacy plaintext. `compat-security`, the auth behavior gate, the
139-operation tenant matrix, and six new mutations enforce these properties.

## 6. What to do next

**Gate 1c(1) + response-schema coverage are closed.** The probe creates a fresh
resource chain per operation; `UNREACHABLE 32 → 0`, then named/inline/text/bodyless
validation moved `CONFORMS 198 → 283` and `NO_SCHEMA 85 → 0`. The gate now fails on
a violation, unreachable op, or missing usable response contract. This pass also
corrected product media contracts for CSV and three SSE endpoints, then repaired the
framework list/bodyless/stream responses those stronger validators exposed. Do not
restore the old collection-level id pool: deletes made it order-dependent and it could
not represent nested version or execution ids.

**Gates 1c(2), 1c(3), 2, and 3 now run as one command.** Runtime observations derive
and fingerprint all 286 behavior statuses at `163 functional / 10 shape-only /
113 external-disabled / 0 stub`. The negative sweep audits every operation; the
generated two-tenant matrix exercises every identifier-bearing operation. The next
work is Gate 4 only: browser acceptance, a fresh Cloudflare deployment, scheduled
cross-repo drift, and owner sign-off.

Rationale for this sequencing is in §8 *Sequencing (revised 2026-07-27)*.

## 7. Repo layout you need

| Path | What |
|---|---|
| `packages/backend/src/compat/` | The whole compat surface: `app.ts` (assembly), `spec.ts` (derivation), `stubs.ts`, `routes/*` |
| `packages/backend/src/compat/routes/edge-shapes.ts` | Shared response shapes — fix once, lands everywhere |
| `packages/backend/contracts/` | Vendored product contract + `PRODUCT_COMMIT` pin + emitted `framework.openapi.json` |
| `packages/backend/test/compat-conformance.mjs` | The conformance probe/gate |
| `packages/backend/test/compat-behavior-auth.mjs` | Derived authentication/security round-trip gate |
| `packages/backend/contracts/behavior.auth.json` | Gated, generated auth/security classification |
| `packages/backend/contracts/behavior.summary.json` | Fingerprint and counts for the runtime-derived 286-operation ledger |
| `packages/backend/test/compat-negative.mjs` | Contract-derived wrong-type/missing-field/path/query sweep |
| `packages/backend/test/compat-tenant-matrix.mjs` | Generated 139-operation two-tenant isolation matrix |
| `packages/backend/test/cf22-gates.mjs` | One-command Gates 1c/2/3 runner |
| `docs/cf-22-no-schema-audit.md` | Per-operation ledger for the closed `NO_SCHEMA 85` |
| `packages/backend/test/routed-ops.mjs` | Proves `x-implemented` is derived |
| `examples/cf-full/` | The deployable worker + smoke suite |
| `examples/cf-full/console-dist/` | Console shell (committed) + bundles (gitignored) — see §6a of the source of truth |
| `scripts/console-pin.mjs` | Three-level artifact validation (`pin` / `shell` / `deploy`) |

The product repo is a **local sibling checkout** (`../Frontbase-`, default). Several
scripts need it; there is no network fetch.
