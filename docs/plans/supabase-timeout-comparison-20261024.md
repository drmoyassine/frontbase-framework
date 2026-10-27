# Supabase timeout comparison — 2026-10-24

Status: bounded staging recovery verified. The duplicate editor bootstrap repair is committed/pushed and deployed as `c7a4dc3`. The shared source recovered after the reviewed zero-increase Nano-to-Micro resize/restart. Long-term workload capacity is not certified; public-release gates are unchanged.

## Controlled comparison

Compare pre-feature `0e9b8c9` (`1c3bf9e^`), deployed `2e0e9db`, and the repaired working tree using `node scripts/diagnostics/frontend-editor-load.mjs` from the repository root. This executes each real browser controller in an isolated JSDOM fixture with HTTP stubs; it sends no production requests. [Machine-readable results](../reports/frontend-editor-load-comparison-20261024.json).

- Anonymous: one capability request, zero inventory requests in every version.
- Signed-in stable list: before one inventory; deployed two; repaired one. Capability remains a separate state-only request.
- One hundred unrelated DOM mutations: no additional requests in any version.
- Actual record-selection change: one new selected inventory in the deployed/repaired versions. Failed selections do not create a retry loop.
- The repair passes the displayed selection in the first inventory call, retaining the same server validation, source filters, active-version checks and save token. A changed selection during bootstrap is reconciled afterward.

The source SQL executor, single-table query, related-field reader and Supabase HTTP runner have no runtime changes between the pre-feature and deployed versions. The datasource-runner diff is a TypeScript return annotation only. This does not prove every workload cost is identical: selected inventories still use the existing live resolver and record admission path.

## Shared-source observations (UTC)

Project `uwzosvzynnpbxpnwqgkm`, Studygram DB, eu-central-1, PostgreSQL15.1.1.73. Its organization is on Pro. Project status `ACTIVE_HEALTHY` does not establish successful data reads.

- Provider status at18:54UTC reports an ongoing Management API incident in monitoring. It does not explicitly establish the cause of this project's data-plane failure: https://status.supabase.com/incidents/01M5J8ZQ04EZXAYF10Q75MGC1T
- Logs contain SQLSTATE57014 statement timeouts and PGRST003 pool acquisition timeouts, including independent application requests. A bounded homepage read at19:14UTC returned503 after34.6seconds; state health previously remained200.
- Activity snapshots show18–28 connections, versus configured max_connections60, and no persistent heavyweight lock blocker. A single pg_stat_monitor lightweight-lock observation was not sustained and is not a root-cause finding.
- EXPLAIN without execution for program46189 selects `idx_programs_id`, one estimated row, cost0.29–2.51. The same point lookup with execution can exceed5seconds. A missing ID index is therefore not supported by the evidence.
- A scoped session-only diagnostic without pg_stat_monitor tracking also failed to complete. No persistent monitoring, timeout, permission or capacity settings were changed. No database rows were changed during this investigation.

API-log aggregates:15:00–16:00 approximately201,854 scraper requests;16:00–17:00 approximately209,671. Frontbase-compatible execute_query traffic in16:00–17:00 was139. In17:10–17:20, execute_query had1,665 requests, mean origin time65.3ms, against33,672 scraper requests at12.1ms. In17:20–17:30, execute_query fell to54 while scraper traffic remained35,481. Broad failures emerged around17:30; source problems continued after Frontbase traffic dropped nearly to zero. These are HTTP counts/durations, not CPU or disk attribution, and do not justify cancelling the unrelated scraper.

## Resource diagnosis and recovery action

Owner corrected the browser account at approximately20:03UTC. The dashboard identifies the project as legacy Nano (`t4g.nano`) on Pro. Infrastructure reports disk I/O balance0%, CPU98%, memory75%, and only13% disk-space use (database403.5MB, WAL128MB). The last-hour observability report shows memory commitment1.83GB flagged SEVERE, CPU70.01%, and substantial swap use. The24-hour graph shows swap and severe commitment throughout the displayed period, rather than only following today's frontend request increase. Commitment is a kernel allocation promise, not resident RAM; these measurements support shared resource pressure but do not attribute all load to a particular application. Some disk/connection time series fail to load.

The infrastructure UI explicitly offers Nano to Micro as a free upgrade: both$0.01344/hour, before/after$9.68/month, delta$0.00. Within the owner's authorized repair scope, reviewed and submitted this exact change; no disk, spend-cap, security or unrelated-job settings changed. The provider completed the resize/restart and reports `t4g.micro`. This increases RAM from up to0.5GB to1GB and documented baseline disk I/O from250 to500IOPS. Recovery verification below passes; a larger paid resize has not been authorized or applied.

References: [compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk), [memory/swap and commitment interpretation](https://supabase.com/docs/guides/observability/reports). Do not equate the ongoing Management API incident with the established resource-pressure evidence.

The recovery acceptance below preserves confirmed source restorations and Arabic publication generation4. The resize also restarts the instance, so this is not a controlled experiment separating added capacity from restart effects.

## Local qualification

Node22 workspace `pnpm -r check` and `pnpm -r build` pass. Frontend record SQL/native HTTP/typed/CAS/cancellation, bootstrap selection races and stable-request-count checks pass;11 frontend editing groups and real locale publication/editing suites pass. Security-sensitive server write/auth/predicate code is unchanged from its previously qualified fault suite. Console staging and final host build pass.

## Deployment and follow-up verification

At approximately19:57–19:59UTC, the public editor endpoint returned200 with SHA256 `09d11d11ae83658adca566fd59b713dadd934b9e6ad4e7348b7a1201e1089fe5`, exactly matching the locally qualified `c7a4dc3` script. State health returned200. One bounded read per language still returned503: English28.71seconds, Arabic18.88seconds. A connector point lookup of program46189 still exceeded the session's5-second statement timeout (57014). The request reduction is deployed, but does not resolve the shared source outage.

The owner reports intermittent Database and PostgREST unhealthy indicators. After renewed GitHub authorization, the available browser still lists only drmoyassine's Org and Mohamad's projects; navigating to Studygram DB redirects to that organization list. The account/organization shown in the owner's working dashboard is being clarified. No additional source writes or infrastructure mutations were attempted.


## Recovery acceptance, approximately20:08–20:14UTC

- Program46189 lookup passes with the same5-second local statement limit. Source tuition remains27021 and intakes `Dec,Feb,Jan,Jun,Aug`. EXPLAIN ANALYZE of the ID lookup: index-only scan, execution0.095ms, planning1.251ms. Earlier executions hit5-second statement timeout.
- Anonymous health, English/Arabic homepages and all four Explore variants return200. Private inventory returns401; anonymous capability is disabled. English and Arabic keyed live-list values preserve the original and translated five-month intakes. The first harness completed all assertions/wrote its result but failed printing Arabic in the Windows console; a UTF-8 console rerun exits0.
- Fresh signed-in browser list filtering and selected record inventory recover in both languages. English tuition27022 and Arabic two-month intake edits were staged locally, then globally cancelled; displayed originals and disabled Save Changes controls were restored. No new source/translation writes were made. Previously qualified actual save/readback/restoration evidence remains applicable.
- Post-restart report covering20:08–20:12UTC: CPU23.52%, memory commitment1.33GB with no SEVERE warning and markedly reduced swap. The memory headline includes cache/buffers; do not equate it with resident application pressure. Infrastructure summary historical values can lag this short-window report.
- A pre-existing browser tab hit ERR_CONNECTION_RESET during recovery; a fresh tab loaded and completed both locale checks. No network/security bypass was used.

Conclusion: verified immediate recovery after relieving legacy Nano resource pressure; the redundant Frontbase owner inventory was also repaired. Neither the precise contribution of each shared workload nor long-term Micro capacity is established. Do not claim the provider Management API incident caused this data outage. Further capacity changes or unrelated workload changes need their own evidence and scope. Screenshots are retained privately: supabase-memory-pressure-20261024.png, supabase-memory-recovered-20261024.png, supabase-micro-review-20261024.png and supabase-recovered-program-en/ar.png.
