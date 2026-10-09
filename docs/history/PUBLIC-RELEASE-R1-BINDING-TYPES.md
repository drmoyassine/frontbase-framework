# R1: self-contained D1/KV binding declarations

**2026-10-08; bounded infrastructure repair implemented and locally verified, uncommitted.** Addresses the two missing globals from the [external declaration diagnosis](PUBLIC-RELEASE-R1-DECLARATION-DIAGNOSIS.md). Full R1/backend declaration acceptance remains open.

## Change and compatibility

The existing `d1RunnerFromBinding` and `kvCache` functions now use exported structural interfaces: D1DatabaseBinding/D1PreparedStatementBinding and KVNamespaceBinding. These describe only prepare/bind/all/run and get/put/delete operations actually consumed by the adapters. D1 changes metadata retains both numeric and count-object forms already handled by the implementation. The source-only D1/KV ambient shims are removed; emitted adapter declarations import no implicit Cloudflare globals. No runtime body, default provider, cache semantics, DbRunner/cache engine contract, auth/secret behavior or dependency version changed. This adds adapter input types within the existing infrastructure package; it does not create a package or duplicate engine contracts.

The external checker optionally installs an exact official @cloudflare/workers-types version and compiles actual D1Database/KVNamespace inputs through these functions. It also requires type errors for an invalid prepared statement and a numeric KV read, preventing a permissive binding interface from satisfying the test. Cloudflare types are a diagnostic dependency only; Node consumers do not need them to load infrastructure declarations. Type assignability is not an actual Cloudflare service/deployment test.

## Immutable external evidence

Fresh runtime/starter proof: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-consumer-bssJsT/evidence.json`. Six tarballs,23 runtime entries,14 commands exit0; sibling starter install/build/test/check and compiled routes/browser projection pass without workspace references or escaped dependency links. Lifecycle scripts remain disabled and internal versions use explicit local overrides.

Fresh strict declaration/Cloudflare proof: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-declarations-mTXjQT/evidence.json`. TypeScript6.0.3, @types/node26.1.1, official @cloudflare/workers-types5.20261008.1, skipLibCheck:false; normal third-party install permitted network access with lifecycle scripts disabled.

| Profile | Result |
|---|---|
| Browser core/UI/builder16 entries | exit0 |
| Compiler5 entries | exit0 |
| Infrastructure Node declaration import | exit0; previously two missing-global errors |
| Actual Cloudflare D1/KV assignability and invalid-binding refusals | exit0 |
| Backend and all23 declaration imports | exit2,19 Drizzle diagnostics each; aggregate diagnostic exits1 |

Archive hashes: infrastructure `714e01bf6ef803144122efd546809b2dd6f36ab3c5651375096cefa96389e99a`; backend `4f254f03657ecaf0990c0332a241436960bd94dc401072c3b5a3a5bddfa28a41`. Other four hashes match the prior runtime proof. Backend packaging changed because its dedicated fixture-mutation script registration was added after the prior archives; this binding repair does not alter backend production handlers. These are local artifact measurements, not released binaries or registry evidence.

## Integrated verification and remaining work

`pnpm -r build` and `pnpm -r check` pass. Infrastructure runners, cache and no-leak tests pass. Runner tests explicitly skip live D1-REST/Supabase credentials; this task uses no live service. Fresh strict response conformance remains257 conforming/zero violating/zero unreachable/77 verified refusals; regenerated host smoke passes. Existing build warnings remain; CF517.1KiB/Vercel517.6KiB/Deno518.6KiB gzip measurements are unchanged. The existing cache suite primarily tests memory/null behavior; official KV type assignability does not create a new live KV behavior claim.

Backend's Drizzle0.36.4 errors remain unsuppressed. Compare compiler configurations/versions and establish a narrowly tested dependency compatibility remedy before a backend change; no ORM upgrade/export removal is accepted here. Behavior fixture isolation and unchanged failing ledger, lifecycle/full-CMS clean-room path, supported-host recovery and owner-reviewed registry/release operations remain separate open gates. No CF-22 resumption, real canonical/storage/private layout write, publication or deployment occurred. Prior source and Python bytecode are preserved; no commit/push occurred.

**Compiler comparison completed:** The same six immutable archives were tested offline with TypeScript5.9.3, retaining official Cloudflare types5.20261008.1 and all check thresholds. Evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-declarations-ZlVW4z/evidence.json`. Browser/compiler/infrastructure/Cloudflare profiles pass; backend/all-package profiles each still report19 diagnostics and exit2; overall diagnostic exits1. The backend failure is therefore not specific to the tested TypeScript6 compiler. Neither version is substituted into the workspace or adopted as a release workaround.
