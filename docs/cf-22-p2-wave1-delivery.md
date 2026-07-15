# CF-22 P2 Wave 1a — Console-Core Tags Delivery Report

**Date:** 2026-07-15 · **Historical status:** ✅ DELIVERED against the route/shape gate<br>
**Current audited status:** ⚠️ BEHAVIORAL ACCEPTANCE REOPENED with the rest of P2
**Repo:** framework `frontbase-framework` (`packages/backend/src/compat`)
**Parent:** [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) §5b ·
**P1 report:** [`cf-22-p1-delivery.md`](./cf-22-p1-delivery.md)

> The 2026-07-15 end-to-end audit found that the binary registry/spec gate does
> not validate handler behavior. This wave remains useful implementation work,
> but its unconfigured/ack paths need exact-client behavior tests before P2 can
> close. See [`cf-22-p0-p3-audit.md`](./cf-22-p0-p3-audit.md).

> P2 is wave-scaled (5 waves, ~278 ops). This ships **Wave 1a** — the small,
> primitive-backed console-core tags — proving the wave pattern (implement →
> vendored-Zod conformance → drift gate green) scales, before the larger tags.

---

## 1. Headline

| Metric | Before (P1) | After (Wave 1a) |
|---|---|---|
| Implemented ops | 6 (`variables`) | **29** (+23) |
| Stubbed ops | 278 | 255 |
| Drift gate | PASS | **PASS** (0 missing, 0 divergent) |
| Tags fully green | 1 | **6** (variables + Meta, settings, Themes, project, security-events) |
| Conformance suite | compat-variables 9/9 | + **compat-wave1 7/7** |

Every Wave-1a response is validated against the **vendored contract Zod** (the
product's own schema) — conformance to reality, not to taste.

---

## 2. What shipped (+23 ops)

| Tag | Ops | Backed by |
|---|---|---|
| **Meta** (3) | `GET /`, `GET /health`, `GET /api/queue/health` | static health shapes; **unauthenticated** (registered before `defaultDenyAuth`) |
| **settings** (12) | general/privacy/security/redis GET+PUT, redis/test, telemetry, validate-license, invites | new `KeyValueStore` on the existing `settings` table (one JSON blob per domain); action endpoints return graceful community acks (no Redis/license/email) |
| **Themes** (3) | list/create/delete | new `themes` table (migration v8) + `ThemesStore`; `styles_data` JSON |
| **project** (3) | GET/PUT project record, branding upload | `KeyValueStore` ("project"); upload stores metadata (F4 object-storage lands Wave 2) |
| **security-events** (2) | list/summary | new `security_events` table (migration v8) + `SecurityEventsStore` |

**Migration v8** (`themes_and_security_events`) — append-only, idempotent, with
matching `schema.ts` entries; `test/migrations.mjs` count literal bumped 7→8.

---

## 3. Verification (all machine-checkable)

```
contracts:check (staleness) ......... framework.openapi.json up to date
contracts:emit determinism ......... byte-identical
contracts:diff (drift gate) ........ 29 implemented, 255 stubbed, 0 missing, 0 divergent — PASS
compat-variables (P1) .............. 9/9
compat-wave1 (new) ................. 7/7  (every response zod-parsed)
contract-diff (gate + mutation) .... 3/3
backend suite ...................... 25 markers PASS (4 live suites SKIP no creds)
pnpm -r build ...................... all packages incl. cf-full (435.9 KB SPA)
```

The contract-diff test was made **wave-resilient** (asserts ≥ the P1 baseline,
not a hardcoded count) so future waves don't need to touch it.

---

## 4. Honest scope

- **Remaining Wave 1:** pages (17) — the Builder Studio, largest primitive-backed
  tag — plus database (10) and rls (14), which need datasource-adapter mapping.
  These are Wave 1b.
- **Graceful acks, not silent stubs:** settings action endpoints (redis/test,
  validate-license, invites) return the product's ack shapes reporting
  not-configured/unsupported — conformant for a single-tenant community worker
  with no Redis/license/email. Verified against the vendored Zod, not invented.
- **Branding upload** stores metadata only; real object storage (F4b) wires in Wave 2.

---

## 5. The burn-down (P2's remaining worklist)

```
Edge Engines 33 · Actions 24 · storage 23 · Authentication 18 · edge-providers 18 ·
pages 17 · agent-integrations 15 · rls 14 · settings✓ · database 10 ·
edge-databases 10 · Engine Inspector 8 · edge-caches/queues/vectors/gpu 7 ea ·
Auth Forms 7 · Agent MCP 6 · variables✓ · edge-api-keys 5 · edge-agent-profiles 4 ·
Cloudflare Deploy 4 · edge-agent-profiles 4 · Meta✓ · Agent/Agent Settings/Themes✓/
Cloudflare Inspector 3 ea · project✓ · security-events✓ · Deno Deploy 1 · Workflows 1
```
(✓ = green.) Wave 1b → Wave 5 per §5b.

---

## 6. File inventory (Wave 1a)

**New routes:** `compat/routes/{meta,settings,themes,project,security-events}.ts`.
**New stores:** `KeyValueStore`, `ThemesStore`, `SecurityEventsStore` (`compat/store.ts`).
**Migration:** v8 + `schema.ts` (`themes`, `securityEvents`).
**Test:** `test/compat-wave1.mjs`.
**Modified:** `compat/app.ts` (wire routes + unauth-before-auth ordering),
`compat/registry.ts` (+23 op keys), `test/migrations.mjs` (8), `test/contract-diff.mjs`
(wave-resilient), `package.json` (test chain).
