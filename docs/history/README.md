# Project History

**Relocated here 2026-08-29** (no content changed — files moved as-is) so the
top-level `docs/` tree reads as current, standalone framework documentation.
These documents are the project's audit trail: how the architecture evolved,
what was decided and when, and the delivery/sprint/audit records behind each
milestone.

Two mechanical notes on the relocation, recorded so nothing is silent:

- `CHIMERA-ARCHITECTURE.md` was **renamed** to [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
  (and rewritten for the current architecture); `unclosable-postgres-mysql-parity.md`
  became [`../known-limitation-postgres-mysql.md`](../known-limitation-postgres-mysql.md).
  Cross-links into those two files were repointed; the prose is untouched.
- Links that were already machine-specific (`file:///c:/Users/…`) predate the
  move and are left as-is.

## Decision log & milestones

| Document | What it is |
|---|---|
| [DECISIONS.md](./DECISIONS.md) | The decision log (A-1 … A-25) — *why* the framework is shaped the way it is |
| [MILESTONES.md](./MILESTONES.md) | Implementation status per milestone |
| [OPENQUESTIONS.md](./OPENQUESTIONS.md) | The open-questions tracker (resolved items included) |

## Architecture history

| Document | What it is |
|---|---|
| [ARCHITECTURE-SPLIT.md](./ARCHITECTURE-SPLIT.md) | The two-layer (core framework / CMS layer) split design |
| [technical-specification.md](./technical-specification.md) | Draft technical specification (superseded by [../ARCHITECTURE.md](../ARCHITECTURE.md)) |
| [comprehensive-analysis.md](./comprehensive-analysis.md) | The original v1 analysis (partially superseded — see its banner) |
| [frontbase_framework_proposal_v1](./frontbase_framework_proposal_v1) | The founding proposal |
| [PHASE0-DECISION-MEMO.md](./PHASE0-DECISION-MEMO.md) | Phase-0 spike verdict + evidence |

## Delivery & sprint records

| Path | What it is |
|---|---|
| [delivery/](./delivery/) | Per-phase and per-milestone delivery reports |
| [plans/](./plans/) | Sprint plans (compiler/CLI, CMS, agent experience, provisioning, durable execution, …) |
| [cf-18-phase2-delivery.md](./cf-18-phase2-delivery.md), [cf-21-*.md](./cf-21-edge-parity-audit.md), [cf-22-*.md](./cf-22-handover.md) | Console/parity arc: delivery, audits, closure plans, handover |
| [phase-3-*.md](./phase-3-consolidated-delivery.md), [phase2-implementation-report.md](./phase2-implementation-report.md), [connected-accounts-parity-delivery.md](./connected-accounts-parity-delivery.md), [f5c-f3b-durable-delivery.md](./f5c-f3b-durable-delivery.md) | Consolidated delivery records |
| [reports/](./reports/) | Audit reports (provider coverage, façade audit, closure reports) |

## Release planning

| Document | What it is |
|---|---|
| [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md) | The rollout strategy and release gates |
| [PUBLIC-RELEASE-AUDIT.md](./PUBLIC-RELEASE-AUDIT.md) | The release scope/truth audit |
| [RELEASE-READINESS.md](./RELEASE-READINESS.md) | The date-free readiness checklist |

## Spike evidence

| Path | What it is |
|---|---|
| [spike/](./spike/), [spike-cf/](./spike-cf/) | The Phase-0 validation spikes (rendering + Cloudflare deployment) |
