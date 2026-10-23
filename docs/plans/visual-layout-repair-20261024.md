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

Status: implementation and focused regressions underway; deployment/native acceptance pending. No release or owner-content publication claim.

## First native acceptance and follow-up

Source `3805d6e`, staged artifact `41b298f`, deployed on 2026-10-23 at 23:13:49 UTC (image `sha256:1df778f6f24689b029b2f952cf9d29466fb9d01a777768664f62e759f9e05a4a`). The real Explore builder accepted Row into the card, Layers title nesting, palette Icon insertion before the bound heading, 12px gap and centered alignment, canvas move-handle reparenting, Layers outdenting, canvas/property text changes across all 12 displayed records, and undo/redo. Test edits were discarded by reload; no owner page was saved or published.

Follow-up: canvas typing previews in the Properties field without changing layout or losing the caret, then commits one history transaction on blur/Enter. Desktop/tablet/mobile preview widths now remain their selected dimensions instead of shrinking to sidebar space; zoom scales layout bounds and horizontal scrolling is available. Cache the overlay tree/geometry derivations across hover changes. The Row renderer regression is included in the normal edge-core test command.

Verification: recursive check/build pass; focused suite 29 distinct tests passed, including 8 rerun after the live text follow-up. Edge-core functional suite and new visual-layout renderer check passed. Console and host builds pass; prohibited-symbol check passes. Full console standalone TypeScript remains failing in pre-existing unrelated debt, including Object.hasOwn library-target diagnostics; no claim that gate is clean. Follow-up deployment/native viewport and typing checks pending.
