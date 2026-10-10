# WordPress pilot: five waves across two sessions

Updated 2026-10-10. Owner requests a concrete assignment for their separate parallel session and this primary session. This is a delegation plan, not an agent dispatch or live-action approval. [Execution plan](wordpress-pilot-execution-plan.md) remains the M0–M9 acceptance authority; [release strategy](../history/PUBLIC-RELEASE-STRATEGY.md) governs separate R1–R4 publication gates. Five waves group those milestones without relaxing dependencies.

**Wave 1 primary update:** [Selected SDK HTTP threading](../history/PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md) is locally verified (15/15 functional, 6/6 mutation and cumulative gates), with all mutation sources restored and this increment's build lock released. Separate session's allocated packets remain for independent review; claim a build slot before dist-consuming runs. Neon, behavior/type adoption and M1 acceptance remain open. Starting assignments below are preserved scope, not a claim that delivery completes the wave.

**Corrected packet acceptance:** [primary review](wordpress-pilot-wave1-primary-review.md) now accepts P1-A/P1-B/P1-C within bounded evidence scope after revision-2 reruns. Original starting instructions and the previous pending-review paragraph remain chronological scope. This does not satisfy the wave's complete joint exit: fresh M3 evidence, full shared behavior acceptance and production type/transport decisions remain open. [Owned-file candidate](wordpress-pilot-owned-file-candidate.md) is test-only; primary must finish capability/namespace/inquiry contracts before allocating dependent P2-B/P2-C production lanes. No next-wave dispatch is implied.

## Responsibilities

**Primary session (here):** architecture, contract decisions, security-critical integration, installer coordination, scalable reviewed publishing, real admin/host integration, all cross-session acceptance and final release claims. Primary reviews each delivery independently and owns the cumulative build/security matrix. Owner reviews final core/template classification and authorizes cutover/publication separately.

**Separate parallel session:** coordinates its own bounded swarm, owns migration evidence/conversion tooling, verification fixture candidates and dependency experiments initially; later implements assigned presentation, inquiry and operations/reuse tasks against primary-reviewed contracts. Its reviewer is a useful first review, not a substitute for primary acceptance. It must not independently redefine state transactions, namespaces, routing, approval, publishing or transport policy.

Up to three workers plus a coordinating reviewer is a useful swarm structure where that session has four slots. Slot availability is checked there; two sessions do not automatically imply a guaranteed total concurrency. Avoid more simultaneous editing lanes than review/build capacity.

## Wave assignments and exits

| Wave / milestones | Primary session | Separate session | Joint exit / dependency |
| --- | --- | --- | --- |
| 1 — foundations (M1; fresh M3 evidence) | Integrate guarded SDK connections; retain Request semantics, per-owner isolation and explicit native/HTTP support. Review behavior fixture/classification changes and type remedy candidates. Define installer adapter/writer acceptance. | P1-A fresh migration/media/URL audit and conversion proposals; P1-B isolated behavior fixture candidate; P1-C externally reproducible backend type/dependency experiment. Separate review of each. | Security and truthful behavior acceptance, reproducible type remedy after primary/owner policy review, and measured data gap ledger. Audits may progress before other lanes finish; no milestone closes from fixtures alone. |
| 2 — install and content (M2/M3; M6 foundation) | Implement coordinated namespace writers and durable installer/upgrade/recovery; select supported state-adapter guarantees and approve inquiry persistence/form contracts. Integrate reviewed content batches within existing authorization. | P2-A idempotent editorial/listing/media conversion tooling and reviewable batches; P2-B engine/builder inquiry inputs after contract allocation; P2-C durable lead/outbox implementation after state/adapter contract review. | Safe install/recovery verified, reviewed original-record mappings and repeatable content batches; inquiry persistence survives concurrency/restarts. Production delivery remains open. |
| 3 — complete staging experience (M4/M5/M6) | Wire real isolated staging through existing admin; implement full-catalog generation-consistent publishing, SEO/cache/query integration and delivery security. | P3-A directory/blog responsive interactions and accessibility; P3-B inquiry status/admin/delivery adapters using assigned contracts; P3-C route/media/SEO and browser acceptance cases. | Actual staging journey plus complete approved catalog browsing/publishing and approved delivery tests. Small slice, contact launcher or fake success does not close this wave. |
| 4 — reuse and operations (M7/M8) | Review core/template/consumer split with owner; integrate export/install/upgrade and second-country deployment; review intended-host security/cache/load and restore. | P4-A installable artifact inventory and separate-country clean-room rehearsal; P4-B host/load/cache test evidence; P4-C backup/restore runbook and rehearsal using approved destinations/access. | Reuse without source edits, reviewed packaging and actual host/restore evidence. Deferred off-server backup blocks production acceptance, not local preparation. |
| 5 — final acceptance (M9; separate R3/R4) | Reconcile final source delta, independently accept URLs/content/forms/SEO/recovery, prepare reversible cutover and seek concrete final authorization. Own actual authorized switch and monitoring. | P5-A final coverage/delta evidence; P5-B independent browser/accessibility/form/SEO regression; P5-C operator/quick-start/release-candidate documentation and rehearsal findings. | No unexplained original URL gaps, production readiness accepted, owner-authorized cutover and live checks. Framework publication follows its own R1–R4 gates and authorization. |

A wave is an integration checkpoint, not a date or rigid barrier for every lane. Only dependent implementation waits: inquiry inputs can precede delivery; read-only audits can precede installer acceptance; runbook preparation can precede backup access. Do not begin later shared-surface implementation before its contract and file ownership are recorded. Return failed work for correction; do not declare a wave complete from subagent test totals.

## Start now: separate session Wave 1 packet

All three assignments are available for local work after claiming exact file ownership. Read governance, the [handoff](wordpress-pilot-parallel-handoff.md), this plan and the cited evidence first. R0 is already complete for scope/evidence; these are explicit bounded continuations, not an uncontrolled feature sprint.

### P1-A — fresh coverage and conversion evidence

Read [A/C reconciliation](wordpress-pilot-ac-primary-reconciliation.md), [harmonization](wordpress-pilot-harmonization.md), [Garage evidence](wordpress-pilot-garage-storage.md) and `scripts/wordpress-audit/README.md`. Own `scripts/wordpress-audit/` source/tests/fixtures, excluding existing bytecode and private source exports; report in `docs/plans/wordpress-pilot-parallel-wave1-data.md`.

Produce a digest/date-tagged audit of original public institution/program/article/page/attachment records against canonical matches and media. Use existing authorized local exports first; if available and within standing scope, Supabase/storage read-only access may refresh evidence. If inaccessible, state snapshot age and exact missing access; continue tooling instead of presenting old counts as fresh. Canonical tables remain `public.institutions`, `public.programs`, `public.cities`, `public.countries`. More canonical rows are intentional expansion; every original public record/path needs a reviewed match or explicit disposition. Supabase current content takes precedence; preserve WP URLs independently of institution naming.

Include required institution/program fields, city/country relations, ELS scope, editorial body/date/taxonomy/internal links, broken versus empty covers, inline/download assets and the anomalous original listing. Output sanitized counts, unresolved identities, field conflicts, proposed idempotent batches and before/after invariants. Keep private data/keys out of Git. Tool tests must show a missing original route is detected, extra canonical rows are allowed, a populated fresh field is preserved and repeats do not duplicate records. No live writes, uploads, approvals or publication in this packet. Primary owns those integrations.

### P1-B — isolated behavior evidence candidate

Read [repair plan](../history/PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md) and [isolation evidence](../history/PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md). Own new `packages/backend/test/parallel-wave1-behavior*.mjs` and `docs/plans/wordpress-pilot-parallel-wave1-behavior.md`. Do not modify production routes, existing shared verifier/harness, test registration or behavior/conformance ledgers in this starting packet.

Create an executable candidate with fresh per-operation state, owner-scoped setup/cleanup, nonempty positive fixtures and meaningful refusal cases. Compare forward/reverse/shuffled order using fixed seeds; prove expected functional results and refuse unsupported operations honestly. Include targeted mutations/counterfactuals demonstrating that empty fixtures, starving a route, shared state or calling `success:false` a success cannot make the candidate pass. Record actual commands, expected failures, driver/runtime scope and residual drift. Source diagnostics are evidence, not permission to rewrite acceptance expectations. Primary reviews semantics, then allocates changes to the shared harness and production defects.

### P1-C — external dependency delivery candidate

Read [type proposal](../history/PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md) and [compatibility experiment](../history/PUBLIC-RELEASE-R1-BACKEND-COMPAT-EXPERIMENT.md). Own new `scripts/parallel-wave1-types*.mjs`, synthetic fixtures under `scripts/parallel-wave1-types/` and `docs/plans/wordpress-pilot-parallel-wave1-types.md`. Keep temporary installations outside tracked source; no root/package manifests, lockfile, dependency adoption or package publication edits.

Reproduce the original strict failure and external candidate proof from one documented command. Establish what an immutable distributable repair would require: declaration/runtime provenance, runtime bytes, actual driver dependency burden, supported TypeScript/module modes and mixed external caller paths. Reject skipped type checking, `any`-based suppression and workspace-only resolution. Separate technical viability from maintenance/license/distribution decisions. Report a recommended option and a runnable external acceptance matrix; do not silently choose/publish a fork. Network access and package installation use normal permissions; blocked steps remain explicit.

## Start now: primary Wave 1 packet

Claim SDK threading in the audit before implementation. Primary reserves the current guarded transport and affected SDK factories/wrappers, their focused security tests, existing verifier/harness and ledgers, dependency/test registration, host artifact generation and shared plan/governance updates. Inspect exact paths before claiming because the workspace already contains uncommitted work.

Use [transport audit](../history/PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md) and [verified Request foundation](../history/PUBLIC-RELEASE-R2-REQUEST-TRANSPORT-DELIVERY.md). Close demonstrated Turso vector and Supabase datasource bypasses. Prove effective method/auth/body, normalized original/native URL refusal, redirects/baseUrl/downgrade, cancellation/body-read deadline, no raw fallback and concurrent per-owner separation. Independently restore mutation baselines; run required build/check and affected security/conformance/no-leak gates. Do not infer supported native/WSS behavior from HTTP fixtures.

In parallel with external evidence production, primary prepares installer namespace/adapter design and scalable publication proposals, without beginning unallocated source changes. Primary reviews each Wave 1 report, issues a correction list, integrates only accepted work and records actual remaining gates.

## File and Git coordination

Current recorded baseline: `codex/wordpress-pilot`, HEAD `d3cd122`; latest fixes, tests, reports and plans remain uncommitted. A worktree created from HEAD alone omits those foundations. Do not assume it contains the verified Request/auth fixes. For the initial additive audit/fixture/experiment packet, use explicit shared-worktree ownership above or a coordinated reproducible baseline transfer. Later concurrent production coding should use separate worktrees based on the agreed integrated checkpoint. This planning request itself does not commit, push, clean, stash or move work.

The parallel coordinator claims each packet in `docs/history/PUBLIC-RELEASE-AUDIT.md` (brief append/insert, re-read immediately before patching) and owns `docs/plans/wordpress-pilot-parallel-session-progress.md` plus its packet reports. Primary owns shared roadmap/execution/handoff/strategy/milestones/Decisions/README changes. Coordinate the audit entry; never overwrite another claim. Shared test registration, package manifests/lockfile, ledgers and `examples/cf-full/api/cms.mjs` stay with primary until explicitly reassigned. Future paths are allocated in the next-wave packet before edits, not guessed from a broad directory name.

In a shared worktree, primary is the only build/mutation owner; parallel reports source-level checks and requests a build slot before dist-consuming tests. Code delivery cannot be accepted until `pnpm -r check`, `pnpm -r build` and appropriate functional/security/mutation gates have run. In separate worktrees each may build independently, but primary reruns the integrated checks. Never run mutations against another session's active dist. No broad formatting/generated rewrites, resets, rebases, force-pushes or incidental cleanup.

## Delivery receipt and next-wave release

Every packet returns:

1. Claimed scope, owned files, baseline HEAD plus relevant uncommitted file hashes, and commit IDs if separately authorized.
2. Problem, implementation/evidence and exact reproducible commands; results, failures, skipped credentials/host checks and source/runtime limits.
3. Changed paths and synthetic versus private/live evidence separation; no secrets or PII in the receipt.
4. Independent review findings, fixes and residual risks; identify any dependency on primary's unfinished work.
5. Explicit next executable task; no statement that staging/migration/release is complete from fixture results.

Primary verifies code and tests independently, integrates accepted diffs deliberately, updates durable claims and issues the next wave's exact contract/path allocation. Wave 2–5 rows are the forward backlog, not blanket permission to edit all their surfaces now. Agent-session messaging requires direct owner authorization; this document is designed for the owner to provide to their separate session. No session was created or messaged by this planning update.

## Prompt the owner can give the separate session

> Coordinate the separate-session assignments in `docs/plans/wordpress-pilot-two-session-waves.md`. Start only Wave 1 P1-A/P1-B/P1-C, using up to three disjoint workers and your own review. Read AGENTS.md and current governance/evidence, inspect dirty status, then claim exact ownership before implementation. Preserve primary's uncommitted foundations. Own only the allocated audit/tooling, new behavior candidate and new external type experiment paths; primary owns production transport, shared harness/ledgers, package registration and generated host. Use the progress/report files specified there, coordinate any shared build slot, and return reproducible evidence and failures for primary acceptance. Do not apply live data writes, publish/deploy, adopt dependencies, commit/push or start later-wave shared code without its applicable authorization and allocation. Continue independent authorized packet work when one lane needs access; mark unavailable fresh evidence honestly.
