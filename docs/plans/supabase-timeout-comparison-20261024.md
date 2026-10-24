# Supabase timeout comparison — 2026-10-24

Status: investigation in progress. The duplicate editor bootstrap inventory repair is committed/pushed as `c7a4dc3` and deployed; shared-source recovery has not been established. No release or staging-health sign-off.

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

## Remaining causal check

Read CPU, memory and disk I/O balance/time series from the authorized project's dashboard. The existing GitHub account signed in successfully but lacks Studygram organization access; owner sign-in to the correct account is pending. Do not infer resource exhaustion solely from traffic, perform a paid resize, restart a shared database, or disable unrelated jobs without the matching evidence and scope.

Then apply the evidenced repair and verify anonymous English/Arabic homepages and both Explore variants, private inventory, locale-specific live values and editing/cancellation. Preserve confirmed source restorations and Arabic publication generation4. A successful local request-count repair alone cannot close the source-availability gap.

## Local qualification

Node22 workspace `pnpm -r check` and `pnpm -r build` pass. Frontend record SQL/native HTTP/typed/CAS/cancellation, bootstrap selection races and stable-request-count checks pass;11 frontend editing groups and real locale publication/editing suites pass. Security-sensitive server write/auth/predicate code is unchanged from its previously qualified fault suite. Console staging and final host build pass.

## Deployment and follow-up verification

At approximately19:57–19:59UTC, the public editor endpoint returned200 with SHA256 `09d11d11ae83658adca566fd59b713dadd934b9e6ad4e7348b7a1201e1089fe5`, exactly matching the locally qualified `c7a4dc3` script. State health returned200. One bounded read per language still returned503: English28.71seconds, Arabic18.88seconds. A connector point lookup of program46189 still exceeded the session's5-second statement timeout (57014). The request reduction is deployed, but does not resolve the shared source outage.

The owner reports intermittent Database and PostgREST unhealthy indicators. After renewed GitHub authorization, the available browser still lists only drmoyassine's Org and Mohamad's projects; navigating to Studygram DB redirects to that organization list. The account/organization shown in the owner's working dashboard is being clarified. No additional source writes or infrastructure mutations were attempted.
