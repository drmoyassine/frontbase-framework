# Frontbase Public Release Strategy

## 2026-10-20 configurable deployment stream — bounded CF lifecycle; P4 review partial

[Owner-approved plan](../plans/frontbase-deployment-profiles-20261020.md): Cloudflare-first/Vercel-second editable binding defaults and secure pre-deployment configuration; Deno deferred. P0 inventories current adapters/button failures from an isolated checkout; P1 proves shared contracts/bootstrap; P2/P3 repair and accept real CF/Vercel deployments; P4 unifies Bindings UI; P5 records fresh button/CLI/install/upgrade evidence. User overrides persist; native resource selection and external credential entry share capability validation. The [P0/P1 checkpoint](../plans/frontbase-deployment-profiles-p0-p1-20261020.md) verifies data-only profile contracts, corrected Vercel local artifact/lifecycle gates and a disposable CF D1 setup→publication→redeploy journey. The [local bootstrap review](../plans/frontbase-deployment-bootstrap-20261020.md) now runs without an application database and passes browser, transport, expiry and credential-isolation tests. The [bounded CF first-install handoff](../plans/frontbase-deployment-handoff-20261020.md) now passes real new Worker/D1 deployment, administrator setup and page publication. [Native KV creation and real app cache use](../plans/frontbase-deployment-native-kv-20261020.md) now pass on a separate disposable Worker/D1/KV with tenant isolation, override precedence and short logical TTLs. [Optional private native R2](../plans/frontbase-deployment-native-r2-20261020.md) now passes real scoped multipart/signed GET/PUT, listing and denial checks on a new disposable host. [Managed identity, exact-binding redeploy and bounded post-upload recovery](../plans/frontbase-deployment-managed-lifecycle-20261020.md) now pass on a new disposable CF target with original session/data/object/cache preservation. Unknown creates, arbitrary enrollment, migration and broader recovery remain open. [Shared pre-/post-deploy Bindings review and native storage affordances](../plans/frontbase-deployment-shared-bindings-20261020.md) now pass on the owned disposable CF target. Post-deploy editing is explicitly proposal-only, with no hot apply; controlled binding changes, complete proposal handoff, other native bindings and exact button acceptance remain open; [Vercel live profile acceptance](../plans/frontbase-deployment-vercel-live-20261020.md) now verifies an actual $0 Turso-backed preview and explicitly approved disposable production deployment through the existing HTTP runner. Proposal import/resource selection and bounded local journals are implemented; exact native buttons, fresh managed Vercel journal installation, optional-binding changes and broader provider acceptance remain open. This is bounded evidence, not host parity or complete profile acceptance. Use disposable projects and separate ownership from the dispatched Study in USA translation stream. Existing release gates and paused CF-22 remain.

## 2026-10-20 post-Homepage work order — session correction delivered

[Active plan](../plans/frontbase-ai-native-translation-implementation-20261016.md) reconciles the delivered Arabic Homepage/dropdown/locale navigation with unfinished translation capability. The [session correction](../plans/frontbase-admin-session-recovery-20261020.md) is deployed healthy with server-cookie validation, coordinated no-replay reauthentication and draft-retention gates. Dashboard loading and retained Arabic navigation are verified. Next: stable selected-page/live-record identities; resumable AI generation and partial-save recovery; history/review/general locale publication and source-change policy; exact localized queries; remaining surfaces and writable-adapter certification; multilingual sitemap/slug migration and operating/package evidence. Non-Homepage bodies remain source-language fallback. The old unsent job is cancelled and uncertain usage retained without blocking publication. No new provider call or public-release gate closure; CF-22 stays paused.

## 2026-10-19 bounded Homepage language publication — delivered

[Receipt](../plans/frontbase-homepage-arabic-publication-20261019.md): actual 85/85 Arabic Homepage fields published through native complete-coverage review, immutable preview and CAS activation. Same renderer, external HTTP revisions, RTL, header language links, source preservation and SEO metadata are verified on staging (`021b100`/`7c2a69f`). No new provider call. Prior generated drafts are retained; obsolete unsent work is cancelled while one uncertain request remains truthfully recorded in reconciliation review. This supersedes earlier “hold unchanged / locale publication next” descriptions for this bounded Homepage slice. Broader page/version/history and live localized query coverage, migration and release gates remain open. The current executable order is maintained in the active plan; stable live-record identity and broader history/publication remain open. CF-22 stays paused.


> **2026-09-06 owner priority — paid Cloud launch:** A-26 authorizes completing the framework's Supabase application-database/auth and Stripe migrations. The free-tier implementation is a baseline, not the launch acceptance gate. Track execution in [CLOUD-LAUNCH.md](../CLOUD-LAUNCH.md). Public-framework release gates and paused CF-22 remain separate.

**Status:** Active preparation

**2026-10-19 bounded pilot update:** [Transo and first Arabic pilot](../plans/frontbase-translation-first-pilot-20261019.md) verifies configured HTTP storage and two saved real-provider drafts; one uncertain request and one unsent field remain on owner-requested hold. Execution remains disabled by default, with an explicit opt-in only on the verified staging host. [Saved Default page preview/manual editing](../plans/frontbase-translation-visual-preview-20261019.md) now has bounded staging evidence. [Next delivery](../plans/frontbase-ai-native-translation-implementation-20261016.md) is revision history/coverage, followed by explicit locale publication. This supersedes blanket actual-provider-pending statements only for this partial pilot; full workflow/provider/host acceptance, package distribution and release gates remain open.

**2026-10-18 bounded provider extension:** [OpenRouter translation integration](../plans/frontbase-translation-openrouter-20261018.md) reuses owned Connected Accounts and the current HTTP/allowance engine alongside OpenAI. Bounded local/USA staging acceptance is recorded; real-model acceptance, new package scope and release availability are not implied. Execution remains disabled by default; CF-22 remains paused.

**First edition accepted (2026-10-08):** Frontbase Framework Developer Preview, for developers and agents operating their own deployment; six Apache-2.0 library packages and separately built application artifacts. Cloudflare leads; other hosts retain evidence-specific support boundaries. The [current R0 refresh and ordered backlog](PUBLIC-RELEASE-R0-2026-10-17.md) guide R1–R4; [original findings](PUBLIC-RELEASE-R0-2026-10-08.md) remain dated evidence. This is scope acceptance, not release availability, package publication or deployment authorization. Full template installation, migration, turnkey full CLI scaffolding and universal host/provider parity remain unclaimed; CF-22 stays paused.

**2026-10-16 accepted package extension (implementation in progress):** The owner requires `@frontbase/translation` as a standalone edge-native AI translation engine. This is an explicit exception to the earlier six-package boundary: a seventh Apache-2.0 library candidate, not a published-package or complete-feature claim. Existing consumers integrate the same engine; the engine cannot require the CMS, builder or a hosted control plane. Its package/host/security/operability evidence is required before distribution, including before publishing an updated core that forwards localization imports. Earlier six-package evidence remains historical and does not automatically cover this addition. Local [revision/SQLite evidence](../plans/frontbase-translation-revisions-20261016.md) covers a bounded engine slice only; it does not close provider, full workflow or release gates. The [HTTP persistence delivery](../plans/frontbase-translation-http-20261017.md) supersedes the direct translation PostgreSQL runtime: the shared Supabase/PostgREST client and narrow invoker RPCs have retained actual HTTPS acceptance. [Storage configuration](../plans/frontbase-translation-storage-20261017.md) adds bounded datasource selection and trusted host resolution; AI accounting and native visual publication remain open. [Input-history/durable-job evidence](../plans/frontbase-translation-jobs-20261017.md) adds deterministic local-provider recovery only, with configured AI/budget/host and visual gates still open. [HTTP accounting evidence](../plans/frontbase-translation-accounting-http-20261017.md) adds bounded real local PostgreSQL/PostgREST parity; [Bounded host request policy](../plans/frontbase-translation-host-allowance-20261017.md) adds local request/configuration guard acceptance; [Bounded cancellation/reconciliation](../plans/frontbase-translation-allowance-reconciliation-20261018.md) adds local lifecycle/CAS acceptance; [reviewed page-text batches](../plans/frontbase-translation-reviewed-batches-20261018.md) add bounded local authenticated API/recovery acceptance behind a disabled-by-default host gate. [Native Settings batch review/progress](../plans/frontbase-translation-review-ui-20261018.md) now has bounded local UI/API acceptance. [Selected menu/live-field inputs](../plans/frontbase-translation-menu-live-inputs-20261018.md) now have bounded local acceptance. [Bounded saved-view field selection](../plans/frontbase-translation-saved-view-inputs-20261018.md) now has local acceptance through shared Inspector filter contracts. [Native review staging delivery](../plans/frontbase-translation-review-staging-20261018.md) is verified with execution disabled and settings/drafts preserved. Other source schemas/adapters, unsupported predicate transports, actual provider/visual acceptance, unattended delivery and monetary guarantees remain open; real execution is still disabled by default. [Decision and package evidence](../plans/frontbase-translation-package-20261016.md). Developer Preview status and all existing release gates remain; CF-22 stays paused.

**Owner:** Frontbase framework

**Last updated:** 2026-10-19

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

The [2026-10-17 R0 refresh](PUBLIC-RELEASE-R0-2026-10-17.md) retains Developer Preview scope and prioritizes a reviewable immutable baseline, distributable backend types, behavior/transport integrity, then clean-checkout and clean-room operations evidence. The following transport follow-ups remain bounded inputs to that backlog, not release clearance.

The [Request-preserving guarded primitive](PUBLIC-RELEASE-R2-REQUEST-TRANSPORT-DELIVERY.md) now reaches the selected SDK paths in [bounded HTTP delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md): 15 functional cases, six independently restored mutations and integrated local gates pass. The two demonstrated Turso-vector/Supabase injection bypasses are closed within those tested paths. Next: review parallel behavior/type evidence and establish a safe Neon policy without per-request global SDK mutation. Native/operator, DNS/egress, remaining wrappers and actual provider/host acceptance retain explicit boundaries; this does not close R2 or M1.

In parallel with explicitly owned work, isolate [behavior fixtures and classification](PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md) without refreshing the ledger to conceal order dependence, and establish an adopted distributable [backend type remedy](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md). R1 lifecycle/full-CMS clean-install and R2/R3 security/host operations evidence remain necessary before R4 publication. R0 and Developer Preview preparation scope are accepted; no GA or general host parity is claimed.

The separate [pilot execution plan](../plans/wordpress-pilot-execution-plan.md) covers M0–M9 through migration, installation, full-catalog publication, production inquiries, reuse, operations and authorized USA cutover. The [namespace inventory](../plans/wordpress-pilot-namespace-writer-inventory.md) blocks claiming a safe installer from advisory checks alone. Pilot acceptance and framework publication are separate finish lines and authorizations. This planning refresh changes no accepted edition scope or release gates; CF-22 remains paused.
