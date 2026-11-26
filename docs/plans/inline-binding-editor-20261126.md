# Inline binding editor

Use the selected field's blue label for record actions and a shortcut to its layout binding. Use a single editing surface on the page for static text and inline binding chips. A chip shows an available sample value and offers replacement or removal. The floating editor retains page-wide navigation, layout history and draft controls.

## Delivery sequence

1. Add field actions to the label and keep record commits on the existing atomic source and translation paths. Show the destination and keep the Builder shortcut scoped to the selected element.
2. Share the inline composer and binding representation with Builder. Read existing field bindings and before/after variables as editable parts. Save new parts to the guarded layout draft and preserve link destinations, action settings and the live record identity. Support text, headings, paragraphs, links and buttons.
3. Expose the live Saved View total from the related programs query. Reuse the existing server total for the count element and composed label. Translate literal words through the existing localization surface and keep the number tied to the current query.
4. Verify composition, replacement, removal, undo, stale-save and permission behavior using isolated records. Deploy the verified artifact with the current Study-in-USA bindings. Exercise the signed-in editor in English and Arabic, discard test edits, and compare the public publication before and after.

## Acceptance examples

- Open the Dominican institution title’s field actions, inspect its record edit controls, and open **Edit binding**. The existing title appears as one chip. Replace or remove it in the draft without writing a source record. The same binding is available in Builder.
- Use the grey grip to move the enclosing layout tile. Use the grip on a selected blue chip inside the composer to move that binding occurrence. Open field actions beside the blue grip and element options beside the grey grip. Confirm pending record edits stay open and require a save or discard before switching to layout editing.
- At the beginning or end of an unchanged record value, press the outward arrow to enter layout editing on that side of the binding chip. Preserve pending record edits and direct the editor to save or discard them first.
- With the frontend pencil active, click the **Browse programs** text and type `@` at the insertion point. Choose **List counts → Programs at this institution**. The shared picker inserts `{{ lists.programs.count }}`, and the live total follows the list filters. Static text has a neutral editing outline. The label keeps its link to the list and exposes an ordinary accessible name to visitors. Literal text uses the existing translation workflow.
- Highlight words in the layout editor to open bold and italic controls. Check repeated bindings, precise drop, keyboard and tap moves, undo, the saved Builder draft and original translation identities in both languages. Keep binding saves separate from publication.

See the [release audit](../history/PUBLIC-RELEASE-AUDIT.md#inline-layout-bindings-and-record-menu) for the current rollout receipt.

Study-in-USA has the shared picker at 100% traffic. Both editors offer the same list count references. The Dominican button was verified in the signed-in frontend editor in English and Arabic, and the test edits were discarded. The active publication hash is unchanged.

## Detail Saved View fields

Open the Saved View linked to the institution or program detail layout in Data Studio. Expand **Binding fields**, select columns from the source table, then select **Save View**. Both @ pickers show the columns for the current element's record under **Record**. The variable `{{ record.columns.<name> }}` displays the live scalar value. Lists still have their own totals and filters. Columns visible in the inspector are configured independently.

An unconfigured view opens with all eligible columns checked if the table fits the view's 64-field limit. **Select all** and **Deselect all** adjust the draft selection. Keep **Binding fields** open when confirming **Save View** to accept the suggested default. Explicit selections, including an empty selection, persist. Opening the inspector or saving unrelated changes with the section closed leaves the unconfigured selection alone.

For a linked view, **Record** offers exactly the saved selection. Existing references keep their meaning, including on a linked view with an empty selection. Publish a reviewed layout draft to display a new binding on the public site. Clearing a selected field stops retrieving its value for new raw-column references, including references in the current publication.

If a layout using a new column binding has been published, restore the earlier compatible publication before rolling back to a Worker version that predates the feature.
