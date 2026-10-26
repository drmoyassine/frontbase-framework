# Template settings consolidation

Scope: relocate existing authoring controls without a configuration/data migration. The Template tab is removed; old links redirect to Datasources with shared mappings expanded. Data Studio owns collection mappings and scope; Page settings / Directory owns shared routes/contacts and appearance, publication and legacy layout maintenance. Legacy live-list maintenance stays under Datasources. Existing API revision/hash guards, adapter paths and publications are preserved.

Local verification: 10 focused tests pass (section ownership, hidden data preservation, optimistic concurrency, guarded homepage save, preparation-only mode). Final workspace `pnpm -r check` and `pnpm -r build` pass. Generated cms.mjs is unrelated and remains unstaged. No public-release gate is claimed closed.


## Final acceptance (2026-10-26 local)

Runtime `035be80` (following implementation `03c2d91`) is committed, pushed and deployed to the existing staging app through newpanel. Exact source archive SHA256: `f80ab84a32185d63cdab7b590a620d66d141cc477eaf988dd2a2574b9c4632fa`. Live admin asset: `index-C3vDhLYv-72721885815274.js`.

Live verification found an admin-router basename duplication in the first redirect. The correction has two additional passing router tests, including a real `/frontbase-admin` basename. The final legacy URL resolves once to `/frontbase-admin/data-studio/datasources?setup=collections`; the normal settings tab list excludes Template. Total focused tests:12 across four files; final workspace check/build exit0. No auth, database schema, adapters, publication semantics or runtime translation logic changed; no new security-boundary mutation suite was required.

Both relocated forms retain configuration revision4, original collection mappings and `/explore/` and `/blog/` index paths. Builder Page settings / Directory exposes shared routes/contact values and existing preparation controls; the homepage exposes appearance and saved-homepage preparation without a duplicate editor. Page listing still shows published site generation32. Verification made no configuration, page, source-record or translation writes and activated no site/language publication.

Native browser English and Arabic homepage/directory navigation and program detail rendering pass. Arabic retains RTL and localized navigation/labels; both language program details load the cover, tuition27021 and duration4. Existing source-language fallbacks remain as before; dataset translation completeness is not part of this change. Native curl with normal Windows TLS validation returns200 for `/`, `/ar/`, both program Explore URLs, both ELS institution URLs and both Entertainment Engineering program URLs. Earlier Python-based checks hit local DNS/TLS failures; those are not successful HTTP evidence and were superseded by the direct native curl/browser checks. No TLS validation was disabled.

Generated `examples/cf-full/api/cms.mjs` remains intentionally unstaged. All six broader public-release gates remain separate. Next release task remains candidate integration and qualification, not another settings migration.
