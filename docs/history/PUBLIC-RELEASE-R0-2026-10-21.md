# R0 refresh — deployment evidence and public-release backlog

2026-10-21. Documentation/read-only review of `codex/deployment-profiles` at immutable source `7d2c73d9369ff1cd977c30a0dc01d159297488dd`. This is a branch-specific report, not acceptance of the shared checkout or another session's work. The branch initially has no tracked changes and retains untracked `.agents/` and `skills-lock.json`; the shared checkout has unrelated staged/unstaged work and was not modified. The audit claim precedes this report. No product code, dependency, provider resource, deployment or distribution changes are included.

## Recommended first edition

Retain the accepted **Frontbase Framework Developer Preview**, aimed at developers and agents running their own deployment. This is preparation, not an available release or GA claim. Cloudflare leads; Vercel is a bounded Node-runtime path with its own limitations. Deno is deferred. CF-22 remains paused accepted residue.

Seven top-level non-private library manifests are present: the original six plus the already accepted standalone translation exception. Six declare `0.0.0`, builder declares `0.1.0`. Console, hydrate and admin-console are private application artifacts. Source manifests still contain workspace dependencies; whether packing rewrites and resolves the entire graph correctly requires external-consumer proof. No package-count or maintenance decision is made by this audit. The [strategy](PUBLIC-RELEASE-STRATEGY.md) and [decisions](DECISIONS.md) retain authority.

## What has changed since the earlier R0

| Surface | Retained evidence | Current boundary |
|---|---|---|
| Managed Cloudflare | [Lifecycle receipt](../plans/frontbase-deployment-managed-lifecycle-20261020.md): new D1/optional KV/private R2, known-resource redeploy, session/page/cache/object preservation and bounded post-upload reconciliation | Unknown create outcomes, cross-machine coordination, drift/CAS, broader recovery and arbitrary provider changes remain open. Private R2 is not permanent public-asset parity. |
| Shared Bindings | [Editor receipt](../plans/frontbase-deployment-shared-bindings-20261020.md) and [Vercel delivery](../plans/frontbase-deployment-vercel-live-20261020.md): shared review, nonsecret proposals/import and exact native resource selection | A running app reviews/exports proposals; it does not hot-apply them. Controlled optional-provider changes remain open. |
| Vercel actual host | [Live receipt](../plans/frontbase-deployment-vercel-live-20261020.md): isolated Turso-backed preview and explicitly approved disposable production; unchanged production redeploy preserves session/data/publication | Node 24 function evidence, not Vercel Edge or CF parity. Preview/production shared disposable test data is not a production isolation recommendation. |
| Vercel fresh state/source | [Fresh receipt](../plans/frontbase-deployment-vercel-fresh-20261020.md): committed source export, frozen install/build/check, empty database first-admin/publication and real managed journal redeploy | Same Windows machine and cached package store; deployment-tooling overlays are listed. No clean OS, reproducible-byte or native Git/button certification. Empty-history first preview is refused because actual host targeting contradicted the requested flag. |
| Package consumability | [External consumer proof](PUBLIC-RELEASE-R1-CONSUMER-PROOF.md), [declaration diagnosis](PUBLIC-RELEASE-R1-DECLARATION-DIAGNOSIS.md), [repair proposal](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md) | Older local tarball/override proofs and copied dependency experiments do not establish an adopted distributable seven-package graph. Backend still declares `drizzle-orm: ^0.36.0`; no distributable remedy was adopted on this branch. |
| Security and behavior | [SDK/conformance delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md), [behavior repair plan](PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md), retained deployment fault/no-leak tests in receipts | Dated 334-operation response-conformance evidence does not prove behavioral correctness, all intended-host egress or the cumulative clean release matrix. Keep ledger/order-dependence defects visible. |
| Translation | [Homepage delivery](../plans/frontbase-homepage-arabic-publication-20261019.md) | Earlier claims that all translation UI/publication is absent are stale. Bounded Homepage delivery is not complete general translation capability. The dispatched translation stream and its newer source are outside this branch audit. |

Native browser buttons remain unverified under the owner's CLI-only choice. Existing workflow filenames are tooling inventory, not evidence that those workflows passed or that paused CF-22 resumed.

## Ordered release backlog

These are evidence gates and sequencing, not authorization to publish, provision or reactivate deferred work.

| Order | Task | Required exit evidence |
|---|---|---|
| 1 / P0 | Review an immutable integration baseline across active branches | Explicit inclusion list and source/artifact identities; reconcile owned deployment commits with the parallel translation stream without overwriting unfamiliar shared diffs. This branch checkpoint is reviewable but is not the release integration baseline. |
| 2 / P0 | Resolve distributable backend types and certify all seven candidates | Decide and document an evidence-supported dependency remedy, provenance/licensing and maintenance. Repack and install externally; strict types with library checking enabled, public imports/runtime/model tests and pure starter pass without source/workspace links. [R1 proposal](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md). |
| 3 / P0 | Repair behavior measurement and finish security transport acceptance | Preserve the full operation denominator and ledger. Isolated forward/reverse/seeded runs, positive/counterfactual assertions and independent faults; intended-host HTTP/SSRF/auth/tenant/no-leak proof. [Behavior plan](PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md), [transport inventory](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md). |
| 4 / P0 | Run the cumulative clean-source release matrix | Build/check, packages, mutation, behavior, conformance and security gates on the agreed baseline. Credential-gated omissions stay explicit skips. Include the translation dependency graph and changed deployment scripts. [Readiness requirements](RELEASE-READINESS.md). |
| 5 / P0 | Complete the claimed self-host journey and operations | Independent CF-first adopter: setup/admin/data/storage/edit/publish/automation, documented backup/restore, exact rollback and upgrade preserving session/data. Certify each other advertised target separately. Existing receipts reduce scope but do not close this gate. [Deployment plan](../plans/frontbase-deployment-profiles-20261020.md). |
| 6 / P0 | Finish release documentation and mechanics | Evidence-backed host/provider/version matrix, clean-adopter docs, security reporting, contribution, changelog, license notices, registry ownership, version/tag/publication and rollback rehearsal. Root SECURITY.md, CONTRIBUTING.md and CHANGELOG.md are absent in this inventory; no local tags are listed. Remote registries/releases were not queried. [Strategy](PUBLIC-RELEASE-STRATEGY.md). |
| 7 / gated | Owner-authorized distribution | Publish only approved versions/artifacts after gates 1–6; Developer Preview limits and support ownership remain explicit. No release is authorized by this report. |

Within the separately authorized deployment product stream, the next technical slice is controlled optional-binding changes. The existing Vercel journal refuses them (`binding_change_requires_review`), state changes require migration, and disabled bindings currently emit no replacement environment value. Before allowing changes, define reviewed apply/retry/failure semantics, clear or supersede stale configuration safely, preserve state/session identity and verify actual runtime behavior. External storage discovery, further providers, broader recovery and exact buttons stay separate acceptance items. Do not remove the refusal alone to claim completion.

## Fresh verification and handoff

Fresh read-only checks: branch/HEAD/status and local tags; top-level package names/versions/private/workspace dependencies; backend dependency declaration; four workflow filenames/triggers; root release-support-file existence; Vercel receipt refusal and environment-lowering source; dated deployment/package/security receipt reconciliation. No private credentials were read and no remote provider metadata was queried.

Documentation verification checks local Markdown file targets, fenced blocks and scoped whitespace. Product build/check/tests, external packing, real host deployments and credential-gated acceptance were not rerun for this documentation-only audit. Prior passing executions are explicitly retained evidence, not new runs. README, strategy, milestones and readiness point to this dated report; no new architectural decision requires a DECISIONS.md change.

R0 concludes with a no-go for public distribution/GA or general host/provider parity. The next release task is immutable integration-baseline review, followed by the distributable backend remedy. The next deployment task is the controlled optional-binding slice above. Preserve unrelated shared work and the two untracked tool paths.
