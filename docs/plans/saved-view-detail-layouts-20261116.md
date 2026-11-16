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
