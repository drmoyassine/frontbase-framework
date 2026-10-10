# R2 auth-form primary consistency repair

2026-10-09. Primary-reviewed bounded production repair following the [behavior isolation diagnostic](PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md). The accepted scope is [recorded in Decisions](DECISIONS.md). R1/R2 and public-release acceptance remain open; CF-22 remains paused.

## Changed behavior

[Auth-form routes](../../packages/backend/src/compat/routes/auth-forms.ts) now select primary forms using the persisted `is_primary` column when present, matching serialization and the existing set-primary operation. Null/absent columns retain the legacy configuration fallback. Active-only lookup still refuses an inactive selected form without choosing a different default. Metadata-only edits preserve the persisted selection rather than reviving stale configuration flags. Explicit configuration edits keep the existing supported semantics.

This does not add a primary uniqueness constraint, atomic concurrent switching, new public inquiry forms, schema migration or production authentication setup. Set-primary still clears and selects in two owner-scoped statements. Those concurrency limits remain explicit. No behavior-ledger refresh, dependency change, live account/data/provider operation, publication or deployment occurred.

## Focused evidence

The dedicated [functional gate](../../packages/backend/test/auth-form-primary.mjs) uses real handlers and fresh migrated in-memory SQLite. Seven groups cover ordinary create/set/get/switch, stale configuration metadata edits, inactive selection, distinct-owner isolation and cross-owner refusal, column/config disagreement and null fallback, malformed stored configuration, explicit configuration edits and anonymous refusal.

The first repaired run was six passing groups and one failed inactive test. Inspection established a fixture error: POST deliberately defaults from top-level `body.is_active`, overriding `config.is_active`. The fixture now submits top-level `is_active:false` and asserts returned inactivity before primary selection. Production active semantics were not changed to accommodate a mistaken fixture. Corrected functional command exits0, **7 passed/0 failed**.

The [mutation gate](../../packages/backend/test/auth-form-primary-mutation.mjs) deliberately reintroduces config-only lookup, stale metadata selection and an unscoped primary-clear UPDATE. Each mutant compiles and fails the named real state-behavior assertion; SQL binding/infrastructure failures cannot satisfy the test. Each restoration independently rebuilds and requires functional7/7 GREEN. Final rebuild/test and source hash verification pass: **3/3 faults detected**, restored route SHA256 `86b7ab19f13118fed1b8bc5f6141c6ff104821fc896b7d27dda71e894b9c1ed8`.

Both gates are registered in the existing backend functional/mutation chains. Primary ran all builds/mutations under an exclusive source/build lock. Independent agent review found no blocking issue in route semantics or registration. No new uniqueness/concurrency guarantee follows from these tests.

## Integrated verification

Primary verification against the restored source and completed workspace build:

| Command | Result |
|---|---|
| `pnpm -r build` / `pnpm -r check` | Both exit0; prior chunk/mixed-import warnings remain. CF517.1KiB, Vercel517.6KiB and Deno518.6KiB gzip; client no-prohibited-symbol gate passes. |
| Backend `auth-form-primary.mjs` / `auth-form-primary-mutation.mjs` | Exit0: functional7/7, mutation3/3; independent restored GREEN and matching source hash. |
| Backend `compat-security.mjs` / `compat-database-security.mjs` | Both exit0. |
| Backend `compat-tenant-matrix.mjs` | Exit0,175/175 identifier-bearing operations isolated,29 tables snapshotted. |
| Backend `compat-conformance.mjs --gate` | Exit0:257 conforming/zero violating/zero unreachable/77 verified refusals;334 operations. |
| Backend `compat-behavior-auth.mjs --gate` | Exit0:19 functional/3 shape-only/zero external-disabled. |
| Backend `compat-wave1b.mjs` | Exit0,6/6. |
| Backend `compat-wave1.mjs` | First process prints7/7 then native exit3221225477 (pnpm exit1); isolated rerun exits0,7/7. Initial process failure remains recorded; no established cause or infrastructure repair is claimed. |
| Full-CMS `node dist/smoke-host.mjs` | Exit0, all artifact/disk/route/misconfigured-boot checks pass; no live host deployment. |
| Backend `behavior-isolation-diagnostic.mjs` | Diagnostic exit0,21 child behavior gates still exit1; ledger unchanged. |

Post-repair behavior evidence is retained separately at `C:/Users/drmoy/AppData/Local/Temp/frontbase-r2-isolation-z11014/evidence.json`. Forward271 functional/46 shape-only/17 external-disabled,49 drift; reverse272/46/16,73 drift. Both have zero unreachable;36 order-dependent evidence entries and25 classification differences remain. The isolated ordinary create/set/get primary now succeeds. This closes the confirmed form defect but not behavior acceptance. The diagnostic now records the compiled auth-route hash so these measurements cannot silently be mistaken for the original baseline. Original conformance source and ledger hashes remain unchanged.

Primary also independently reproduced the separate [transport counterexamples](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md): two policy-denied SDK destinations invoke a throwing global spy instead of applying the injected guard, zero network requests sent. The [declaration-only candidate](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md) independently repeats at `frontbase-r1-backend-compat-wPBX8w`: repaired+mysql strict NodeNext/Bundler/upstream-only all exit0; repaired-no-driver all exit2 with one missing mysql2 error. Six archives and runtime bytes remain unchanged;16 declaration files differ. Neither candidate is a production dependency adoption or passing unpatched backend gate.

All changes after pushed checkpoint `d3cd122` remain uncommitted. Existing Python bytecode is preserved and excluded. Next release tasks are behavior fixture/classification review, distributable backend type repair, guarded SDK transport acceptance and clean-room CMS/host/operations evidence. Pilot namespace/install/inquiry/migration/reuse work retains its separate ordered backlog.
