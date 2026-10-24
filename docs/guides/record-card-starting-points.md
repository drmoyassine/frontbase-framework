# Editable record card starting points

Select a Repeater or a data-bound Card, then open **General → Item template → Card starting points**.

Choose **Image card**, **Cover with logo**, **Compact card** or **Text card**. Map the title and any optional cover, fallback cover, logo, subtitle, city/location, country, flag and details link from the inspected field list. Choose either an image flag or an emoji/text flag. Add metadata fields for type, founding year, degree, tuition, intake or other fields appropriate to the source. Related fields become available through the existing **Available fields and relationships** browser.

Image properties expose **Fallback image**, **Try fallback if image fails to load**, and **Hide image when neither is available**. A starter with a fallback cover enables these options; they remain editable on the ordinary Image element. The fallback can be a related field or a configured URL.

The current item is always `record`. New ordinary references use `{{ record.title }}` and related references such as `{{ record.institutions.institution_image }}`. Existing `record["title"]` and `record["institutions.institution_image"]` references remain supported. For a single dynamic value, **Add fallback field** appends an alternative, for example `{{ record.programs.program_image || record.institutions.institution_image }}`. Missing/null/empty/whitespace values fall through; zero and false do not. There are at most eight alternatives. This bounded value syntax does not execute JavaScript and should not be combined with Liquid filters or tags in the same expression. Existing Liquid formatting filters remain available on ordinary references.

Tick the replacement checkbox and apply. This replaces only the selected version's item structure; one Undo restores the previous design. Alternative versions retain their own structures. An inherited alternative must enable its structure override first. The source binding, filters, pagination and other list controls remain unchanged.

The result is an ordinary Card tree containing Rows, Columns, Images, Heading/Link and Text elements. Use the canvas, Layers, Styling or @ picker to add, move, remove and remap anything. A mapped details URL makes the title a normal link. No rating, favorite, comparison action or hidden custom card renderer is installed.

The layout follows page direction and uses start alignment. It displays one title from the active record/language, not both original and translated titles. Translation is handled by the existing localization system; applying a design does not generate missing record translations. Optional empty values use the shared visibility conditions. Related fields retain the same reviewed public-field admission rules as manually authored @ fields; picking them does not grant anonymous access.

Changing an existing published design follows the normal Save/Publish and locale review/prepare/publish lifecycle. Verify both language routes after a structural change. Never bypass stale-source or public-field review checks.

For a template already included in a reviewed site, save the draft and open **Page Settings → Directory → Prepare this saved template update**. This keeps the existing route inventory, live bindings and other page designs, then requires private preview/review and explicit publication. Use full catalog preparation only when intentionally selecting content again. A foreign-origin or browser-rewritten source URL is refused; correct the source/selection instead of weakening URL validation.
