# Saved Views for detail layouts

Booking for X now installs one Explore Repeater with Institutions as Default and Programs as an alternative. Configure each through the Builder's Bind picker. Publication review identifies missing bindings by element and version.

Detail layouts select their Saved View in Builder → Detail source and URLs, or Pages → URLs. Its datasource, schema and table must match the configured collection. The existing route field, primary key, editorial approval, relationship checks and publication scope remain enforced. The advanced panel was removed from Datasources. Directory source fields are available in the Builder for configuring existing role mappings. A view used by a published detail layout cannot be deleted or switched to another source.

A Repeater that uses the same view with the same datasource, table and canonical ID retains the directory record's translation identity. Saved View selection rules are current during public reads. They are loaded in one tenant-scoped settings query and combined with the directory's mandatory scope.

Local workspace checks, build, backend live layout and Saved View query suites, installer tests and eight Builder/installer UI tests passed. The live fixture verifies both Explore versions, existing detail paths in EN/AR, translation record identity, rejection for a foreign view, and absence of routes outside the view scope.

## Study-in-USA production

Created the USA Institutions, USA Programs and Study in USA Articles Saved Views on the existing source relations. Published the reviewed Explore layout and detail bindings as generation 2. The institution and program lists retain the existing 18 and 293 records, and the editorial source retains 957 published articles. Existing source relation predicates and URL fields were preserved.

The exact source e1231f28 passed 24 authenticated Cloudflare preview comparisons and was promoted as Worker version 8ecfce78-4f7b-4219-9348-1024daaed9cb. The public 24-case EN/AR suite passed after deployment, covering both Explore tabs, search, pagination, details, articles, canonical paths and 180 matched record links. Responses were live and no-store. The sampled Agricultural Education detail lacked a visible university label on both the prior Worker and the new release. The sampled Arabic Explore headings retained exactly their existing record text.

The prior layout pointer and Worker version face02ce-b3f4-4057-a35f-aaaa943420c5 remain rollback references. A first publication request returned HTTP 422. Recovery verified the saved authoring revision and exact draft before retrying only publication, which returned 200 at generation 2.

GitHub PR #12 carries this change and the existing live-serving prerequisites. Its initial CI run rejected direct legacy mapping reads in the live reader. The follow-up routes both reads through the existing source-contract adapter.

## 2026-11-17 raw-table cutover

Study-in-USA generation 3 binds USA Institutions and USA Programs to the raw public tables with editable Saved View rules. The view filters preserve the USA scope, original URL requirement, and historical ID exclusions. Directory relationships remain enforced. The existing database views are retained as the rollback source. No source rows, database schema, or grants were changed.

The platform projects the mapped public fields for lists that share a detail Saved View. This retains original routes, directory translation identities, summary limits and configurable logo replacements while preventing direct anonymous reads of the raw columns. The Saved View inspector reports the active publication, Block Versions, detail sources and article references. The main list omits page-by-page usage.

Worker d4c32a8e-510a-44bc-bca0-b48154324fe0 serves the generation 3 release. Private and public EN/AR route checks passed 24/24 each. The private comparison matched titles and media URLs and preserved all 622 institution and program sitemap URLs. The public check matched 180 record links. A concurrent sitemap sweep saw a transient 503 on one public shard, which returned 200 on two sequential checks.

Before the change, the Supabase Management API rejected the saved authorization with 401 and public reads returned 503 because the project key had to be fetched again. Reconnecting restored access. Frontbase now retains the selected project's discovered database key in the encrypted Connected Account, independently of the management token's lifetime. Local tests cover tenant and project isolation and continued reads after management authorization becomes unavailable.

## Supabase management renewal

Connected Accounts discovery, connection testing, resource management and project-key discovery renew an expired Supabase OAuth grant on demand. Installed hosts with local OAuth client credentials use Supabase directly. Hosts connected through the Frontbase relay use the same enrolled receiver proof. The relay exchanges the refresh token server-side. The app writes the rotated grant back to the same encrypted account while retaining its project read credentials. A durable account claim serializes refresh across Workers.

Fixture verification exercises the actual installed API and relay with an expired grant, concurrent requests, rotated storage and a fresh app instance. The fixture replaces Supabase HTTP transport. Live production relay rollout and a real-provider post-expiry observation are separate from that verification.

## Shared Data Inspector correction

Saved View editing now uses the same Data Inspector modal, header, table sidebar, column controls and record display as datasource browsing and new-view creation. Nested selection rules remain available in the filter control. View settings and record translation review are collapsible. Loaded saved views use their owned preview endpoint and bypass temporary browsing sessions, preserving their filters and default ordering. Saves retain the loaded revision for conflict detection and preserve pinned columns, field mappings, linked views and webhooks.

The Data Studio suite passes 46 tests, including shared new-view creation, saved-view opening, nested filter editing, preserved metadata and stale-write refusal. Workspace check and build pass. Production rollout and browser verification of this UI remain pending.
