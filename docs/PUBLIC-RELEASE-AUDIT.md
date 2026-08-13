# R0 Public Release Scope and Truth Audit

**Status:** Not started

**Assignee:** Unassigned

**Last updated:** 2026-08-13

## Objective

Establish the smallest truthful first public Frontbase edition and the exact work required to release it as a self-hostable, AI/agent-oriented, edge-native app-builder and framework. This audit implements R0 from [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md) and Decision A-20 in [DECISIONS.md](./DECISIONS.md#decision-a-20-public-release-positioning-and-gated-rollout).

This is a read-first audit. It does not authorize resuming CF-22, changing the six-package architecture, publishing packages, deploying, or fixing every discovered issue.

## Claim protocol

Before substantial work, change `Status` to `In progress`, identify the agent/session in `Assignee`, update the date, and inspect Git status. If another active session already owns the audit, coordinate or choose a non-overlapping task.

## Required evidence

### 1. Product scope and claims

- Map each headline README and strategy claim to shipped code and reproducible evidence.
- Define candidate release label: developer preview, alpha, beta, or stable.
- Define the first edition's included and explicitly excluded capabilities.
- Reconcile Phase 3/4 intent with current implementation and paused CF-22 residue.

### 2. Package consumability

- Inventory all six package manifests, publish metadata, licenses, entry points, peer dependencies, and `workspace:*` coupling.
- Determine which packages can be packed and installed by an external consumer today.
- Identify private artifacts or cross-repository pins required by the default path.
- Test package tarballs outside the monorepo when safe; record commands and results.

### 3. Self-hosting contract

- Verify the documented Cloudflare path from a clean environment through project creation, administration, publication, and operation.
- Classify Node/Docker and other provider claims as verified, partial, planned, or unsupported.
- Identify hidden credentials, product-repository dependencies, manual steps, and recovery gaps.

### 4. Security and operability

- Reconcile known auth, secret-storage, password-reset, tenant-isolation, SSRF, credential-leak, backup, migration, rollback, and recovery findings.
- Distinguish release blockers from accepted limitations and post-release improvements.
- Identify the exact clean-checkout verification matrix required for the selected edition.

### 5. Documentation and release operations

- Audit quick start, concepts, architecture, authoring, data/auth, self-hosting, deployment, upgrade, troubleshooting, contributing, security reporting, and support boundaries.
- Audit package versions, changelog/release notes, tags, registry ownership, publishing automation, and rollback.
- Identify the clean-room adoption test and owner acceptance needed before release.

## Required output

Complete this table with links to repository evidence:

| Area | Current truth | Evidence | Release blocker? | Required action |
|---|---|---|---|---|
| Product scope | Pending audit | — | Unknown | Audit claims and choose first edition |
| Packages | Pending audit | — | Unknown | Test external pack/install |
| Cloudflare self-host | Pending audit | — | Unknown | Reproduce clean path |
| Other self-host paths | Pending audit | — | Unknown | Classify support honestly |
| Security | Pending audit | — | Unknown | Reconcile known findings |
| Operability | Pending audit | — | Unknown | Audit migration/recovery/observability |
| Documentation | Pending audit | — | Unknown | Audit complete adopter journey |
| Release operations | Pending audit | — | Unknown | Define version/publish/rollback path |

Then add:

1. **Recommended first public edition and release label.**
2. **Included capabilities and explicit exclusions.**
3. **Ordered release backlog**, each item with priority, dependency, acceptance evidence, and owning package/document.
4. **Go/no-go statement** for proceeding to R1.
5. **Verification record**, including exact commands, results, skips, and environment constraints.

## Completion gate

Set this audit to `Complete` only when all required areas are evidence-backed, conflicting claims are reconciled or explicitly flagged, the recommended edition is decision-ready, and the backlog is executable. If the audit requires a new product choice, add it to `docs/DECISIONS.md` rather than silently treating the recommendation as accepted.
