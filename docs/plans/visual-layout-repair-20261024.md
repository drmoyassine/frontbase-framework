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
