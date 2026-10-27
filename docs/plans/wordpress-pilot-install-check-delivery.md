# B destination checks before installation

**2026-10-08. Locally implemented and verified; uncommitted.** Additive backend foundation under the [installation contract](wordpress-pilot-installer-recovery-contract.md). No new package, renderer, admin application, public importer or deployment. Existing pending draft-change and R0 work is preserved. Synthetic tests touch invented in-memory SQLite only; no real Studygram/Garage/pilot state is accessed.

## Delivered boundary

`POST /api/project/template-preflight/` uses the existing app's default-deny authentication and explicit owner/admin roles. Strict JSON, a streamed64KiB bound and no query-string parameters. The body contains schemaVersion1, expectedRevision0, proposed shared configuration parsed by the existing core schema, and one to seven strict role/slug references. It does not accept credentials, client owner facts, raw SQL, artifact/layout content or expected installation receipts.

This is **new-install destination checking**, not complete artifact preflight. Existing settings require a separate upgrade plan; corrupt settings fail closed. Require ready directory mappings, institution→city and program→institution fields, a directory page matching the configured route, and an article collection when article pages are requested. Candidate roles and canonical path identities must be unique. Conservative ASCII path validation rejects encoded paths, traversal, query strings, repeated slash and reserved prefixes. Existing legacy paths that cannot be safely normalized refuse the whole check. Case/trailing-slash aliases and soft-deleted pages collide. This narrower template-shell path grammar does not redefine imported WordPress public URLs.

Owner-only namespace inspection is bounded to1001 rows and refuses more than1000, rather than silently checking a partial namespace. It checks candidate template-shell pages only. Dynamic record URL collisions, full layout/component/query grammar, storage/public-object access and publication-runtime capability remain future preflight requirements. No homepage/root route is created by this contract.

Resolve only an existing owner-scoped datasource through the established SyncStore, account merge, credential resolver and datasourceRunner seams. Supported kind classification is checked before resolution. For each configured collection, run a parameter-free, aliased, quoted SELECT of every configured field and scope column with `WHERE 1 = 0`. Aliases matter: SQLite can interpret an unqualified unknown double-quoted name as a string literal. No rows are returned, no data/provider configuration is included in the response, and no raw driver error is returned. These probes establish that mapped columns can be selected at that instant, not field types, FK integrity, data completeness, query-plan performance, record eligibility or successful public rendering. Provider connection initialization remains the existing adapter's behavior; the new handler calls query only, never exec/migration/provisioning.

After probing, reread site settings, the ordered owner namespace and owner datasource kind/config bytes. A concurrent page creation, configuration creation or connection change refuses. This is observational read-back, not a transaction or reservation; changes after the response and complete byte-restoring ABA edits are not prevented. A future executor must reserve and conditionally revalidate all relevant state. Passing checks never grants install authorization or operation ownership.

The response is only a coarse `destination-check` result with checked collection names. `installAvailable`, `publicationAvailable` and `reservationCreated` remain false. It is no-store/noindex. The administrator review UI and full artifact checks are not implemented by this increment.

## Verification

Focused suite: real in-memory SQLite mapped-column checks (including an empty-table missing optional cover column), route/path/configuration collisions, foreign owner datasource refusal before resolver use, strict/bounded inputs, control/provider write prohibition, missing table/opaque failure, three mid-probe control-state races, corruption, namespace bounds and real-app auth registration. Fault harness mutates the role, trusted owner, wire bound, reserved routes, deleted collision, namespace bound, mapped column selection and post-probe recheck; it rebuilds and requires an independently green baseline after each restoration. Final fault results:8/8 detected, rebuilt focused baseline passes after every restoration and final source SHA256 matches. No fresh hosted/provider proof is implied.


Final integrated commands and results (Windows, Node26.7.0, pnpm10.15.1):

| Gate | Result |
|---|---|
| Backend `test/template-preflight.mjs` | Pass; synthetic real SQLite and real-app default-deny/role registration |
| Backend `test/template-preflight-mutation.mjs` | 8/8 faults detected with independent rebuilt GREEN baselines/source hash |
| `pnpm -r build`, then `pnpm -r check` | Pass; existing chunk-size and static/dynamic-import warnings retained |
| Backend `test/page-changes.mjs` | 15 groups pass, including three-process persistence |
| Backend directory-preview and site-configuration tests | Pass; real SQLite query/ownership/revision checks |
| Backend compatibility security/database-security tests | Pass |
| Backend tenant matrix | 175/175 existing identifier-bearing operations isolated; new route's two-owner checks are in its focused suite, not added to that denominator |
| Example `dist/smoke-host.mjs` | All pass; generated-host parity, runtime exclusions, assets/default-deny and boot no-leak |
| Backend `test/compat-conformance.mjs --gate` | Exit1 remains:248 conforming, zero violating, nine unreachable,77 verified refusals;334 operations,577 differential cases/76 differing. Not an all-green conformance gate |

Build regenerates `examples/cf-full/api/cms.mjs`; reported min+gzip sizes CF515.2KB, Vercel515.7KB, Deno516.6KB. No prohibited client symbols found. No actual pilot restart/migration, canonical data, provider access, storage, content approval/publication or deployment. All source/tests/docs/generated-host changes remain uncommitted; preserved Python bytecode remains outside the candidate source set.

Applied the Supabase skill's server-secret/authorization boundary check; no Supabase SDK, Auth, RLS, grant, function, view or storage configuration changed. [Current API-security guide](https://supabase.com/docs/guides/api/securing-your-api) and [changelog](https://supabase.com/changelog) reviewed. Markdown changelog fetch failed on unsupported content type; HTML fallback succeeded. This does not establish live Supabase column-probe acceptance; selected adapters/permissions still need target-specific verification. No privileges were expanded to make probes succeed.

Next: full typed artifact/layout checks, required query/storage/runtime capability proofs and installation-wide reservation; then durable page creation/configuration, explicit stalled-operation reconciliation and conditional restore, followed by existing-admin install/recovery controls. The [draft-change primitive](wordpress-pilot-draft-change-delivery.md) handles one existing draft only; it does not supply those missing steps. R0 evidence/backlog definition is complete, edition acceptance/release gates open; CF-22 paused.
