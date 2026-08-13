# AGENTS.md

Frontbase is an independently governed, self-hostable, AI/agent-oriented and edge-native app-builder framework. Read [docs/PUBLIC-RELEASE-STRATEGY.md](docs/PUBLIC-RELEASE-STRATEGY.md), [docs/MILESTONES.md](docs/MILESTONES.md), [docs/DECISIONS.md](docs/DECISIONS.md), and [README.md](README.md) before changing product direction or making release claims.

## Product boundary

Frontbase owns its reusable engine, compiler, component system, builder, backend, edge infrastructure, self-hosting experience, packages, documentation, security, compatibility, and release strategy.

NoCodeHero is a downstream education and credential consumer. It may teach Frontbase in the Certified No-code Engineer course, but NoCodeHero does not own Frontbase's vision, roadmap, architecture, or release criteria. Consumer needs may become generalized Frontbase requirements only when supported by technical evidence.

## Current rollout direction

Prepare Frontbase for public release as a self-hostable alternative app-builder and framework centered on:

- AI- and agent-friendly schema contracts, validation, and deterministic tooling;
- edge-native execution and the Chimera one-engine model;
- a complete self-hosted path with code ownership and no required hosted control plane;
- honest portability: distinguish Cloudflare-first workflows from verified Node/Docker or other adapter paths;
- an inspectable Apache-2.0 framework with reproducible examples and security evidence.

Do not market Frontbase as generally available while known public-release gates remain open. CF-22 remains paused accepted residue unless the owner explicitly reactivates it; public-release scope must state what ships without implying complete parity with another product.

## Engineering rules

- Preserve worktree changes and inspect status before editing.
- Do not force-push, rebase, or reset without explicit approval.
- Keep the six-package architecture unless a new accepted decision changes it.
- Run `pnpm -r check`, `pnpm -r build`, and appropriate tests after code changes.
- Security-sensitive changes require their existing mutation/conformance gates.
- Never weaken tenant isolation, secret handling, SSRF protections, auth, or no-leak gates to accelerate release.
- Keep roadmap intent separate from shipped claims in README and release materials.
- Record durable architectural/release choices in `docs/DECISIONS.md`; update `docs/MILESTONES.md` and the strategy document when rollout scope changes.

## Multi-session synchronization contract

Agent chats are not project state. Multiple sessions coordinate through Git and the durable documents named in this file.

At session start:

1. Inspect `git status` without cleaning, resetting, stashing, or overwriting changes.
2. Read this file, `docs/PUBLIC-RELEASE-STRATEGY.md`, `docs/PUBLIC-RELEASE-AUDIT.md`, `docs/MILESTONES.md`, `docs/DECISIONS.md`, and the relevant implementation/delivery evidence.
3. Re-read a document immediately before patching it because another session may have changed it.
4. Claim the authorized work in the audit or applicable milestone before substantial implementation.

During work:

- Preserve unfamiliar diffs; never use broad resets, checkouts, formatters, or generated rewrites to remove another session's work.
- Prefer separate Git worktrees for simultaneous code changes. In a shared worktree, partition file ownership explicitly.
- Keep shipped claims, audit evidence, milestone status, and code synchronized.
- Record new architectural or rollout choices in `docs/DECISIONS.md`; an agent observation alone is not an accepted decision.
- Record consumer evidence as evidence. Do not import a consumer's curriculum, launch date, pricing, or marketing plan into Frontbase product state.

Before handoff:

1. Update the claimed audit/milestone status truthfully.
2. Reconcile the strategy, decisions, milestones, README claims, and any affected delivery evidence.
3. Run verification proportional to the changed surface and record exact results and skipped credential-gated checks.
4. Report modified files, residual failures, uncommitted state, and the next executable task.

When documents and implementation disagree, treat the claim as stale until Git and reproducible verification establish the truth. Never resolve the conflict by choosing whichever chat is newer.

## Release evidence

The public release is gated by the checklist in `docs/PUBLIC-RELEASE-STRATEGY.md`, including package consumability, clean-install proofs, self-host deployment evidence, security blockers, documentation, versioning, support boundaries, and release automation. A downstream course deadline is context, never a substitute for these gates.

## Immediate agent task

Claim and execute **R0 in `docs/PUBLIC-RELEASE-AUDIT.md`**. This is an evidence-gathering and backlog-definition task, not permission to resume CF-22 or begin an uncontrolled feature sprint. Finish with a recommended first public edition/release label and an ordered, evidence-linked backlog.
