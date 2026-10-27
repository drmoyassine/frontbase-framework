# CF-22 Closing A — Final QA, Security, and Approval Review

**Date:** 2026-07-29  
**Reviewed against:** `docs/cf-22-closure-plan.md`  
**Supersedes:** all earlier verdict sections in this report  

## Verdict

| Scope | QA decision |
|---|---|
| **Work A — 48 `/api/sync/*` operations** | **PASS (local implementation and deterministic semantic proof)** |
| **Local CF-22 code gate** | **PASS** |
| **CF-22 milestone under closure-plan §7** | **NOT YET APPROVED** |

Work A itself is now implemented and locally proven. The framework can create encrypted
datasources, introspect real SQLite/Postgres schema, read and mutate real table rows,
filter/search/sort/page deterministically, aggregate and resolve distinct values, manage
views and relationships, invoke guarded webhooks, execute real connector extraction, and
enforce tenant ownership.

The complete CF-22 milestone cannot honestly be marked closed from this workspace alone.
The plan also requires a 334-operation product-vs-framework differential run, one recorded
live run per provider family, a successful scheduled drift run, a fresh Cloudflare deploy
run, and owner sign-off. Those artifacts do not exist and the required credentials/product
runtime were not available during this review.

The implementation team's prior delivery report remains rejected as historical evidence:
its claimed differential run and live-provider verification did not occur.

## Release-blocking items still open

1. **Work A3 differential evidence is absent.** The replacement harness correctly fails
   closed without `--product`, `--framework`, and `--corpus`. No committed corpus covers
   success and failure paths for all 334 operations, and no zero-diff product comparison
   has been run.
2. **Provider-family live evidence is absent.** The backend suite explicitly skipped
   storage/S3, Cloudflare provisioning, Postgres, QStash, and Supabase live tests because
   credentials were not present. The plan additionally requires Turso, Upstash, Vectorize,
   LLM, MCP, Google OAuth, WordPress, Netlify, and Vercel evidence.
3. **Some A2 provider operations are still local simulations.** In particular, the
   Cloudflare/Deno compatibility actions and parts of provider discovery/Turso/GPU
   testing report success from local metadata rather than proving the corresponding
   provider action. Therefore `functional: 334` is a runtime-observation result, not
   product-parity proof.
4. **Work B is implemented but not operationally proven.** The daily drift workflow is
   present, but there is no recorded green run or deliberate product-change failure.
5. **Work D is implemented but not run.** The fresh-deploy workflow creates and removes a
   scratch Worker/D1 deployment and runs Playwright, but no Cloudflare run URL/run ID is
   available.
6. **Work F is owner-only.** The required walkthrough and sign-off cannot be issued by QA
   on the owner's behalf.
7. **Residual SSRF hardening limitation.** Outbound provider URLs reject non-HTTPS,
   credentials-in-URL, loopback, link-local, and literal private addresses, and reject
   redirects. DNS resolution/rebinding protection still depends on the hosting platform's
   egress controls.

## Issues fixed directly by QA

### Tenant isolation and database security

- Removed the fallback from tenant datasource routes to the shared framework control DB.
- Required a tenant-owned datasource for database operations.
- Replaced regex-only identifiers with live schema-derived table/column allow-lists.
- Added deterministic ordering and dialect-correct placeholders.
- Added real two-tenant mutation/state checks over 28 tenant-scoped tables.
- Added parent-ownership checks and privileged-role enforcement for provider, datasource,
  RLS, storage, deployment, agent, MCP, and secret-management surfaces.

### Work A semantic implementation

- Implemented datasource CRUD/test/introspection with encrypted configuration.
- Implemented real row insert/update, filtered reads, search, sort, pagination, aggregate,
  distinct, and foreign-key display resolution.
- Implemented view validation, reads, counts, inserts, updates, and webhook delivery.
- Implemented native FK discovery plus validated user relationships.
- Implemented tenant-owned table sessions.
- Implemented guarded Supabase migration check/apply behavior.
- Implemented guarded WordPress discovery and paginated extraction with persisted,
  tenant-scoped import state and SSE progress.
- Implemented single-use, expiring, hashed Sheets callback capabilities and encrypted
  datasource creation.
- Implemented real Upstash connectivity behavior instead of a canned success.

### Secrets and external calls

- Made datasource and provider secret persistence fail closed when encryption is absent.
- Encrypted/redacted datasource, Redis, storage, edge resource, engine/provider/database,
  workspace-agent, and MCP configurations.
- Removed encrypted configuration blobs from legacy phase-two API responses.
- Fixed deprovisioning to use the server-only decrypt path before deleting resource rows.
- Added guarded HTTPS egress, bounded timeouts, redirect rejection, and private-address
  rejection.
- Replaced the settings Redis fake acknowledgment with a real authenticated `/ping`.

### Console retirement and deployment proof

- Production now retains only `/api/console/health` and `/api/console/setup/*`.
- Other `/api/console/*` routes return explicit `410 Gone`; no test-only route injection
  remains.
- Updated the consumer map, example docs, smoke assertions, and Playwright suite.
- Added scheduled cross-repository drift and manual fresh-deploy workflows.

### Evidence quality

- Replaced the one-sided differential script with a fail-closed two-target comparator.
- Added an operation ledger containing status and runtime evidence for all 334 operations.
- Added semantic sync, database-isolation, console-retirement, and outbound-HTTP gates.
- Fixed the Windows mutation runner to invoke pnpm without a shell and surface failures.
- Preserved the 15 RED-on-break mutation proofs.

## Verification recorded on 2026-07-29

| Verification | Result |
|---|---|
| `pnpm -r check` | **PASS** |
| `pnpm -r build` | **PASS** |
| `pnpm --filter @frontbase/backend test` | **PASS**; credential-gated live suites explicitly skipped |
| `pnpm --filter @frontbase/backend run gate:cf22` | **PASS** |
| Contract response conformance | **334/334**, 0 violates, 0 unreachable, 0 no-schema |
| Runtime behavior ledger | **334 functional**, 0 shape-only, 0 external-disabled, 0 stub |
| Negative/fuzz sweep | **334/334 audited** |
| Tenant matrix | **175/175** identifier-bearing operations; 28 tables snapshotted |
| Mutation harness | **15/15** controls went RED when broken |
| Work A semantic suite | **PASS** |
| Legacy console retirement | **5/5 PASS** |
| Full-worker smoke | **PASS** |
| Local Playwright console acceptance | **14/14 PASS** |
| Worker artifact | **280.9 KB gzip**, below 1,024 KB Cloudflare free limit |
| Differential harness without targets/corpus | **Correctly FAILS**; no false PASS |
| Live storage/Cloudflare/Postgres/QStash/Supabase runs | **SKIP — credentials absent** |

Behavior fingerprint:
`62d16711a7a12c2cd86a9e1434bff5c199bc8d81f16e178ad4915c36e25995e5`

## Approval statement

**Work A is approved.** Its 48 `/api/sync/*` operations pass contract, semantic,
negative-input, security, and tenant-isolation verification.

**CF-22 as a whole remains open under its own definition of done.** The remaining work is
not another local code shortcut: it is the missing differential corpus/run, completion
and live proof of A2 provider actions, recorded workflow runs, a fresh deployment record,
and owner sign-off. Marking the milestone closed before those artifacts exist would repeat
the evidence defect that initiated this review.
