# Visual layout repair — 2026-10-24

Owner-authorized session: start 2026-10-23 22:57:50 UTC; stop no later than 2026-10-24 01:57:50 UTC. Repair the four reported authoring defects, retain existing data/translation bindings, use existing builder/store/history/renderers, and preserve owner content. Independently proposed additions belong on a separate unmerged branch.

## Fixed scope and findings

1. Canvas drop feedback: nested sibling boundaries were absent; target geometry was deduplicated to the first record. Show explicit blue sibling boundaries and Inside-container feedback during drag, use the rendered flex direction including RTL, and register each displayed record instance against its authored template identity.
2. Canvas/property text: Text renders `content`, while inline editing stamped `text`; hydrated record instances were not restamped. Use the actual canonical field, stamp hydrated instances, retain record expressions as bindings rather than editing one displayed value into the template, restore markup on Escape, respect IME composition.
3. Row/Icon/Title composition: the move handle overwrote dnd-kit’s pointer listener; Row’s advertised gap/alignment/justify props never reached the renderer. Restore drag activation and connect those props through the shared renderer. Expose Row mobile stacking and wrapping without changing existing mobile defaults. Existing Styling controls remain the source for detailed responsive dimensions/spacing.
4. Layers nesting: the old handler explicitly refused cross-parent moves. Add distinct before/inside/after targets, expand destination parents, and route moves through the existing store. Reject cycles and missing parents before removal; account for original sibling-boundary indexes; preserve inherited Block Version protections and undo/redo.

## Acceptance

- Automated: actual selection→inline edit→store→undo/redo, record expression refusal, Escape/IME, composition and reparenting without loss, invalid destination/cycle/inheritance refusal, RTL flow, every repeated target, Layers event→store nesting/outdenting.
- Renderer: Row/Column controls, mobile defaults/override, explicit style precedence and attribute escaping.
- Required workspace check/build and edge-core functional tests; retain historical full-console type debt as a separate gate.
- Native staging: drop Row into Card, move title into Row, add Icon before title, set gap/alignment, change plain text in both directions, undo/redo, Layers nesting/outdenting, repeated-instance drop and mobile layout. Discard test changes and verify published English/Arabic pages remain available.

## Optional branch only

After core acceptance, consider a small “Wrap in Row/Column” action for the selected element. This is an independently proposed shortcut, not a prerequisite for the repair, and must not be merged or deployed until requested. No new freeform positioning engine, multi-user collaboration, vector editor or broad Figma-parity claim.

Status: core repairs deployed and verified; optional shortcut remains a separate-branch proposal. No release or owner-content publication claim.

## First native acceptance and follow-up

Source `3805d6e`, staged artifact `41b298f`, deployed on 2026-10-23 at 23:13:49 UTC (image `sha256:1df778f6f24689b029b2f952cf9d29466fb9d01a777768664f62e759f9e05a4a`). The real Explore builder accepted Row into the card, Layers title nesting, palette Icon insertion before the bound heading, 12px gap and centered alignment, canvas move-handle reparenting, Layers outdenting, canvas/property text changes across all 12 displayed records, and undo/redo. Test edits were discarded by reload; no owner page was saved or published.

Follow-up: canvas typing previews in the Properties field without changing layout or losing the caret, then commits one history transaction on blur/Enter. Desktop/tablet/mobile preview widths now remain their selected dimensions instead of shrinking to sidebar space; zoom scales layout bounds and horizontal scrolling is available. Cache the overlay tree/geometry derivations across hover changes. The Row renderer regression is included in the normal edge-core test command.

Verification: recursive check/build pass; focused suite 29 distinct tests passed, including 8 rerun after the live text follow-up. Edge-core functional suite and new visual-layout renderer check passed. Console and host builds pass; prohibited-symbol check passes. Full console standalone TypeScript remains failing in pre-existing unrelated debt, including Object.hasOwn library-target diagnostics; no claim that gate is clean. Follow-up deployed and verified below.


## Final core acceptance

`0964163` source and `83336d5` host artifact are pushed. Archive SHA256 `84D19F195CF01F1CC86148B16BFFB03EBD35C9BBA3F0807B89ED37DCC89DA711`; EasyPanel deployment succeeded 2026-10-23 23:29:54 UTC with image `sha256:06a3289c41147163e7ba87b184dea54062a4497c5fce02591bc1399bace64175`.

The final browser pass verified desktop three-column layout at a true 1200px viewport, 50% zoom, mobile single-column layout, insertion through the second repeated card at 50% zoom, live canvas typing appearing immediately in Properties, Escape restoring both canvas and panel, and visible blue drop boundaries/container outlines during active drag. Temporary edits were discarded. Anonymous `/`, `/ar/`, `/explore/?type=institution`, and `/ar/explore/?type=institution` all return HTTP200. Core work does not change saved owner layouts.

The existing eSSR preview still replaces its document after a committed layout change and refreshes live records; this is not a new instantaneous incremental-render engine. Typing now avoids those replacements until commit. No optional shortcut is included in this deployment.

## Final review follow-up

The canonical text helper now follows the renderer's actual legacy fallback order (`content`, `text`, and Text's `value`). Canvas, property edits and mapping shortcuts clear alternate aliases so empty edits cannot resurrect stale text; live draft projection uses the same helper. Fourteen targeted tests pass after this follow-up (one additional regression, 30 distinct core-focused cases across the session).

Text's existing Font Size control accepted literal values such as `24px` but the renderer converted them to nonexistent theme-variable names. The shared renderer now accepts explicit CSS lengths/percentages, keeps existing named-token behavior and refuses malformed size input. Exact-size and invalid-input tests join the normal visual-layout renderer suite. Final build/deploy acceptance is recorded after qualification.

Optional work is implemented only on `codex/visual-layout-shortcuts-20261024`, commit `20eef2f`: Wrap in Row / Wrap in Column in the Layers action menu, preserving child identity/bindings/versions, selecting and expanding the wrapper, and atomic undo/redo. Six tests and recursive check/build passed. It is not merged or deployed. It remains a reviewable experiment; merging requires the owner's request.


## Closeout — 2026-10-23 23:48 UTC

Final source `d68dcca`, artifact `629e938`, archive SHA256 `D19D62C57FF5A79CC0F1774CF986F0B8B492F01EB6CB48D588D4EEEDC3ADA187`. Deployment succeeded 23:46:11 UTC, image `sha256:8f36b37027c6361812bb0b30b667f63908a9ab9d86a3fabd4f68b9a2e5489701`. Recursive check/build, complete edge-core functional suite (including byte parity15/15 and WYSIWYG parity14/14), visual layout/font-size regressions and client prohibited-symbol check pass. Native final build accepts Arabic Text content and literal24px sizing across repeated cards; clearing text leaves it empty. Test edits discarded and owner page remains unsaved by this session. Four English/Arabic public routes remain HTTP200 after rollout. A brief service-unreachable response during container replacement cleared after startup; final admin route and authenticated builder work.

Core changes and receipt are committed/pushed. Optional `20eef2f` is independently pushed and verified not to be an ancestor of the deployed branch. No optional feature was merged or deployed. The original/shared worktrees are unchanged by this session. Work finished in approximately51 minutes, within the three-hour maximum. Remaining limitations are the documented full-document preview refresh on committed layout changes and pre-existing full-console standalone TypeScript debt; no broad Figma parity or public-release readiness is asserted. Next owner action is review of the optional branch if desired; no credential-dependent action is required for these repairs.
## Optional branch experiment (not deployed)

Claimed on `codex/visual-layout-shortcuts-20261024`: only add Wrap in Row / Wrap in Column to the existing Layers action menu, preserving the selected element's identity, data expressions, styling and Block Versions inside the new wrapper. Reuse the existing replacement action and history/version guards; one undo returns the original tree. Refuse wrapping while the selected element's alternative is active. No unwrap, multiselect, layout engine or unrelated feature expansion. Implemented and verified: six tests pass, including the actual keyboard-opened Layers menu action, identity/binding/version retention, atomic undo/redo, missing target and inherited/active-version refusal. Recursive check and build pass. This experiment is not deployed, not merged, and has no live browser acceptance claim; it must remain unmerged until the owner requests it.

## Owner-approved merge and deployment

Owner requested merge and deployment of the optional shortcuts. Integration in progress; retain historical isolated-branch receipts above. Qualification and staging verification pending.
