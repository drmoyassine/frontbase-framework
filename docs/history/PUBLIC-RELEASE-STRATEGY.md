# Frontbase Public Release Strategy

> **2026-09-06 owner priority — paid Cloud launch:** A-26 authorizes completing the framework's Supabase application-database/auth and Stripe migrations. The free-tier implementation is a baseline, not the launch acceptance gate. Track execution in [CLOUD-LAUNCH.md](../CLOUD-LAUNCH.md). Public-framework release gates and paused CF-22 remain separate.

**Status:** Active preparation

**First edition accepted (2026-10-08):** Frontbase Framework Developer Preview, for developers and agents operating their own deployment; six Apache-2.0 library packages and separately built application artifacts. Cloudflare leads; other hosts retain evidence-specific support boundaries. [R0 findings and ordered backlog](PUBLIC-RELEASE-R0-2026-10-08.md) guide R1–R4. This is scope acceptance, not release availability, package publication or deployment authorization. Full template installation, migration, turnkey full CLI scaffolding and universal host/provider parity remain unclaimed; CF-22 stays paused.

**Owner:** Frontbase framework

**Last updated:** 2026-10-09

## Release intent

Frontbase will prepare for public release as a self-hostable, AI/agent-oriented, edge-native app-builder and framework. It combines the Chimera universal eSSR engine, schema-driven compiler, component system, visual builder primitives, console/backend, and edge infrastructure without requiring users to adopt a hosted Frontbase control plane.

“Self-hostable” is a product contract, not merely source availability. A release candidate must give an external adopter a documented, reproducible path from a clean environment to a working project, administration surface, publication flow, and supported deployment target under their control.

## Positioning

Frontbase is for developers, teams, and AI agents that want:

- one rendering engine across edge, browser service worker, and builder preview;
- schema and validation contracts that make agent-authored changes inspectable;
- an edge-native published application with a small client behavior runtime rather than React hydration;
- a visual app-building and CMS path with full code access;
- deployable infrastructure and data-provider seams rather than a mandatory proprietary backend;
- Apache-2.0 framework code and an explicit boundary around any future hosted services.

The initial public narrative must be precise about supported hosts. Cloudflare is the most integrated deployment path today. Node/Docker and other adapters may be described as supported only to the level proven by repeatable release evidence. “Edge-native” must not be translated into “every edge provider has identical turnkey support.”

## Release train

### R0 — Scope and truth audit

- Freeze the first public edition and package set.
- Reconcile README, milestones, delivery reports, deferred items, and actual package behavior.
- Define whether the first release is a developer preview, alpha, beta, or stable release.
- Resolve the relationship between the Apache-2.0 packages, root `private` monorepo flag, package publication metadata, and any non-published artifacts.
- Explicitly classify paused CF-22 residue and ensure no public claim implies complete visual, behavioral, or security parity.

### R1 — External-consumer proof

- Build and test publishable package tarballs outside the workspace.
- Prove `init` against versioned packages rather than `workspace:*` dependencies.
- Verify clean installation, build, test, project creation, authoring, publication, administration, and upgrade paths.
- Produce at least one reproducible Cloudflare self-host deployment and one verified non-Cloudflare/self-host development or deployment path if claimed.
- Remove any required dependency on private product artifacts from the default public path.

### R2 — Security and operability gate

- Close release-blocking secret-storage, password-reset, auth, tenant-isolation, SSRF, credential-leak, and recovery risks.
- Run the full typecheck/build/test/mutation/conformance/smoke matrix from a clean checkout.
- Document configuration, secrets, backups, migrations, upgrades, rollback, observability, and failure recovery.
- Publish an honest supported/unsupported matrix and security-reporting path.

### R3 — Documentation and release candidate

- Establish a concise quick start, concepts, architecture, component authoring, data/auth, self-hosting, deployment, troubleshooting, and contribution path.
- Add versioning, changelog, compatibility, deprecation, and release-note practices.
- Prepare runnable examples that do not depend on unstated local repositories or private credentials.
- Cut a tagged release candidate and have a clean-room adopter complete the documented path.

### R4 — Public release and feedback

- Publish the approved packages and repository release.
- Announce only the capabilities demonstrated by R0–R3 evidence.
- Open appropriate issue/discussion/support channels and label the support boundary.
- Monitor install success, time-to-first-published-app, documentation failures, security reports, and early adoption friction.
- Feed generalized adopter evidence back into Frontbase's own roadmap.

## Release gates

The owner may change the release label or scope, but must not waive truth, security, or recoverability.

| Gate | Evidence required |
|---|---|
| Product scope | Named edition, audience, capabilities, limitations, and support level |
| Package consumability | External tarball/registry install without workspace coupling |
| Self-host path | Reproducible clean-environment deploy owned by the adopter |
| Security | No known release-blocking secret, auth, tenant, SSRF, or recovery defect |
| Verification | Typecheck, build, tests, mutation gates, smoke, and relevant conformance gates green |
| Documentation | Quick start through operations and troubleshooting reviewed by a clean-room adopter |
| Release operations | Versions, licenses, changelog, tags, publishing automation, rollback, and security reporting |
| Honest positioning | README and announcement distinguish shipped, preview, deferred, and unsupported behavior |

## Relationship to NoCodeHero

NoCodeHero may use a released Frontbase version to teach Certified No-code Engineer. The course can provide valuable downstream evidence about onboarding, teachability, documentation, and common workflows. It does not determine Frontbase's release label or permit Frontbase to bypass its gates. Frontbase exposes versioned, verified capabilities; NoCodeHero decides which of those capabilities support its curriculum and credential claims.

## Immediate next action

The [Request-preserving guarded primitive](PUBLIC-RELEASE-R2-REQUEST-TRANSPORT-DELIVERY.md) now reaches the selected SDK paths in [bounded HTTP delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md): 15 functional cases, six independently restored mutations and integrated local gates pass. The two demonstrated Turso-vector/Supabase injection bypasses are closed within those tested paths. Next: review parallel behavior/type evidence and establish a safe Neon policy without per-request global SDK mutation. Native/operator, DNS/egress, remaining wrappers and actual provider/host acceptance retain explicit boundaries; this does not close R2 or M1.

In parallel with explicitly owned work, isolate [behavior fixtures and classification](PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md) without refreshing the ledger to conceal order dependence, and establish an adopted distributable [backend type remedy](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md). R1 lifecycle/full-CMS clean-install and R2/R3 security/host operations evidence remain necessary before R4 publication. R0 and Developer Preview preparation scope are accepted; no GA or general host parity is claimed.

The separate [pilot execution plan](../plans/wordpress-pilot-execution-plan.md) covers M0–M9 through migration, installation, full-catalog publication, production inquiries, reuse, operations and authorized USA cutover. The [namespace inventory](../plans/wordpress-pilot-namespace-writer-inventory.md) blocks claiming a safe installer from advisory checks alone. Pilot acceptance and framework publication are separate finish lines and authorizations. This planning refresh changes no accepted edition scope or release gates; CF-22 remains paused.
