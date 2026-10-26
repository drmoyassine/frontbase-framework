# Visual data binding

Choose a datasource and schema in a data component's General properties. Open **Bind**, then hover over **Table** or **Saved View** and select an item. The menu also works with keyboard arrows. Saved View is disabled when none exist. A saved view supplies its table, schema and server-side filters; its physical source appears in the read-only Source details disclosure, rather than a second editable selector. Edit view opens the shared Data Studio view editor.

Repeaters, Tables, Grids, record-bound Cards, KPI Cards, Charts and InfoLists share this source selector. Write Forms keep an explicit writable table target; selecting a saved read view is not a write operation.

## Design a repeated item

A new Repeater starts with a normal Card containing a Heading. Select its children on the canvas, in Layers or in the **Item template** tree. Add, remove, nest, reorder and style ordinary text, images, icons, badges, links and other elements using the existing builder tools. The item tree repeats for every record; it is not a fixed set of card configuration fields. Selecting a later repeated instance edits the same authored template. Dynamic record expressions are edited through Properties rather than replaced by double-clicking their rendered values.

Use **@** in a child's property to select a record field, or use the collapsed **Field mapping shortcuts** on the parent. Available fields are the entire inspected source schema, independent of the fields already displayed. Use **Available fields and relationships** to search the catalog and browse additional relationship levels. A path such as `{{ record.cities.name }}` reads the related city; `{{ record["cities.name"] }}` is also accepted. Exact paths depend on the real source schema. Multiple foreign keys to the same table receive disambiguated aliases. One-to-many relationships return lists, which can be formatted using existing expressions.

Tables and Grids keep their structured column layouts: selecting a field from the same catalog adds a column. InfoLists add a displayed field. A static Card can opt into **Bind to a record**, retaining its existing content as ordinary child elements; the bound Card displays one record. Repeater/record Card fields belong to the nearest enclosing record scope. Nested bound components do not silently broaden their parent's field selection.

Block Versions retain direct Default inheritance. Enable the existing structure override before changing an alternative's item tree; enable binding override before changing its source. Configure a static Card's first record binding in Default, then override it in alternatives.

Text content, multiline text and image sources use the shared @ input. Mapping shortcuts update the same content property that the element renders, including older elements that use the legacy text property. Raw code and rich-text editors retain their dedicated editing behavior.

## Access and adapter limits

Saved-view filters remain server enforced. Metadata discovery requires an authenticated datasource administrator. Related reads use existing HTTP/SQL datasource adapters, discovered foreign keys and explicitly selected fields, without accepting arbitrary joins or SQL from a visitor. Related keys needed internally are not returned as extra visible fields. For existing reviewed generated catalog projections, read-only lineage to the canonical table comes from that owner's active publication; this does not alter its SQL view or grants. A published protected datasource admits only the related paths declared by its reviewed authored design. Adding another field requires the normal review/publication flow.

Traversal is bounded to three relationship hops, 100 selected paths, 100 distinct join keys per branch and 500 related records per query. Overflow, ambiguous relationships and unsupported composite foreign keys fail or are omitted visibly rather than silently matching partial keys. Source relationship/API permissions still apply. Source catalogs are metadata, not permission grants.

Saved-view Chart aggregation uses the existing SQL-capable adapter over its supported transport, with typed validated category/value/aggregation and saved filters. Bare native PostgREST without aggregate support explicitly refuses this operation; it does not approximate an aggregate from the first page. Relationship aggregation and editable writes through arbitrary views are not supported by this change.


## Gallery and detail headers

Gallery is a normal editable element. Choose media through the existing asset picker/upload, enter URLs, or bind the media source with **@**. One item displays as a cover; multiple items use tiles. The media source accepts an array of URLs, JSON objects with `src`, `type`, `alt` and optional `poster`, or one URL per line. Cover source and fallback source are used when that list is empty. An additional video source can accompany the cover. Supported videos are native MP4/WebM and recognized YouTube/Vimeo URLs; arbitrary embed HTML is not accepted. Controls include featured/grid layout, height, spacing, corners and fit.

Institution detail navigation is a desktop sidebar that adapts on smaller screens; program navigation stays horizontal. Header facts and consultation/Apply links remain independently editable, with destinations configured under **Properties > Actions**. Optional ranking mappings display actual source values only.

Existing detail starters can opt into **Page Settings > Directory > Upgrade detail gallery, header and navigation**. This changes the unsaved design; save, prepare, review and publish it through the existing template lifecycle. Existing bindings and retained child identities are preserved. Media and newly added text labels must be reviewed for each active language.


## Shared configuration locations

The former Template settings tab is retired. Use **Data Studio > Connections > Advanced publication setup** for shared collection field/relationship mappings and publication scope. Use **Builder > Page settings > Directory > Shared routes** for shared index paths. Configure header contact buttons under **Menus > Header > Actions**. Homepage appearance is in that homepage's Directory panel; its content and list settings remain on editable elements. General has one **Site settings** form for the site name, canonical URL, default language, logo and favicon. Branding changes are staged until Save changes. There is no separate internal project name or Destination field.

Saving shared configuration preserves the same revision-checked document and does not publish it. Prepare/review/publish from the builder as before. The saved-homepage preparation control refuses unsaved builder edits. Legacy layout maintenance is in the builder, and legacy live-list maintenance is under Connections > Advanced publication setup; opening these controls does not apply a migration. Old `settings?tab=template` links redirect to Datasources.

Saved Views owns view inspection, editing and deletion. Connection cards link to views filtered by connection; clear the filter to see all views. Remove page bindings before deleting a used view.
