# Translation HTTP persistence — retained delivery evidence

2026-10-17. Implementation is present in the shared uncommitted worktree. This receipt reconciles retained machine results; it is not a new deployment or a fresh rerun during the R0 documentation audit. It supersedes the direct PostgreSQL translation runtime in the [earlier runner receipt](frontbase-translation-runner-integration-20261017.md).

The standalone engine exposes a typed thirteen-operation PostgREST port. The [host bridge](../../packages/edge-infra/src/translation.ts) reuses the [existing shared client setup](../../packages/edge-infra/src/providers/supabase-http.ts), credentials and injected fetch. Native PostgREST uses an explicit root restUrl; ordinary Supabase retains /rest/v1. HTTPS is required. Direct translation PostgreSQL adapters/exports/tests are removed; unrelated framework providers are preserved. No new third-party dependency, socket, Hyperdrive requirement or generic SQL runtime endpoint is added.

[Versioned administrative SQL](../../packages/translation/sql/postgrest-v1.sql) installs six tables and one finite domain dispatcher in translations. Transactions use database-clock leases, scoped CAS and fenced completion, with revision/head/job writes committed atomically. The RPC is SECURITY INVOKER; six tables have RLS, and the privileged host role has no BYPASSRLS. History/revision UPDATE/DELETE privileges are withheld. The trusted server credential is a host security boundary, not visitor/App Users authorization. Installation is an explicit administrative action, never arbitrary runtime SQL.

## Retained verification

| Surface | Recorded outcome and boundary |
|---|---|
| Workspace | pnpm -r check and pnpm -r build pass in retained Node24 logs; existing bundle warnings remain |
| Translation | Functional suite and 22/22 mutation faults pass, including four HTTP adapter faults; SQLite remains a reference adapter |
| Infrastructure | Full functional suite, six retained security mutations and two D1 count mutations pass with source restored |
| Actual owner HTTPS | [75 RPC calls](../../scripts/localization/http-evidence/live.json): eight competing claims, one deterministic fake-provider invocation, source race, scope refusal, lease epochs, manual protection, cancellation, retry limits and forced completion rollback pass; no real AI calls |
| Restart | Existing translation-recovery.mjs probe passed after actual database/API restart; source history, manual head and completed job retained |
| Local edge | [Node/local workerd fixtures](../../scripts/localization/http-evidence/hosts.json) pass eight concurrent requests per host with mocked HTTP and outbound disabled; this is not deployed Cloudflare or browser acceptance |
| Import graph | [es2022 graph](../../scripts/localization/http-evidence/import-graph.json) uses shared PostgREST client, no native DB driver or Node compatibility requirement; server-side capability proof, not browser credential delivery |
| External archive | [Receipt](../../scripts/localization/http-evidence/package.json): 47,442 packed bytes, SHA256 5dab01d81e795c233104d4b401975d0e30ba0a2de36e4b06902191683068687a; offline external functional/types pass, SQL included, no retired direct adapter; lifecycle scripts disabled, no registry availability claim |
| Cleanup | [Final schema check](../../scripts/localization/http-evidence/cleanup.json): public objects0, six translation tables/RLS policies, no fault trigger or synthetic translation units, immutable history privileges retained; only built-in plpgsql installed |

The SQL contract was installed on frontbase/studygram-selfhost using a temporary administrative setup service, subsequently removed. The persistent PostgreSQL/PostgREST pair remains the active deployment; its original external volume is preserved. No source content or public schema was migrated. See [deployment/name evidence](frontbase-postgrest-owner-deployment-20261017.md). Framework changes are uncommitted/unpublished and were not deployed into the staging application by this increment.

## Remaining work

Next product step is authorized datasource/storage selection and trusted host connection resolution into this HTTP adapter, supporting the same or a separate datasource. AI provider/budget accounting, scheduling, extraction, contextual generation, visual refinement, localized publication/query/SEO/RTL and actual configured-user acceptance remain open. No formatter library is selected. This bounded persistence delivery does not complete the AI-native translation product, certify all providers, close framework release gates or resume CF-22.
