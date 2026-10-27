# Frontbase competitive roadmap proposal

**Date:** 2026-10-03
**Status:** Proposed; decision-ready planning input, not accepted scope or shipped claims.
**Audience:** Frontbase owner and implementers.

## Objective and boundaries

Make Frontbase a compelling choice against EmDash for independently owned, agent-assisted applications combining visual UI, external data, and workflows. Pursue CMS parity and broader leadership in stages. Winning every metric is not a credible release promise: distribution, ecosystem size, user preference, and a moving competitor cannot be guaranteed by engineering.

Preserve the six reusable package boundaries, the one-engine model, Apache-2.0 framework direction, and the existing R0–R4 gates. Console/runtime delivery artifacts remain distinct from the reusable package set. CF-22 stays paused accepted residue; fixes to concrete release journey defects do not authorize an unrestricted parity sprint. New architectural choices, a CF-22 restart, or adopted rollout changes must be recorded in the canonical decisions, milestones, and strategy before implementation.

Recommended first public edition: **Frontbase Framework Developer Preview**, including the visual builder, supported components, registered data queries, supported workflow nodes, and administration on explicitly verified hosts. Require Cloudflare and Node/Docker evidence to claim both; defer Vercel/Deno support claims until live proof exists. Exclude complete CMS/editorial parity, arbitrary untrusted plugins, every-host parity, dedicated tenant engines, and unimplemented commercial benefits. Promote to beta after repeatable external adoption and upgrade evidence. This recommendation is not an accepted label.

Frontbase Cloud paid beta is a separate release lane governed by A-26 and CL-7. Package publication is not its launch prerequisite. Neither lane can use the other's evidence to waive its own gates.

## Baseline and evidence

| Evidence | Planning consequence |
|---|---|
| [Release strategy](../history/PUBLIC-RELEASE-STRATEGY.md), [R0 audit](../history/PUBLIC-RELEASE-AUDIT.md) | External package installation, clean-room self-hosting, versioning, and release operations remain open; R0 is not complete. |
| [Milestones](../history/MILESTONES.md), [decisions](../history/DECISIONS.md), [README](../../README.md) | Engine/compiler/builder and workflow capabilities exist. Broad coverage is not evidence of equivalent UX depth. Claims need reconciliation. |
| [Agent authoring](../guides/agent-authoring.md), [compiler tests](../../packages/compiler/package.json), [canvas parity](../../packages/builder/test/canvas-parity.mjs), [renderer parity](../../packages/edge-core/test/sw-renderer-parity.mjs) | Build on existing schemas, JSON diagnostics, and render parity; do not replace the renderer to copy Astro. |
| [Cloud launch](../CLOUD-LAUNCH.md), [operations](../CLOUD-OPERATIONS.md) | Sandbox customer journey, backup/isolated restore, and rollback evidence exist. Deliverability, alert/support ownership, production sign-off, and live-mode acceptance remain open. These tests were not rerun for this proposal. |
| [Node/Docker guide](../guides/self-host-docker.md), A-24/A-26 in [decisions](../history/DECISIONS.md) | Audit each host/state-DB combination. Cloud PostgreSQL implementation does not prove arbitrary PostgreSQL self-host support. |
| [EmDash 1.0 announcement](https://blog.cloudflare.com/emdash-cms-plugin-registry/) | Stable CMS and a plugin registry were announced September 28; EmDash Build is alpha. The CMS README's beta label conflicts with the dated announcement. |
| [EmDash MCP](https://docs.emdashcms.com/reference/mcp-server/) | A real authenticated site-management protocol is the agent baseline; Frontbase MCP client nodes or compat operation registration do not establish equivalent server behavior. |
| [EmDash Build](https://github.com/emdash-cms/emdash-build), [page layouts](https://docs.emdashcms.com/guides/page-layouts/) | They have AI generation and editable sections. Do not position them as a CMS with no visual authoring. |
| [Plugin formats](https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/), [sandbox](https://docs.emdashcms.com/deployment/plugin-sandbox/) | Sandboxed and native extensions have different trust boundaries; sandboxing is meaningful competitive work, not a marketing checkbox. |
| [Cloudflare blog migration](https://blog.cloudflare.com/cloudflare-blog-uses-emdash/) | They have public production-use evidence. Frontbase needs adopter case studies and operations evidence, not only synthetic gates. |

## What winning each dimension requires

All targets below are proposed acceptance measures, not current results. Establish baselines before selecting final thresholds.

| Dimension | Pre-release floor | Post-release route to leadership | Evidence of success |
|---|---|---|---|
| Installation and documentation | Versioned packages, one supported starter command, clean-room CF and Docker paths, troubleshooting | Guided setup, reusable templates, automated docs checks, host-specific diagnostics | At least 4/5 independent adopters publish unaided; target median <=30 minutes excluding account approval, then improve against EmDash on matched website tasks. |
| Visual authoring | Reliable edit/save/preview/publish, responsive layouts, clear failures, keyboard basics | Undo/redo, reusable sections, design tokens, richer data bindings, accessible controls | >=90% task completion in a predefined usability cohort; compare website tasks with EmDash and evaluate app tasks separately. |
| CMS/editorial | Honest supported-content boundary; no promised editorial feature without proof | Collections/relations, structured rich text, media, revisions, scheduling, taxonomy, SEO, localization, editorial roles | A representative publishing team completes its daily workflow unaided; migration/import preserves supported content and media. |
| Agent management | Inspect working endpoints; schemas and CLI validation documented; advertise only verified behavior | Authenticated MCP for pages, data bindings, workflows, content and deploy planning; scoped grants and audit | Real MCP clients complete versioned tasks; negative auth/tenant cases fail closed; target >=90% completion on >=30 tasks with retries/cost reported. |
| AI site/app generation | Reproducible agent-authored example with validation and human review | Plan -> schema/tree/graph patch -> preview -> validate -> approve -> publish; revisions and rollback | >=80% of a versioned cohort of 20 briefs produce usable results within a fixed retry/token budget; include manual-edit survival. |
| Data and workflows | Prove a portal using external data and a durable workflow | Forms/CRUD, permissions, pagination, retries, schedules, execution traces, connector conformance | End-to-end business workflow survives restart/retry without duplicate side effects; cross-tenant access is rejected. |
| Rendering and performance | Existing parity/no-leak gates; real page/browser measurements | Profile expensive components/queries, cache invalidation, SW fallback, accessible interaction | Matched assets/content/hosting, p50/p95, cold/warm, Web Vitals, script bytes and billed resources. No superiority claim from render microbenchmarks alone. |
| Security and extensions | Close known blockers; mutation/conformance gates; trusted extensions only | Scoped component/query/workflow SDK; then isolated untrusted execution with reviewed threat model | Exfiltration, SSRF, resource exhaustion, cross-tenant and undeclared-access cases denied; independent review before public untrusted plugins. |
| Portability and ownership | Verified CF + Node/Docker, no required hosted Frontbase control plane | Versioned project export/import, host transfer, optional providers, tested state-DB matrix | Move the same app/data/assets between claimed hosts and verify behavior; no concealed mandatory Cloudflare/Supabase/Stripe service in self-host defaults. |
| Reliability and upgrades | Backups/restores, reversible migrations, rollback and secret rotation documented/tested for supported edition | Upgrade preflight, migration diagnostics, compatibility policy, recovery automation | Restore and upgrade across supported releases with data integrity and measured recovery time; publish tested limits. |
| Ecosystem and adoption | Three maintained examples, contribution/security/support paths | SDK cookbook, curated extensions, maintainers, integrations, public case studies | Independent contributions and retained production adopters; no promise to exceed Cloudflare's reach or raw star count. |
| Hosting and economics | Separate self-host/Cloud configuration and truthful operating-cost breakdown | Better provisioning, plan/usage accuracy, operational transparency; domains only when implemented | Comparable monthly workloads with compute/storage/egress/model costs and operator effort disclosed. No unconditional cheapest-host claim. |

## Capacity and scheduling

Assume one primary engineer, part-time owner review, access to deployment credentials, and external testers. Reserve roughly 25% of engineering capacity for defects, support, documentation, and security work. Run one substantial feature stream at a time. Recruit part-time UX and security help when those streams start; a full plugin sandbox and polished CMS should not be treated as small solo tasks.

Pre-release allowance: **8–12 focused engineering weeks**, approximately **10–16 calendar weeks** with the reserve. This is a planning envelope from kickoff, not a promised date. Re-estimate after R0 and the first external install. Post-release phases are ordered capacity envelopes; the breadth below can take **12–18+ months** for one engineer. Release smaller increments throughout. If capacity changes, parallelize bounded surfaces without weakening shared gates.

## Pre-release ordered backlog

| ID / priority | Work and owning surface | Dependency | Acceptance evidence | Allowance |
|---|---|---|---|---|
| PRE-0 / P0 | Finish R0 evidence table; classify packages/artifacts, supported hosts, limitations, security residue; reconcile README/history/delivery claims. Owner accepts preview scope. `docs/history/*`, manifests, README | None | Every headline claim linked to code and reproducible evidence; all known blockers classified; ordered release backlog; explicit R1 go/no-go | 1 week |
| PRE-1 / P0 | External tarball install, coherent versions/exports, replace workspace coupling in distributable artifacts, versioned starter. `compiler`, reusable manifests, release scripts | PRE-0 | Clean directory outside monorepo installs packed packages, creates/builds app, consumes exports; no local repo/private artifact dependency | 1–2 weeks |
| PRE-2 / P0 | Clean-room CF + Docker full journey including first-admin setup, secrets, save/publish, restart, backup/restore, upgrade/rollback. `edge-infra`, `backend`, `cf-full`, guides | PRE-1 | Independent adopter reproduces each advertised host path; credential-gated checks recorded by host, with exact commits and commands | 2–3 weeks |
| PRE-3 / P0 | Security/operability closure for selected edition: reset, key storage/reveal, auth, tenant isolation, SSRF, secrets and recovery; repair only demonstrated defects. `backend`, `edge-infra`, security gates | PRE-0; final verification after PRE-2 | `pnpm -r check`, `pnpm -r build`, applicable tests, mutation, conformance/no-leak and deployed smokes pass from clean checkout; skips remain visibly open | 1–2 weeks, expandable for blockers |
| PRE-4 / P1 | Polish the accepted first-use journey; remove dead UI/stubs from advertised flows; template portal, directory, and content site; accessibility smoke. `console`, `builder`, `ui-components`, examples | PRE-2/3 | Fresh users edit responsive page, bind data, run workflow, save/reload/publish and recover from validation failure; no data loss or hidden stubs | 1–2 weeks |
| PRE-5 / P0 | Release candidate docs, changelog/version policy, publishing CI, security reporting, upgrade/support boundaries, five-person clean-room pilot. `docs`, `.github`, scripts | PRE-1–4 | >=4/5 publish unaided; all critical pilot defects fixed; rollback rehearsal; exact release manifest and artifacts reviewed before publication | 1–2 weeks |

PRE-2 and PRE-3 share evidence and may overlap; the range is not a sum of maximum estimates. Cut preview scope if new feature work would exceed the envelope; do not cut security, recoverability, or adoption proof. A full AI builder, broad editorial system, marketplace, custom domains, and new deploy targets are not preview prerequisites.

Separate Cloud lane: finish existing CL-7 deliverability, monitoring/alert ownership, support routing, production-edition review, and approved live-mode acceptance. Reuse existing sandbox billing and backup/restore evidence where applicable. Schedule this lane explicitly against shared capacity; do not silently add it to PRE-0–5. Publish Cloud only after its own owner/provider gates pass.

## Post-release sequence

| Phase | Work | Dependency and exit gate |
|---|---|---|
| POST-A: first 4–6 weeks | Stabilize install/upgrade/support; deliver a narrow authenticated MCP vertical slice using existing backend behavior, starting with read/validate and scoped draft editing. Add audit records and revision/conflict control before publish tools. | PRE-5; protocol and authorization design review. Real clients pass allowed/denied tenant cases and complete page-edit tasks. Existing compat registration is not counted as a completed MCP server. |
| POST-B: following 6–10 weeks | Deepen the app-builder advantage: forms/CRUD, richer bindings, workflow debugging/retries, reusable sections, responsive controls, undo/redo. Add bounded prompt-to-app generation through the same contracts and draft APIs. | POST-A and pilot evidence. A real portal runs data + workflow + auth; agent and human edits preserve each other's work; validation, review, and rollback are visible. |
| POST-C: following 8–12 weeks | CMS parity for the chosen publishing audience: collections/relations, structured rich text/media, revisions and draft/live comparisons, scheduling, SEO, taxonomy, editorial permissions. Define localization and WordPress import scope from adopter evidence. | Stable revision/permissions model from A/B. Publishing-team pilot, scheduling failure/retry tests, media integrity, role tests. Migration preserves supported fields, URLs and media; unsupported blocks get a report. |
| POST-D: following 6–10 weeks | Portability and operations depth: app export/import, CF-to-Docker transfer, proven DB combinations, upgrade preflight and automated recovery. Promote Vercel/Deno only after real deploy/upgrade proofs. | Versioned content/project formats from C; existing provider contracts. Same app/data/assets retain behavior across claimed hosts; restore and upgrade results published. |
| POST-E: following 8–16+ weeks | Extension SDK and curated trusted components/connectors first. Design and review isolated untrusted execution, capability grants, signing/version compatibility, quotas, egress policies and revocation. Consider a registry after independent extension demand exists. | Stable contracts, threat model and separate accepted architecture decision. Security review plus abuse/conformance suite before arbitrary third-party execution; at least three independent useful extensions before expanding marketplace investment. |
| POST-F: continuous, with quarterly reviews | Production case studies, tutorials, contributor onboarding, UX research, performance and cost comparisons, release reliability. | Each phase supplies real adopters. Publish task completion/retention and fair benchmark evidence; redirect work using observed failures, not a static competitor checklist. |

The phases are deliberately sequential for solo capacity. Localization, broad WordPress compatibility, advanced plugin isolation, and additional host matrices can extend the range substantially. Only move an item earlier when repeated adopter evidence outweighs the delayed work.

## Measurement and review

Maintain a versioned benchmark set: content website, data-backed directory, authenticated portal, and workflow application. Compare shared website/editorial tasks fairly against pinned EmDash CMS/Build versions. Evaluate unsupported app tasks as capability coverage, not as an invented latency win. Publish test configuration, failures, manual intervention, retries, model/token costs and exclusions.

Pilot sample sizes above are release signals, not statistically conclusive superiority evidence. Match tester experience, alternate product order, use identical tasks/assets, and define thresholds before tests. For accessibility target WCAG 2.2 AA with automated and manual keyboard/screen-reader checks; avoid compliance claims based only on automated scans.

Review every four weeks: onboarding success/time, saved/published data integrity, active/retained projects, agent task completion, upgrade/restore success, support load, security findings and matched workload cost. Promote preview -> beta -> stable through evidence and accepted release criteria, not elapsed time. Stable additionally requires a supported upgrade window, published compatibility commitments, operational ownership and sustained production adoption.

## Immediate executable task and verification record

Start with PRE-0: finish the existing R0 table using package inventories, scoped code inspection and fresh evidence; then perform the PRE-1 external tarball/install proof. The competition research does not complete R0.

This proposal was prepared from Git status, local repository documents/manifests/test sources, and the linked current primary EmDash sources. No product code, deployment, package publishing, or accepted release-scope change was performed. Typecheck/build/runtime/security gates were not rerun because this change is documentation-only; existing results remain dated evidence. Documentation links and whitespace are checked separately in the supporting audit handoff.
