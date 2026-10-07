# Editorial review and approval acceptance

**2026-10-06: review evidence and private revision approval delivered; public publication remains pending.** Continues P2b under the [pilot roadmap](wordpress-pilot-roadmap.md). Use existing `/frontbase-admin` and one engine. The checks apply across country templates and connected providers; Wilson is consumer evidence.

**Current status — 2026-10-07:** the correction below was saved as revision 3, language `en`, preserving original identity/path/date/byline. The real record remains Draft with no actual review request or approval. The owner resolved the media choice: empty covers render text-only, missing content is enriched separately. Both generated blog roles and saved local article/list templates opt into this behavior. Earlier revision-2 findings, proposed edits and media-choice tasks are historical, not current blockers. See [parallel handoff](wordpress-pilot-parallel-handoff.md) for exact state and remaining review/hosting gates.

## Pilot article findings

Article 606bbbd5-bc2c-4179-bb4c-c8ab480b3bb8 (WordPress 3986) was last verified as draft revision 2, language unset, no cover. This increment makes no database read/write. Preserve its original `/blog/tori-murden-mcclure-inspires-wilson-college-graduates-at-155th-commencement/` path and April 19, 2025 publication timestamp.

Primary sources checked October 6, 2026:

- [Wilson's April 1 announcement](https://www.wilson.edu/adventurer-and-academic-leader-address-wilson-college) confirms the May 4, 2025 ceremony, 155th commencement and speaker. It supports the biography: 14-year presidency, Atlantic journey/boat, polar expedition, memoir, NCAA roles and earlier employment. The president's remarks express expectations rather than a report of the completed speech.
- [Wilson's May 9 retrospective](https://www.wilson.edu/commencement-weekend-2025) confirms the later ceremony and McClure's participation. This later evidence must not appear as reporting available on April 19.

The supported event date need not change; the defect is retrospective wording under an earlier publication date. Proposed correction: rewrite event/graduate outcomes as an announcement and attribute expectations. Alternatively, label a dated editorial update reporting the later event, retaining the original date and recording a separate correction date. Do not manufacture a new original publication date.

Suggested announcement opening: “Wilson College has announced Tori Murden McClure as its commencement speaker. The ceremony is scheduled for May 4, 2025.” Check the title, excerpt and later paragraphs for the same timeline. Replace unsupported descriptions of what the address said or how graduates reacted. These edits are proposed, not saved or approved.

| Check | Current finding | Required resolution |
|---|---|---|
| Facts/chronology | Biography/event supported; retrospective wording conflicts with original date | Correct announcement wording or label a dated update; record sources |
| Language | English body; canonical language unset | Save `en` with the current expected revision; verify template language |
| Media | No recovered cover URL/thumbnail ID | Explicitly accept text-only or select through connected storage; review suitability, rights and alt; no silent substitute |
| Formatting | Twelve converted blocks; conversion is not fidelity proof | Inspect preview, headings, links and unsupported features; resolve relevant recovery flags |
| URL/SEO | Original path/date retained | Preserve path; verify title/description/canonical, dates/byline, index/sitemap on published host |
| CTAs | Inquiry invitation | Verify intended action; a link does not prove form delivery |

## Reusable admin behavior to implement next

Administrator flow: **Draft → Request review → Approve revision → Include in site publication**. The first three are implemented; the delivery below records verification. Inclusion in a coherent published site remains pending. The current schema/trigger deliberately prevents publishing the canonical draft. Do not simply broaden status or expose requested rows.

1. Keep private structured checks for the exact document revision: facts/chronology, language, media, formatting/links, URL/SEO and CTAs. Values: passed, unresolved, or justified not-applicable. Keep evidence/reasons private. An optional missing cover can be justified; an unresolved factual error cannot pass. Resolve recovery flags or explicitly justify exclusion.
2. Approval requires all required checks resolved, a server-derived authenticated reviewer, exact document/configuration revisions and an atomic conflict check. Never trust browser-supplied reviewer identity/time. Stale/ambiguous results cannot permit blind retry. Review requests remain unpublished.
3. Materialize an immutable, bounded approved snapshot with allowlisted public fields and a fingerprint. Later draft edits leave that snapshot unchanged. Approval of an older revision cannot approve new text. Exclude evidence, notes/history, provider IDs and credentials from public output.
4. Site preparation binds snapshots to fixed configuration, templates and the original route manifest in [P2a](wordpress-pilot-p2a-contract.md). Validate ownership, destination/source scope and collisions. Approval alone does not change the active site or visitor caches.
5. Activate only a completely prepared version with an expected active generation. Incomplete preparation leaves the previous site live. Version-bound cache keys and rollback select a complete prior version; mutable datasource content cannot silently replace approved content. Hosted SEO/URL checks remain required.

These are proposed contracts. Record a durable architectural decision before adopting a new approval storage design. Reuse existing auth, datasource ownership, queries, publication seams and storage. No second admin, site registry, renderer or public write RPC.

## Ordered acceptance work

1. Correct the single draft using a fresh server-read revision, save English language and source/review notes, preserve identity/archive; visually review and resolve cover versus text-only.
2. Implement private revision-bound review/approval in existing Page Settings/server contracts. Prove stale/conflicting approvals, owner isolation, identity-spoofing refusal and atomic snapshot recovery. Schema changes require deny/public-projection tests and existing security gates.
3. Implement site preparation/activation through existing compiler/backend/engine. Prove draft privacy, allowlisted anonymous output, stale-approval refusal, collision failure, partial-activation safety, cache separation and rollback.
4. Demonstrate institution/program/article together on isolated staging with original paths/SEO, then scale imports and verify second-country configuration.

P2b/P2c and public activation remain open. R0 remains in progress, CF-22 paused, framework release scope unchanged.

## Correction delivery — 2026-10-06

Existing authenticated read/save/read API corrected article 3986 with expected document revision 2/configuration revision 4. Saved revision 3 now uses an announcement title/excerpt and replaces four paragraphs containing retrospective or unsupported reaction claims. Language is `en`; review remains draft. URL, original timestamp, byline and unassigned cover are unchanged. The private review note records source and outstanding checks. Direct Postgres verification confirms draft/revision 3 and archived revision 2 (two prior snapshots total). No grants, schema, template layout, approval or publication changed.

Actual existing-admin editor reopened revision 3 with corrected fields; refreshed one-engine canvas displays the new title/body and unchanged original date/link. Private before/request/after JSON and editorial-correction-canvas-proof.jpg retain evidence. Preview has one H1 and H2/H3 body headings, but the missing cover produces a large placeholder. Text-only presentation/cover decision, CTA behavior and hosted SEO still need resolution. Next implementation: private revision-bound review/approval and immutable approved snapshots with the acceptance tests above.

## Private approval delivery — 2026-10-06

Existing Page Settings now offers six explicit review confirmations and a private evidence/reasons note. Saved review-requested content can be approved into an immutable owner-scoped control-settings snapshot. Exact document/configuration revisions, server reviewer/time, atomic configuration check, duplicate refusal and allowlisted SHA-256 content fingerprint are enforced. Unsaved/conflicted/ambiguous approval disables retry; reloading shows metadata only for that exact revision and configuration. This does not activate a route or expose private evidence. Structured passed/unresolved/not-applicable records are not separately implemented: confirmations plus reasons capture the current manual review; automated factual verification is not claimed.

SQLite route/store fixtures verified approval creation, duplicate/configuration races, spoofed identity/unknown checks refusal, source revision changes and private field exclusion. These fixtures do not prove remote D1/Postgres control-store races or hosted publication. Actual local editor shows the checks disabled for the real article: API confirms revision 3/draft, approval null and publicationAvailable=false. Private editorial-approval-controls-proof.jpg and editorial-approval-app-read.json capture evidence. No actual pilot approval/request, canonical mutation, schema/grant change or public activation occurred.

Workspace check/build and staging passed; focused console 17/17 and final editor 8/8 passed. Approval mutation 7/7, existing editorial mutation 6/6 and core binding mutation 4/4 passed and restored. Security/database-security, tenant matrix 175/175 and no-leak gates passed. Strict compatibility remains incomplete with zero violations and nine unreachable fixtures. Exact attempts/residuals are in the audit. Next: approved snapshots consumed by coherent site preparation/activation/cache/rollback, with actual content/CTA/media and hosted SEO acceptance still required. The final core/template/consumer packaging review is an owner-required completion gate.

## Optional cover decision and delivery — 2026-10-07

The owner explicitly defers missing-content enrichment to a separate pass and accepts automatic text-only presentation while a cover is empty. A missing optional cover is intentional for this pilot; no invented replacement or further media choice is required. Rights/alt/suitability still apply when a cover is added.

Generated article list/detail templates set the existing Image record binding hideWhenEmpty=true. Saved local article and article-index templates have the same targeted opt-in, with recoverable before-change versions. Empty covers collapse without reserved image height; safe populated covers render automatically. Other layout nodes and canonical article content/review state are unchanged. Six focused template/canvas tests cover both roles and absent/present images; core binding fixtures, workspace check/build and console staging pass. Actual builder renders the corrected article as text-only; private article-optional-cover-proof.png records the result. Main pre-existing Modified editor state was preserved. This resolves cover presentation, not article/site approval, remaining formatting/CTA/SEO or future enrichment.
