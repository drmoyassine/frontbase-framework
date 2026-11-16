# Live layout publication on Workers Free

Status: implementation under verification. Live-data Free CPU acceptance remains open; the older pre-render measurements do not qualify this path. See [current evidence and remaining work](../plans/live-data-serving-20261115.md).

## Serving contract

Publish layout, component configuration, Actions and bindings once. Each request reads current source records, eligibility, routes, counts and translation heads through the existing adapters. Source edits do not require a new layout publication. A changed source value invalidates an outdated translation until the translation is updated.

The public Worker does not serve captured record catalogs or exported record HTML. `FRONTBASE_PRERENDER_RELEASE` no longer selects a delivery path. Historical receipts remain available for inspection; do not use the retired export commands to deploy new content.

## Prepare and verify off the Worker

Build with Node 22. The example emits `examples/cf-full/operator-dist/publication-operator.mjs` outside the deployable Worker modules.

Use a private operator environment with the normal state adapter configuration, the installation's **actual** `SESSION_SECRET`, `FRONTBASE_PUBLIC_ORIGIN`, `FRONTBASE_OPERATOR_EMAIL` and `FRONTBASE_OPERATOR_PASSWORD`. A different session secret cannot decrypt existing connected accounts. Never put credentials in Git, command arguments or receipts. The command disables administrator seeding and uses ordinary authenticated administrator routes.

```sh
node examples/cf-full/operator-dist/publication-operator.mjs prepare request.json private-prepare.json
node examples/cf-full/operator-dist/publication-operator.mjs preview preview.json private-results.json
node examples/cf-full/operator-dist/publication-operator.mjs publish publication.json private-publication.json
```

Prepare input contains `pageIds`, `locales` and `expectedConfigurationRevision`. It validates element bindings and stores layout-only structure without publishing.

Preview input contains the prepared `hash`, explicit `paths`, and optionally `expectedLanguages` keyed by path. It reads current data with bounded concurrency and produces a status receipt, not an HTML export. Failed routes stop verification. The authenticated `/api/project/live-layout/render/` endpoint supports private verification on the intended host when the operator cannot access its encryption key.

Publish input contains `hash` and `expected`: null for the first live layout or the exact current `{hash,generation}` pointer for replacement. Publication uses compare-and-set and never silently overwrites concurrent work.

`editorial-publish` accepts `id`, `expectedConfigurationRevision`, `expectedDocumentRevision` and optional `contentRole`. It changes only a previously approved, unchanged draft to published status. It refuses missing approvals, altered content and revision conflicts. This is an editorial status transition, not a record snapshot release.

## Acceptance

Run workspace check/build and the backend `test:live-layout` suite, plus the affected frontend-edit, source-write, editorial, translation and security mutation gates. Verify actual source and translated-record edits with an unchanged layout hash. Exercise current search, pagination, relationship reads, deleted records, upstream failure, tenant boundaries and English/Arabic output.

Measure public cold and warm CPU on a disposable production-sized Worker. Successful HTTP responses alone do not establish compliance with the Free CPU budget. Do not promote a candidate while this gate remains unresolved.

For Cloudflare version testing, use `wrangler versions upload`, never `deploy`. Preserve the active version's settings explicitly: the settings endpoint may describe the newest uploaded version rather than the active one. Keep the OAuth receiver origin consistent with its registered target. Version URLs do not support `wrangler tail`; use an isolated Worker for CPU/log evidence. Never publish a diagnostic build.
