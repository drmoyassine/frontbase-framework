# Frontbase Framework — Release Readiness Requirements

**Status:** Reference checklist
**Owner:** Frontbase framework
**Scope:** A single, date-free statement of *what must be true* before Frontbase is cited by version, deployed in production, or adopted for teaching. This document consolidates the release gates already defined in [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md) and Decision [A-20](./DECISIONS.md#decision-a-20-public-release-positioning-and-gated-rollout). It introduces no new gates, no timelines, and no commitments.

---

## Purpose

This document is intentionally **date-free**. It states readiness *requirements*, not schedules. Sequencing and estimates live in [MILESTONES.md](./MILESTONES.md); the rollout contract and the R0–R4 release train live in [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md). Where this document and the strategy disagree, the strategy and A-20 govern.

Each requirement is **Open** until its tracker marks the underlying work complete and accepted. These are Frontbase's own gates; downstream consumers (including education products) may require a subset or all of them, but they do not set these criteria (A-20).

---

## Readiness requirements

| # | Requirement | Current state | Tracked in |
|---|---|---|---|
| R1 | **Versioned release** — git tags, release notes, and a changelog exist so consumers pin by version rather than commit | Open — no tags or releases exist | Release operations gate |
| R2 | **Package consumability** — all six packages pack and install externally without `workspace:*` coupling or private artifacts; `init` runs against versioned packages | Open — unproven outside the monorepo | R1 (release train); Release operations gate |
| R3 | **Self-host path** — a reproducible, adopter-controlled, clean-environment deploy for every publicly-claimed target (Cloudflare-first; Node/Docker and other adapters only to the level proven by repeatable release evidence) | Open — clean-room proof pending | R1; Self-host path gate |
| R4 | **Security** — no release-blocking secret-storage, auth, tenant-isolation, SSRF, credential-leak, or recovery defect. Known close-outs: API-key storage encrypted at rest (not plaintext); password reset functional (not a no-op); the RULE 1 no-leak gate continues to hold with its mutation proof | Open — plaintext key storage and a no-op password reset are known blockers | R2; Security gate; README status block |
| R5 | **Verification** — typecheck, build, tests, mutation gates, smoke, and relevant conformance gates green from a clean checkout | Partial — gates exist; the clean-checkout matrix is pending | R2; Verification gate |
| R6 | **Documentation** — a concise quick start through concepts, architecture, component authoring, data/auth, self-hosting, deployment, upgrade, troubleshooting, and contribution, reviewed by a clean-room adopter | Open — quick start exists; the full adopter journey is incomplete | R3; Documentation gate |
| R7 | **Honest positioning** — README and release materials distinguish shipped, preview, deferred, and unsupported behavior | Open — scoping pending the R0 audit | R0; Honest positioning gate |
| R8 | **Release operations** — versions, licenses, changelog, tags, publishing automation, rollback, and a security-reporting path | Open | Release operations gate |
| R9 | **Real-deploy validation** — at least one end-to-end real deployment (provisioning → first-admin → console → publish → automation → data → storage) signed off by the owner, plus a clean-room adopter completing the documented path | Open | Self-host + Documentation gates; README status block |

---

## Explicitly not gates (per A-20)

- **Console visual/UX parity with the reference product (CF-22) and the full builder canvas are accepted residue.** The readiness requirement (R7) is that the first public edition *honestly scopes and labels* them (for example as preview or deferred) — **not** that they reach parity before release (A-20 pt 5). CF-22 stays paused accepted residue unless the owner explicitly reactivates it.
- **A downstream course or consumer timeline is not a gate.** Consumer evidence is input to generalized Frontbase requirements only (A-20 pt 6).
- **Existing Phase 3/4 dates are planning evidence, not launch commitments.** This document deliberately carries no dates.

---

## Relationship to the principles

Every requirement serves the three non-negotiable principles (A-12/A-13/A-14): single-edge deployment, universal eSSR, and the fixed six-package surface. No requirement relaxes a principle; readiness means reaching a principle's bar in full, not lowering it.
