# Page URL audit admin integration and host proof

**Subsequent active-capture increment:** [Active-capture URL audit](wordpress-pilot-active-capture-route-audit.md) extends the existing Pages check with server-owned hash/schema-validated institution, program and article paths, directory/blog indices and capture version. Prepared/inactive and uncaptured records are excluded. Utility/route regressions, three capture controls plus pointer-drift control, UI 6/6, built-host dispatch, workspace check/build, security/tenant/no-leak pass. Next: route-policy reconciliation and host-wide inventory; full unpublished catalog, preview inspection, runtime admission/recovery and coordinated writers remain gates. No installation or migration completeness is certified. Historical receipts below retain their original scope.

2026-10-10. Bounded M2 increment, not installation, migration or release clearance.

## Delivered

The existing Pages admin now offers **Check page URLs** through [PageRouteAudit](../../packages/console/src/components/dashboard/PageRouteAudit.tsx), mounted by [PagesPanel](../../packages/console/src/components/dashboard/PagesPanel.tsx). A demand-only dialog reports duplicate paths, possible spelling/slash aliases, reserved paths and unsupported paths. It retains tombstone evidence and clearly excludes institution/program/blog record URLs. A clear result never authorizes installation. Account identity changes remount the component; closing/unmounting aborts requests and late responses are discarded. No repair, deletion or publishing action is offered.

The [GET endpoint](../../packages/backend/src/compat/routes/page-route-audit.ts) is registered inside the existing authenticated compatibility app. Only owner/admin/tenant_admin/master_admin/root roles may inspect the server-context owner. Request parameters and bodies are refused; callers cannot supply an owner or listing inventory. Responses use no-store and noindex/nofollow. The existing bounded auditor selects route projections only, including retained framework rows even if their API is retired. Stored inventory is not a claim about every currently served route. Provider errors use constant unavailable evidence, not raw error text. No state writes occur.

The [built-host fixture](../../examples/cf-full/test/route-dispatch-audit.mjs) exercises the real engine in process with an isolated synthetic SQLite database. Legacy College pages accept boundary-slash and encoded variants but not lowercase spelling. A reviewed synthetic capture resolves its exact path, emits the capture version/canonical URL and refuses aliases/missing paths without mutable-page fallback. API and reserved asset paths remain separate. This proves the built Node-compatible host dispatch for these fixtures, not a deployed proxy, Cloudflare deployment, host-wide fallback inventory or real pilot publication. Root 404 in the synthetic capture is existing behavior, not completion of the pilot homepage.

## Verification

| Command / surface | Result |
| --- | --- |
| `pnpm -r check` | exit 0 |
| `pnpm -r build` | exit 0; existing chunk/dynamic-import warnings remain |
| `pnpm --filter @frontbase/backend run test:page-route-audit` | exit 0: utility 11 groups, endpoint checks, utility controls 5/5, endpoint controls 4/4 |
| Console `PageRouteAudit.test.tsx` | 5/5, exit 0; demand-only, scope, error redaction, strict response, stale-owner refusal |
| `pnpm --filter @frontbase/example-cf-full exec node test/route-dispatch-audit.mjs` | exit 0 |
| Existing compatibility/database security | exit 0 |
| Existing tenant matrix | 175/175; 29 tenant tables, two public-capability operations |
| Existing conformance | 334 operations: 257 conforms, 77 verified refusals, zero violations/unreachable/no-schema/stubs; differential 577 cases, 76 differing |
| Edge-infra no-leak | exit 0 |
| Whitespace | `git diff --check` exit 0; existing line-ending notices only |

Independent endpoint controls transpile source in memory and demonstrate role, owner, input-refusal and cache regressions without changing repository source. Utility controls likewise preserve original baselines. The conformance ledger covers its existing 334 operations; the new endpoint has its separate tests, not an expanded ledger claim. Final host gzip: CF 518.9 KiB, Vercel 519.4 KiB, Deno 520.5 KiB; prohibited client symbols zero.

The first endpoint test supplied null outside the existing principal contract and failed the unauthenticated check. Correcting the fixture to a principal with null user passes; authentication policy was not relaxed. The first host command used an incorrect package filter and matched no project: its exit status is not evidence. The corrected named package ran and passed.

The local port-4389 preview has no listener; reloading the existing browser tab returned connection refused. No successful browser/dialog/responsive inspection is claimed. Its saved database or administrator credentials were not replaced to manufacture a proof. No live WordPress/Supabase/storage pulls, fresh M3 reconciliation, production publication or deployed host/proxy checks ran.

## Boundary and next work

These controls belong to core backend/console; the education template remains a separate consumer. No new storage capability, route resolver policy, URL rewrite, dependency or architecture decision is adopted. Six packages, existing admin, one-engine scope and paused CF-22 remain unchanged. R1–R4 and M2 remain open.

Next: collect a trusted owner-specific catalog/capture path projection server-side, prove its provenance and bounds, then reconcile audit/preflight/capture classification without changing original WordPress paths. Complete host-wide reserved/fallback inventory and restore/inspect the intended local preview once its launch configuration is available. Runtime state admission, durable containment/recovery, all writers and installer coordination remain separate prerequisites. All changes remain uncommitted; no Git publication occurred.
