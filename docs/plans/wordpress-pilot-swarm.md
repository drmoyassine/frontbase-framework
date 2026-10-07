# Pilot parallel execution

**2026-10-07 — owner-authorized dispatch from pushed checkpoint `0629e80`.** Branch `codex/wordpress-pilot`. Three implementation agents are assigned substantial bounded work in separate managed worktrees; the primary retains architecture, activation-control implementation, integration and independent acceptance. Dispatch does not mean delivery or acceptance.

| Agent | Chunk and required delivery | Boundaries |
|---|---|---|
| `browser_storage_gates` | Actual browser test with an old controlling/caching SW transitioning to the current emitted network-only SW; safe S3 smoke fixture alignment preserving URL validation and signing checks | Isolated synthetic host/browser/storage state; no production guard changes or shared local pilot state |
| `captured_seo` | Concrete captured metadata/indexing/sitemap contract, then bounded implementation and failure/owner/version tests after primary agreement | One reviewed owner-bound capture, no mutable canonical reads, no-store retained, activation controls closed |
| `template_completion` | Generic optional-contact visibility, deterministic editorial date presentation after agreed contract, approved-blog synthetic host proof with normal CSS/long content/optional covers at three widths | Existing engine/bindings/admin; synthetic approvals only, no real content approval or saved-layout writes |

Each agent must create its own worktree from the exact checkpoint, read governance and delivery evidence, claim exact files in that worktree's audit, and use dedicated delivery documentation. Run workspace check/build and affected tests/security gates, record attempts/failures/skips, and commit scoped work locally without pushing. Return the commit SHA and evidence to primary review. Overlapping core files are reconciled by the primary only after design agreement and independent tests; no blind merging of concurrent contracts.

Primary review preserves the six packages, one engine, self-host-first topology, original WordPress paths, authoritative Supabase content and connected-storage ownership. No credentials, private records or recovery snapshots belong in the branch. Agents do not manipulate the parent's local server, DB or Modified builder tabs. Actual site publication/deployment and production cutover are outside this dispatch.

The checkpoint is verified to the limits in the [review](wordpress-pilot-t2-review.md) and [audit](../history/PUBLIC-RELEASE-AUDIT.md): check/build, directory42/42 and bounded host/security evidence pass; strict conformance retains nine unreachable fixtures and broad CMS smoke retains eight S3 fixture failures. Agents must not convert those failures into release-readiness claims. R0 remains in progress; CF-22 remains paused. Final installable-template/core/consumer packaging and reuse review remain required.

Primary next: settle proposed contracts, review delivered commits, run integrated gates, then complete guarded publication controls through the reviewed wrapper. See the [roadmap](wordpress-pilot-roadmap.md).
