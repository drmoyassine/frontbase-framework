# CF-22 Work B, C, and E — QA Closure Report

**Date:** 2026-07-29  
**Reviewed against:** `docs/cf-22-closure-plan.md`  
**Scope:** Work B, Work C, and Work E only  
**Explicitly excluded:** Work A3 and its differential corpus/harness, which are owned by another agent

## Verdict

| Workstream | QA decision | Notes |
|---|---|---|
| **Work B — scheduled cross-repository drift** | **CODE/LOCAL PROOF PASS; EXTERNAL PROOF PENDING** | The workflow and deterministic RED-on-break test are complete. The plan's exit condition still requires the owner to configure `PRODUCT_REPO_TOKEN` and retain a real GitHub Actions failure proof. |
| **Work C — legacy `/api/console/*` retirement** | **PASS** | The production mount retains only setup and health. Retired routes return `410 Gone` across methods, including the exact root path. |
| **Work E1–E4 — recorded loose ends** | **PASS** | Runtime classification is honest, the per-operation ledger is durable, Tier-1 database/storage semantics are proven, and every operation has negative-input coverage or a recorded non-falsifiable rationale. |

Work C and Work E are approved locally. Work B's implementation is approved, but its
operational exit evidence is owner-controlled and cannot be produced from this workspace.

The global `gate:cf22` is intentionally **RED** at the behavior-closure stage:
contract conformance remains 334/334, while the corrected runtime classifier reports
309 functional, 17 shape-only, and 8 external-disabled operations. Treating those 25
operations as functional would recreate the evidence defect this remediation was meant
to remove.

## Work B — scheduled cross-repository drift

### Issues fixed

- Replaced a trust-based sync with fail-closed provenance verification. The sync script
  now requires a real product repository, a full commit SHA, and exact equality between
  the exported artifact and `git show <commit>:<artifact>` before writing framework files.
- Added a daily and manually dispatchable workflow at
  `.github/workflows/contract-drift.yml`.
- Added explicit failure when `PRODUCT_REPO_TOKEN` is absent instead of silently using a
  stale vendored snapshot.
- Pinned Node, pnpm, Python, FastAPI `0.139.0`, and deterministic Python hashing.
- Made console bundle comparison deterministic by pinning the build timestamp and
  comparing the complete generated console tree, not only one reported hash.
- Added deduplicated issue creation on real scheduled drift and automatic issue closure
  after resolution.
- Added a safe `prove_failure` dispatch mode. It proves that a deliberate drift turns the
  job red without opening a false incident.
- Added local mutation tests covering dirty product exports, provenance mismatch,
  partial-write prevention, pin disagreement, FastAPI version drift, console byte drift,
  timestamp determinism, and unexpected build configuration.

### Evidence

- `pnpm run test:contract-drift`: **PASS — 12 assertions**
- `pnpm run contracts:diff`: **PASS — 334 implemented, 0 stub, 0 missing, 0 divergent**
- `pnpm run console:check`: **PASS — product pin `7fbc0b9b6183`**
- Syntax checks for the drift/sync/build-pin scripts: **PASS**

### Required owner action

Work B cannot satisfy its plan-defined operational exit until the owner:

1. configures a read-only `PRODUCT_REPO_TOKEN` repository secret;
2. merges or pushes the workflow;
3. manually runs `contract-drift.yml` with `prove_failure=true`; and
4. retains the red GitHub Actions run as the deliberate drift proof.

The next scheduled green run should then be retained as normal-operation evidence.

## Work C — legacy console API retirement

### Issues fixed

- Fixed the exact `/api/console` root bypass. Boundary-aware matching now treats both the
  root and descendants as the retired console surface.
- Retired production requests now drain request bodies before returning `410 Gone`,
  preventing request-body hangs or worker restarts for `POST`, `PUT`, and `PATCH`.
- Production retains only:
  - `/api/console/health`
  - `/api/console/setup`
  - `/api/console/setup/*`
- Removed the legacy dashboard, pages, components, and auth store from the framework
  console SPA. The package is now setup-only.
- Removed test-only legacy route injection. Retirement is exercised through the real
  engine mount.
- Expanded smoke and Playwright coverage to multiple methods and both retained and retired
  paths.
- Updated the deployment documentation and committed a complete consumer map in
  `docs/reports/CONSOLE_CONSUMER_MAP.md`.

### Evidence

- Production console-retirement suite: **8/8 PASS**
- Admin console no-leak/build verification: **PASS**
- Full-worker smoke suite: **PASS**
- Local Playwright console acceptance: **15/15 PASS**
- Full worker artifact: **280.9 KB gzip**, below the 1,024 KB Cloudflare free limit
- Product pinned console bundle: **zero legacy `/api/console/*` references**
- Setup bundle: **only retained setup API references**

## Work E — recorded loose ends

### E1 — honest `test-node` classification

`POST /api/actions/drafts/{draft_id}/test-node/{node_id}` no longer records a false
completed execution when no node runtime exists. It records a terminal error with
`node_runtime_not_configured` and explicitly states that no runtime executed.

Classifier precedence was corrected so explicit provider unavailability outranks
incidental SQL observations. The operation is now consistently classified
`external-disabled`, and its ledger evidence agrees.

### E2 — durable per-operation behavior ledger

- Added `packages/backend/contracts/behavior.ledger.json`.
- The ledger contains exactly 334 operation keys with a status and runtime evidence for
  each operation.
- The classifier now starves reads and replays requests to detect discarded state reads
  and canned responses.
- Corrected behavior summary:
  - functional: **309**
  - shape-only: **17**
  - external-disabled: **8**
  - stub: **0**
  - fingerprint:
    `823998d888140c2cc8e6c19ad7379d8fe5bf85851c6758a15327ddc1cb99f1fb`

The conformance report's top-level `EXTERNAL_DISABLED 0` is a contract reachability
category. It does not contradict the behavior ledger's 8 runtime
`external-disabled` classifications.

### E3 — Tier-1 database and storage semantics

- All 47 `/api/database/*` and `/api/storage/*` ledger operations classify as functional.
- Fixed storage deletion to use the persisted `bucket_id`, preventing provider bytes from
  being orphaned when metadata is deleted.
- Privileged RLS RPCs now require service credentials; anonymous or user JWT fallback is
  rejected.
- Added semantic proofs for real SQLite introspection/data/distinct behavior, guarded
  Supabase/RLS provider calls, storage byte effects, metadata changes, and cross-tenant
  isolation.

### E4 — complete negative-input audit

- The negative sweep now writes and validates an exact per-operation rationale.
- A constrained operation without a generated invalid case fails the gate.
- Added `packages/backend/contracts/negative-input.audit.json`.
- Audit result:
  - operations with generated invalid inputs: **183**
  - rejected invalid cases: **187**
  - inherently non-falsifiable operations: **151**
  - generator gaps: **0**
- The 151 inherent cases are accounted for as 43 operations with no declared input and
  108 operations containing only unconstrained strings/open objects.

## Security and tenant-isolation verification

- Tenant isolation matrix: **175/175 PASS**, with 28 tenant-scoped tables snapshotted.
- Work E semantic suite: **4/4 PASS**.
- Database security suite: **PASS**.
- Backend mutation harness: **15/15 PASS**; every deliberate auth, secret, tenant,
  validation, setup, and durability break made its gate turn red.
- Raw API-key persistence and API-key reveal replay protections remain mutation-proven.
- Storage provider bytes and metadata remain tenant-scoped through upload, move,
  cross-bucket move, signed access, and deletion.

## Integrated verification

| Verification | Result |
|---|---|
| `pnpm -r check` | **PASS** |
| `pnpm -r build` | **PASS** |
| `pnpm --filter @frontbase/backend test` | **PASS** |
| `pnpm --filter @frontbase/backend run test:mutation` | **PASS — 15/15** |
| Contract response conformance | **334/334**, 0 violates, 0 unreachable, 0 no-schema |
| Runtime behavior ledger | **309 functional / 17 shape-only / 8 external-disabled / 0 stub** |
| Negative-input sweep | **334/334 audited; 0 generator gaps** |
| Tenant matrix | **175/175 PASS** |
| Work E semantics | **4/4 PASS** |
| Contract drift local mutation proof | **12 assertions PASS** |
| Console retirement | **8/8 PASS** |
| Console Playwright acceptance | **15/15 PASS** |
| `git diff --check` | **PASS** |

`pnpm --filter @frontbase/backend run gate:cf22` exits nonzero after correctly reporting
the 25 nonfunctional operations. This is an accurate closure blocker outside the B/C/E
remediation scope, not a B/C/E test failure.

## Approval statement

**Work C and Work E are approved. Work B's implementation and local RED-on-break proof
are approved, with the plan-required GitHub Actions proof still pending owner credentials
and execution.**

No Work A3 files, corpus, or differential-harness implementation were modified or
evaluated during this B/C/E review.
