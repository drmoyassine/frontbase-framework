# Read-only route namespace audit

**Subsequent active-capture increment:** [Active-capture URL audit](wordpress-pilot-active-capture-route-audit.md) extends the existing Pages check with server-owned hash/schema-validated institution, program and article paths, directory/blog indices and capture version. Prepared/inactive and uncaptured records are excluded. Utility/route regressions, three capture controls plus pointer-drift control, UI 6/6, built-host dispatch, workspace check/build, security/tenant/no-leak pass. Next: route-policy reconciliation and host-wide inventory; full unpublished catalog, preview inspection, runtime admission/recovery and coordinated writers remain gates. No installation or migration completeness is certified. Historical receipts below retain their original scope.

**Latest integration (2026-10-10):** [Page admin audit and host proof](wordpress-pilot-page-route-audit-admin.md) supersedes earlier unwired/next-integration statements below. The authenticated endpoint and existing Pages dialog check stored owner pages only; utility 11/five controls, endpoint/four controls, UI 5/5 and isolated built-host dispatch pass. Listing/blog paths, deployed/host-wide inventory, preview browser verification, state admission/recovery and coordinated writes remain open. Next: trusted server-side catalog/capture projection and reconciled policy. Historical receipts below retain their original scope.

2026-10-10. Internal backend inspection module, not an installed template, mutation protocol, migration or new serving policy. Builds on [route observations](wordpress-pilot-state-interface-and-routes.md) and the [namespace contract](wordpress-pilot-namespace-contract.md). M2 and release gates remain open.

## Delivered boundary

[route-namespace-audit.ts](../../packages/backend/src/compat/route-namespace-audit.ts) adds `inspectNamespacePath` and `auditRouteNamespace` inside the existing backend package. Neither is registered with HTTP/admin routes or exported through the public package barrel. Current preflight, resolver, publication schemas, state writers, dependencies and accepted storage architecture are unchanged.

The auditor receives a query-only runner, a trusted owner and an explicit framework-enabled flag. It reads only owner-scoped route projections: compat IDs/slugs/home flags/deletion state and, when enabled, framework draft/published slugs. Each table is limited to 1,001 rows; more than 1,000 refuses. No layouts, secrets, settings, titles, provider configuration or canonical catalog rows are selected. SQL values are parameterized and returned rows are checked against the owner again. No exec method, resource creation, path rewrite, delete, winner selection or repair occurs.

Optional public paths are a copied, bounded, trusted owner-specific projection of template/directory/blog/institution/program/article identities. This function does not retrieve or authenticate that projection. Before admin integration, the server must collect it from validated owned configuration/capture or a separately approved source audit; arbitrary request-supplied records must not masquerade as owned inventory. IDs must be string projections and are unique within their source family. This is not a fresh WordPress/Supabase reconciliation.

## Inspection policy

The initial conservative inspection grammar accepts root and ASCII alphanumeric/hyphen path segments, preserving case and the final slash. Known reserved prefixes/files are the union of current preflight/capture and inspected host asset surfaces. Encodings, dots, underscores, repeated separators, traversal, query strings, malformed or oversize paths are unsupported; this is a review refusal rather than evidence those original URLs are invalid or should be changed. Custom host routes still need explicit host inventory. An unsupported path is reported by owned resource identity without echoing the raw path.

Compat slug interpretation is explicit: ordinary stored `College` contributes `/College`; stored leading/trailing slashes and empty slugs are unsupported rather than silently repaired. A homepage also contributes root, including its tombstone. A deleted page retains its possible conflicts. Framework draft and published rows with the same slug are one legacy slug-keyed logical resource; this does not establish stable rename identity. Compat, framework and public listing families are never merged because IDs or content happen to match.

Supported paths are grouped conservatively by lowercase spelling with one final slash removed. Identical spelling across different resources is `route_conflict`; variants are `potential_alias_conflict`. These are conflict checks, not aliases or redirects. Original supported spelling is retained in evidence, including an old program parent slug. Report ordering uses a fixed lexical comparator and is independent of supplied row order. An issue has at most 50 resources, at most 100 issues are returned and truncation remains explicitly visible with conflict status. Installation is always unavailable, even for an empty/clear report.

## Additional serving observation

The earlier diagnostic established exact capture matching and exact stores. This increment also exercises the actual [legacy tenant serving helper](../../packages/backend/src/tenancy/serving.ts): it decodes a request path and removes all boundary slashes before querying the stored slug. `/College`, `/College/`, `///College///` and `/%43ollege/` select stored `College`; lowercase `/college/` does not. Reviewed capture matching still refuses the encoded substitute. The expanded diagnostic now has seven groups. This narrows earlier store-only evidence; it does not retroactively claim earlier host coverage.

The example self-host host currently opts into the legacy cross-tenant fallback, while cloud passes no fallback. This audit deliberately inspects only its trusted owner and never broadens that scope. Therefore it does not certify the self-host fallback's host-wide namespace or prove all engine/proxy dispatch. Resolve the intended owner/host binding and run host dispatch acceptance before installer admission; do not weaken isolation to hide foreign rows.

## Concurrency and failure boundaries

The auditor repeats route projections and refuses observed drift. It does not hold a transaction or prevent ABA changes, edits after inspection, updates to unrelated content, or concurrent catalog changes. A clear result means only that no included conflict was observed in matching bounded projections. Missing enabled tables, provider errors, foreign/malformed rows, duplicate persistence keys and oversized inventory produce constant unavailable/refusal codes without raw errors. Framework tables are not read when explicitly disabled; this must match the trusted host's actual feature configuration, not a caller-selected bypass.

The accepted writer-coordination/journal and recovery requirements remain prerequisites. No capability is inferred from a successful read or ordinary DbRunner transaction presence. No uniqueness backfill or schema migration ran. An eventual admin control belongs inside `/frontbase-admin`; this increment creates no second admin.

## Verification

[Functional fixture](../../packages/backend/test/route-namespace-audit.mjs) covers real isolated SQLite owner-only reads and byte-preserving snapshots, draft/published identity, tombstones, cross-family collisions, case/slash variants, home/root, unsupported-path redaction, ordering/input preservation, drift, provider faults, foreign/malformed/duplicate/oversize refusals, bounded evidence and frozen host options.

[Independent controls](../../packages/backend/test/route-namespace-audit-controls.mjs) transpile source variants in memory. Five separate faults remove owner validation, ignore tombstones, weaken alias grouping, remove drift detection or grant install availability. Each must trip its specific detector, with an original baseline before and after each fault; source/dist bytes are never overwritten. The first controls run detected two faults then failed because the third source-match string lost its regex escape; the harness now uses a raw string, and all five controls pass. This was a harness failure, not a hidden all-green first run.

```powershell
pnpm --filter @frontbase/backend exec node test/route-namespace-audit.mjs
pnpm --filter @frontbase/backend exec node test/route-namespace-audit-controls.mjs
pnpm --filter @frontbase/backend exec node test/route-identity-diagnostic.mjs
```

Exact final build/check/regression results and skips are recorded in the audit completion receipt. Fixture/source changes and documentation remain uncommitted; unfamiliar and external changes are preserved. No credential-gated live or intended-host/proxy checks, fresh migration audit, state writer integration, publication/deployment or CF-22 action occurs.

Final measured results: functional 11/11 (including mixed exact/alias reporting and copied projection assertions), independent controls 5/5 and route observations 7/7 exit 0; workspace check/build, existing preflight, captured SEO, compatibility/database security and edge-infra no-leak pass. Whitespace and 105 local report/current-plan links resolve. Full production mutation/conformance matrix and live/host/capability checks are skipped, not certified. Audit source SHA256 `016996cbfb7e5b7c784aa8b04f5c8ae3dd582d180a6cdbeeeadf2e70edd1cfb6`; unrelated external worker hash remains unchanged. Existing build warnings persist; no milestone/release clearance follows.

Next: prove host dispatch and inventory coverage, then connect a bounded authenticated read-only control in the existing admin and reconcile preflight/capture checks with the reviewed route policy. Runtime transaction admission, trusted containment storage, billing/migration compatibility, journal recovery and coordinated writers still precede installation. A readonly warning screen cannot substitute for these guarantees.
