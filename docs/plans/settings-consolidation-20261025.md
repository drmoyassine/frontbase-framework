# Template settings consolidation

Scope: relocate existing authoring controls without a configuration/data migration. The Template tab is removed; old links redirect to Datasources with shared mappings expanded. Data Studio owns collection mappings and scope; Page settings / Directory owns shared routes/contacts and appearance, publication and legacy layout maintenance. Legacy live-list maintenance stays under Datasources. Existing API revision/hash guards, adapter paths and publications are preserved.

Local verification: 10 focused tests pass (section ownership, hidden data preservation, optimistic concurrency, guarded homepage save, preparation-only mode). Workspace check/build and live acceptance pending. Generated cms.mjs is unrelated and remains unstaged. No public-release gate is claimed closed.
