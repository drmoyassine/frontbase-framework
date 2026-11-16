# Saved Views for detail layouts

Booking for X now installs one Explore Repeater with Institutions as Default and Programs as an alternative. Configure each through the Builder's Bind picker. Publication review identifies missing bindings by element and version.

Detail layouts select their Saved View in Builder → Detail source and URLs, or Pages → URLs. Its datasource, schema and table must match the configured collection. The existing route field, primary key, editorial approval, relationship checks and publication scope remain enforced. The advanced panel was removed from Datasources. Directory source fields are available in the Builder for configuring existing role mappings. A view used by a published detail layout cannot be deleted or switched to another source.

A Repeater that uses the same view with the same datasource, table and canonical ID retains the directory record's translation identity. Saved View selection rules are current during public reads. They are loaded in one tenant-scoped settings query and combined with the directory's mandatory scope.

Local workspace checks, build, backend live layout and Saved View query suites, installer tests and eight Builder/installer UI tests passed. The live fixture verifies both Explore versions, existing detail paths in EN/AR, translation record identity, rejection for a foreign view, and absence of routes outside the view scope.

The authenticated production inventory found no existing views for the current institution, program or article sources. Production migration still requires creating compatible views, preparing a versioned Explore layout, and comparing authenticated bilingual previews and the current routes before promotion. Existing publication and translation state were not edited during inventory.
