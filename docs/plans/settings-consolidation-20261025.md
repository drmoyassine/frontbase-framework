# Template settings consolidation

Scope: relocate existing authoring controls without a configuration/data migration. The Template tab is removed; old links redirect to Datasources with shared mappings expanded. Data Studio owns collection mappings and scope; Page settings / Directory owns shared routes/contacts and appearance, publication and legacy layout maintenance. Legacy live-list maintenance stays under Datasources. Existing API revision/hash guards, adapter paths and publications are preserved.

Local verification: 10 focused tests pass (section ownership, hidden data preservation, optimistic concurrency, guarded homepage save, preparation-only mode). Final workspace `pnpm -r check` and `pnpm -r build` pass. Generated cms.mjs is unrelated and remains unstaged. No public-release gate is claimed closed.


## Final acceptance (2026-10-26 local)

Runtime `035be80` (following implementation `03c2d91`) is committed, pushed and deployed to the existing staging app through newpanel. Exact source archive SHA256: `f80ab84a32185d63cdab7b590a620d66d141cc477eaf988dd2a2574b9c4632fa`. Live admin asset: `index-C3vDhLYv-72721885815274.js`.

Live verification found an admin-router basename duplication in the first redirect. The correction has two additional passing router tests, including a real `/frontbase-admin` basename. The final legacy URL resolves once to `/frontbase-admin/data-studio/datasources?setup=collections`; the normal settings tab list excludes Template. Total focused tests:12 across four files; final workspace check/build exit0. No auth, database schema, adapters, publication semantics or runtime translation logic changed; no new security-boundary mutation suite was required.

Both relocated forms retain configuration revision4, original collection mappings and `/explore/` and `/blog/` index paths. Builder Page settings / Directory exposes shared routes/contact values and existing preparation controls; the homepage exposes appearance and saved-homepage preparation without a duplicate editor. Page listing still shows published site generation32. Verification made no configuration, page, source-record or translation writes and activated no site/language publication.

Native browser English and Arabic homepage/directory navigation and program detail rendering pass. Arabic retains RTL and localized navigation/labels; both language program details load the cover, tuition27021 and duration4. Existing source-language fallbacks remain as before; dataset translation completeness is not part of this change. Native curl with normal Windows TLS validation returns200 for `/`, `/ar/`, both program Explore URLs, both ELS institution URLs and both Entertainment Engineering program URLs. Earlier Python-based checks hit local DNS/TLS failures; those are not successful HTTP evidence and were superseded by the direct native curl/browser checks. No TLS validation was disabled.

Generated `examples/cf-full/api/cms.mjs` remains intentionally unstaged. All six broader public-release gates remain separate. Next release task remains candidate integration and qualification, not another settings migration.


## General and Data simplification follow-up (2026-10-26)

Owner correction: one site name, one General form, header contact buttons in Menus/Actions, no Destination authoring, and no duplicated datasource/view management. General now stages identity and branding through existing APIs, detects stale configuration and reports partial saves honestly. The old independent forms and their internal-name control are removed. Connections retains test/edit/inspect/relationships; Saved Views owns inspection/editing/deletion, with connection filtering and used-view deletion disabled. Shared mappings and optional legacy maintenance are grouped in Advanced publication setup. Missing host/database fields are omitted for HTTP connections.

Destination is optional legacy decoding only and no longer a readiness requirement. The field/help and obsolete shared-header generator are removed. New hero defaults do not require it. Existing configuration/contact bindings and published text remain readable; no saved data is purged or publication activated. Shared builder controls expose index routes, while new header actions belong to Menus.

Local acceptance: 33 focused console tests pass; workspace check/build pass. Backend directory-configuration/site-configuration conformance, all 3 site-configuration mutation cases, and edge directory-bindings/template-landing pass. The mutation runner initially selected the global pnpm shim; setting its supported npm_execpath to the installed pinned CLI fixed the local tooling failure. No test or security guard was weakened. Staging receipt follows after deployment.

Full-console diagnostic inspection remains nonzero due to existing type debt; changed runtime files have no diagnostics. One test still imported the retired header generator and was corrected to exercise a serialized legacy fixture; its four tests pass. The targeted workspace check is not represented as a full-console type-clean claim.


### Follow-up staging acceptance

Runtime `e7c0ae3` pushed and deployed through newpanel from archive SHA256 `62738e4be843c2ca86c9bc72a5d214ef793072610a8ec4ce2010e4b22b3317ff`. Live admin asset `index-Dy-p7Wkn-7746954514549.js` confirms the new runtime. Upload completed once; no duplicate deployment was launched.

Native checks: one Site name and one Save; a temporary unsaved name is discarded on Reload; existing `Study in USA` saved into project metadata to replace `Default Project`, with no public name/URL/language change. Reload persists it with Save disabled and no dirty indicator. Searchable default-language selector filters Arabic options; language was not changed. Configuration remains revision4. Connections shows only relevant schema information, one Saved views count link, and collapsed Advanced publication setup. View filter/open/close/clear works, existing inspector is retained, and all three page-bound views have disabled deletion. Old Template URL redirects once to the expanded setup.

Native English/Arabic homepage rendering and Arabic RTL/localized navigation pass. Eight HTTPS routes return200: both homepages, both program Explore pages, ELS institution in both languages and Entertainment Engineering program in both languages. No source-record/translation edits, view deletions or publication activations were made. Existing contact links and Destination-derived published hero text are preserved. Screenshots: `site-settings-unified.png`, `data-connections-simplified.png`, `settings-public-en.png`, `settings-public-ar.png` in the task evidence directory. General is left open for owner review. Only the pre-existing/generated `examples/cf-full/api/cms.mjs` diff remains intentionally uncommitted.
