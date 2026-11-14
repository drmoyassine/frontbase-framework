# Off-Worker publication and pre-rendered delivery

Status: experimental opt-in, under Study-in-USA release qualification. This is not a claim that the whole CMS meets Workers Free CPU limits.

## Operator

Build the workspace with the supported Node 22 runtime. The example build writes `examples/cf-full/operator-dist/publication-operator.mjs`, outside deployable Worker modules.

Run from a private operator environment with the normal HTTPS PostgREST state adapter configuration, the installation's session secret, `FRONTBASE_PUBLIC_ORIGIN`, `FRONTBASE_OPERATOR_EMAIL` and `FRONTBASE_OPERATOR_PASSWORD`. Supply credentials through the process environment or a private secret manager; never commit them or place them in command arguments. The operator disables administrator seeding and setup-token routes. Existing administrator authorization still applies.

```
node examples/cf-full/operator-dist/publication-operator.mjs prepare request.json private-capture.json
node examples/cf-full/operator-dist/publication-operator.mjs read capture-reference.json private-review.json
node examples/cf-full/operator-dist/publication-operator.mjs preview preview-request.json private-preview.json
node examples/cf-full/operator-dist/publication-operator.mjs review review-request.json private-receipt.json
node examples/cf-full/operator-dist/publication-operator.mjs export export-request.json private-export
```

Preparation/read/preview/review request bodies are the existing site-publication API contracts. Review is the existing content/media/layout/URLs/CTA approval, not a substitute for checking those items. Output destinations must be new files/directories. Captures and output HTML may contain private editorial data.

Export input is `{ "hash": "<reviewed capture SHA-256>", "paths": ["/", "/explore/?type=program"] }`. Include every intended locale, route and query variant explicitly. Unsupported paths, non-200 responses, state changes during rendering and incomplete review refuse the export. No source publication or locale publication pointer is changed by export. Four renders overlap independent reads with request-local dependency recording. Transient reads receive at most three attempts; writes never receive this retry. Conflicting snapshots abort, and any failed export lacks its completion receipt.

## Delivery contract

The completed export contains `__frontbase_prerender/<capture hash>/` with per-request descriptors, content-addressed HTML and `complete.json`. Copy this complete tree into the example's configured private asset build directory and set `FRONTBASE_PRERENDER_RELEASE` to its hash. Keep `run_worker_first = true`; bypassing the Worker would bypass publication checks and expose internal assets. Never host the export directory through a public static server.

The Worker serves HTML only when the real active source pointer matches and exact captured database reads still match. It validates all reads in one HTTPS state query, with SHA-256 computation in Postgres. A changed menu, copy edit, locale dependency or review invalidates the affected artifact. New output must be exported after those changes. Completion is cached per immutable asset binding; freshness is checked on every request. Trusted deployment assets are part of the trust boundary, and the HTML hash names its immutable asset.

Responses retain their captured security and language headers, declare `no-store`, and expose `x-frontbase-render: pre-rendered`. The export's temporary pointer generation is not sent as a live generation. Private asset paths return 404. Personalized requests, list continuation and absent query variants use normal runtime handlers and must be independently qualified.

## Current acceptance limits

- Only self-hosted PostgREST state is implemented; managed-cloud tenants and other state adapters are not qualified.
- Six production-sized English route classes measured 2–3 ms Worker CPU. Full bilingual, interactive and responsive acceptance is still open.
- This is no proof of Postgres throughput: dependency signatures impose database work on every public request.
- Export cannot be published by itself. Retain the existing guarded publication and locale compare-and-swap flow after private acceptance; do not directly write pointers.

## Gates

After workspace check/build, run the example tests with Node 22:

```
node examples/cf-full/test/prerender-delivery.mjs
node examples/cf-full/test/prerender-postgres.mjs
node examples/cf-full/test/prerender-mutation.mjs
```

The Postgres test uses a disposable local Docker container with no published port. The mutation suite verifies that removal of freshness, origin, site identity, private asset, query, cookie or completion checks fails conformance.
