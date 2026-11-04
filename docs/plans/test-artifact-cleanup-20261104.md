# Test artifact cleanup — November 4, 2026

Owner requested local and remote test cleanup, explicitly approved the listed Vercel projects/databases, then approved removing the two named Supabase test schemas. This receipt retires infrastructure; it does not rerun application acceptance or erase its historical evidence.

## Removed and verified

| Surface | Removed |
| --- | --- |
| Cloudflare Workers | 9 known deployment fixtures |
| Cloudflare D1 | 2 databases exclusively attached to those tests |
| Cloudflare KV | 15 test namespaces |
| Cloudflare R2 | 3 test buckets, including the one 187-byte upload fixture |
| Cloudflare Queues | 2 test queues and their two consumers |
| Cloudflare Vectorize | 1 test index |
| Vercel | 24 approved test projects and their deployments |
| Turso through Vercel | 13 approved test databases; connection check excluded unrelated projects |
| Studygram Supabase | Exactly `frontbase_edge_cf_http_261101` and `frontbase_edge_vercel_http_261101` |
| Local artifacts | 35 inspected package/host/temp proof directories, 2 clean native test clones, 1,515 generated logs/response bodies/profiles/screenshots/helper files |

Cloudflare Workers removed: `frontbase-accept-cf-261101a`, `frontbase-booking-cf-261101`, `frontbase-choice-screen-261103`, `frontbase-handoff-261031`, `frontbase-live-cf-261103`, `frontbase-live-cf-261103b`, `frontbase-native-handoff-261031`, `frontbase-state-cf-261101`, `frontbase-wizard-cf-261103`. Resource bindings were inspected first and no preserved Worker referenced the selected resource IDs. Final inventory dropped from 34 to 25 Workers, 10 to 8 D1, 28 to 13 KV, 5 to 2 R2 and 8 to 6 queues; no Vectorize indexes remain.

Vercel projects removed: `cf-full`, `frontbase-live-vc-261103`, `frontbase-first-wizard-261103`, `frontbase-wizard-vc-261103`, `frontbase-wizard-vc-261103b`, `frontbase-booking-vercel-261101`, `frontbase-accept-vercel-261101a`, `frontbase-state-vercel-261101`, `frontbase-state-vercel-261101b`, `frontbase-vercel-browser-261031`, `frontbase-integration-261031`, `frontbase-integration-261031b`, `frontbase-integration-261031c`, `frontbase-integration-2x61031b`, `frontbase-prod-vercel-261027`, `frontbase-native-oauth-261027`, `frontbase-hosted-vercel-261026`, `frontbase-final-vercel-261022`, `frontbase-fresh-261020`, `frontbase-clean-vercel-261022`, `frontbase-native-vercel-261021`, `frontbase-profiles-261020`, `vercel-usa-test`, `vercel-testtt`. Provider readback found zero approved project IDs and zero approved database IDs remaining.

Supabase project is Studygram DB (`uwzosvzynnpbxpnwqgkm`). The two retired schemas were the dedicated state schemas documented in [the HTTP state acceptance receipt](hosted-postgres-state-20261031.md). Before deletion, dependency inspection found only their internal PostgreSQL TOAST tables outside those namespaces. Migration `retire_isolated_frontbase_http_acceptance_schemas_20261104` refuses other external dependencies and drops only the two schemas. Readback: zero test schemas, `public` still present with 77 tables. No source-record, public-table or shared translation mutation was performed. The earlier expired confirmation did not execute; the subsequent owner-approved migration succeeded.

## Archived and preserved

Seven test GitHub copies were archived, disabling further normal builds: `frontbase-live-vc-261103`, `frontbase-live-cf-261103b`, `frontbase-live-cf-261103`, `frontbase-first-wizard-261103`, `frontbase-wizard-cf-261103`, `frontbase-wizard-vc-261103b`, `frontbase-wizard-vc-261103`. They were not permanently deleted. The CLI grant lacks `delete_repo`; no permission expansion was attempted.

Production OAuth service, Study-in-USA installations, staging, shared content/translation connections, other projects and source worktrees were preserved. Production OAuth health and Study-in-USA staging returned 200. Old `studygram-inc.workers.dev` hostnames are historical; resource inventory, rather than obsolete DNS, identified the preserved Workers.

Unclassified resources, the other Supabase schemas, source patches, dirty checkouts, shared tool caches and local production/recovery material remain. Docker Desktop's engine was unavailable, so stopped Docker containers/volumes were not inventoried or removed. These exclusions are not claims that every remaining item is production or that all account-wide resources have been classified.

## Effect on the release plan

The November 3 deployment/template/bilingual/upgrade receipts remain dated evidence. Their retired fixture URLs must not be used as live acceptance targets or reported as a new availability regression. Candidate qualification must create or select explicitly scoped replacement fixtures. Candidate freeze and the remaining release gates are unchanged. Local ignored test receipts were cleaned; committed implementation/tests and durable documentation remain.
