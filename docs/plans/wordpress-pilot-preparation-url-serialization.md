# Preparation URL serialization refusal

2026-10-10. Bounded capture-preparation correctness gate following [route-policy evidence](wordpress-pilot-route-policy-reconciliation.md). No public URL normalizer, migration or old-artifact rewrite.

## Reproduction and implementation

The expanded existing publication acceptance fails against the original built preparation: a synthetic institution with raw `/café/` is captured instead of refusing. Earlier diagnostic demonstrates a browser Request uses `/caf%C3%A9/`, which exact matching cannot find in that raw capture. The new preparation guard checks the schema-validated candidate's actually served paths against `new URL(path, fixed synthetic origin).pathname` before candidate persistence. If any spelling differs, it throws constant `publication_route_serialization`; no path is returned encoded, renamed or repaired.

Coverage includes directory; blog index when articles exist; captured institutions/programs; and exact server-approved article snapshots. The guard runs after existing source/approval/schema validation, before the final configuration recheck and capture write. It is not an early provider-query refusal: existing reads may already have run. The fixed origin is parsed locally only and never fetched. Existing artifact schema, immutable-store read compatibility and exact runtime resolver remain unchanged. Internal direct store construction and previously prepared captures are not retroactively admitted or repaired by this guard.

The authenticated preparation endpoint maps only the constant error to HTTP 422 with a bounded original-encoding review message and code. No raw provider exception, source path, title, content, configuration or approval is reflected in the error. Administrator-selected originals must be reviewed against source evidence; the system invents neither a new slug nor a redirect.

## Verification status

Original expanded publication acceptance exits 1: missing expected serialization rejection. Repaired acceptance and final rebuilt rerun exit 0. Tests cover unchanged settings after refusal, source rows retaining their raw path, institutions/programs, owned directory/blog settings, approved articles, endpoint error and already-encoded positive capture/render. The actionable endpoint refuses with 422, constant code and original-encoding review message, without reflecting the offending path.

The existing publication mutation gate is expanded from 26 to 27 independent faults. `pnpm --filter @frontbase/backend exec node test/site-publication-mutation.mjs` exits 0: 27/27 broken safeguards trigger RED, including removal of the new browser-path guard, with rebuilt restored GREEN between faults and a final restored baseline. Its exclusive source/build slot was released before final workspace/host checks. This is the publication-specific matrix, not every production mutation or behavior gate.

Workspace `pnpm -r check` and `pnpm -r build` exit 0. Existing compatibility security, tenant isolation 175/175 (29 tables/two public-capability operations), conformance 334 operations (257 conforms/77 verified refusals; zero violations/unreachable/no-schema/stubs; differential 577 cases/76 differing), publication acceptance, captured SEO, built-host dispatch and no-leak exit 0. Existing build warnings remain; host gzip CF 519.5 KiB, Vercel 520.0 KiB, Deno 521.1 KiB; prohibited client symbols zero.

Restored preparation source SHA256 `1bda0a88059837e7794d963e929cf95b647eb107f4be7ac8486498be36d85ffe`; preparation route source `9b0a203a3330a10b3c23c5e8dafe0ac731063b902a517780ee6f2c9f6679eada`; external audit worker remains `b24601b47e745d7d3148430a8e8245c889ac1e12cf8b921be0b2f9c317da2220`. Modified preparation/route, existing acceptance/mutation tests, generated host and this report/current-plan receipts; unfamiliar/external work preserved. Changes are uncommitted; no primary subprocess or source/build lock remains. No live WordPress/Supabase/storage pulls, fresh reconciliation, deployed host/proxy, real saved pilot action or browser proof ran. Strategy/Decisions/README release boundaries and schema/read compatibility remain unchanged.

## Remaining work

Intended host/proxy reserved/fallback inventory, conservative audit/capture grammar differences, full unpublished catalog and browser preview verification remain open. Existing raw captures need a separately measured review/activation policy rather than breaking read compatibility here. State admission, trusted containment/recovery, all writers and installer coordination remain gates. Six packages, one engine, existing admin, release scope and paused CF-22 remain unchanged; no real saved-state/provider/publication/deployment/Git action is authorized or taken by this increment.
