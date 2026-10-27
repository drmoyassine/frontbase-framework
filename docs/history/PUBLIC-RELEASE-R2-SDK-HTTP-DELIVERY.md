# R2 guarded SDK HTTP threading — bounded delivery

2026-10-10. Primary Wave 1 increment from the [two-session allocation](../plans/wordpress-pilot-two-session-waves.md). Locally implemented and independently verified; uncommitted after `d3cd122`. This closes the two demonstrated Turso-vector and Supabase-datasource injected-HTTP bypasses within the tested backend paths. It does not close all transports, behavior, package, installer or release gates.

## Change and boundary

[Infra runners](../../packages/edge-infra/src/providers/runners.ts) and [libsql vector](../../packages/edge-infra/src/vector/libsql-vector.ts) now accept optional per-instance `ServiceFetch` hooks using the existing structural transport contract. PostgREST receives its instance `fetch`; D1 REST uses its chosen instance transport for query/exec. Libsql receives its HTTP hook through a [shared configuration helper](../../packages/edge-infra/src/providers/libsql-http.ts); with that hook, only HTTPS and default-TLS libsql transport are accepted. Explicit HTTP/WebSocket and `tls=0` configurations refuse before SDK transport. Infra does not import backend URL policy or install process-global SDK configuration.

The [backend datasource factory](../../packages/backend/src/db/datasource-runner.ts) constructs a guarded transport even for callers using its existing two-argument form. The compat app, sync/search, database, public data execution, directory preview, editorial, publication and template preparation pass their injected host transport to the factory (27 caller sites). Credentials and owned configuration still resolve through existing account/tenant seams. The separate framework Data Studio factory uses the guarded default; it does not gain a new per-host injection option in this increment.

[System services](../../packages/backend/src/compat/system-services.ts), [app](../../packages/backend/src/compat/app.ts) and [vector probe](../../packages/backend/src/compat/routes/edge-generic.ts) retain SDK Request objects instead of reducing them to URLs. The verified Request guard now sees effective method, headers/body, manual redirect mode, cancellation and deadline. HRANA's changed response `base_url` is checked at the subsequent actual fetch request; no private-destination request reaches the scripted host transport.

Existing explicitly selected local SQLite/file/memory runner and vector behavior remains separate and unchanged. This preserves existing capability; it does not authorize new filesystem exposure. HTTP injection is not a native/wire/WebSocket guard. The backend's Neon branch is unchanged and remains open; no temporary global `neonConfig.fetchFunction` replacement, raw fallback after an injected denial or new dependency was introduced.

SDK source inspected: installed libsql client/core 0.17.4, HRANA 0.10.0 and PostgREST 2.110.2. [Official initialization docs](https://supabase.com/docs/reference/javascript/initializing) corroborate custom fetch configuration; the actual standalone PostgREST hook was checked in installed source. The markdown changelog fetch failed (browser content-type limitation and shell DNS failure); [HTML changelog](https://supabase.com/changelog) was available. No SDK upgrade or current-version support beyond the installed graph is claimed.

## Functional and mutation proof

[SDK functional gate](../../packages/backend/test/sdk-http.mjs): **15/15**, zero raw/global SDK calls. Every network action is a scripted local response or a throwing offline sentinel; invented endpoints never receive a socket request. Cases cover:

- Actual libsql vector POST Request, auth/body/manual redirects and SQL presence.
- HTTPS normalization and nonempty libsql query results.
- Private literal vector and datasource refusals before host/raw transport.
- Supabase query/exec results, schema/SQL, opaque new keys, legacy bearer keys and explicit user JWT context.
- Redirect refusal without credential forwarding to its target.
- Unsupported libsql transport/TLS downgrade and injected-denial no-fallback.
- Concurrent separate owner transports/keys with distinct returned rows.
- D1 REST query/exec injection (existing object-shaped affected count fixture).
- Trusted native memory datasource/vector with no HTTP.
- A real installed SDK transaction whose next stream request adopts a private `base_url`, refused by the guard.
- Actual owner-scoped sync/database routes with nonempty results, foreign-owner 404 before transport, private test-raw refusal without credential exposure.
- Actual vector probe route preserving SDK Requests through DDL/batch/search/delete calls. This scripted protocol acceptance is not real provider vector-distance/DDL acceptance.

[Mutation gate](../../packages/backend/test/sdk-http-mutation.mjs): **6/6** detected. Faults remove libsql/PostgREST/D1 instance injection, bypass datasource URL policy, remove guarded remote-transport refusal, and collapse the vector route Request. Each fault compiles and causes its named behavioral assertion to fail. Initial, every restored and final baseline independently rebuild infra/backend and require all 15 functional cases to pass. Final source hashes match the pre-mutation sources:

| File | SHA256 |
| --- | --- |
| Infra libsql HTTP configuration | `d9ed9aaf788bc27d6ea0f781984c0c171be2adee879bb63c5bf9b736faee0050` |
| Infra runners | `989a29fb3916dc06653b0038a793466b09a058ae3315ba414c08e80f0acf1856` |
| Backend datasource factory | `72550818cfc16ff99f7dbd26303beb83be4ffa3fa45353fdf8406e13ee917ced` |
| Vector route | `fed692583689b142406609aadd8b47268be9f6efa03f236443acb1b13480c7aa` |

Both gates are registered in the backend's existing functional/mutation chains. The old `transport-denial-diagnostic.mjs` is historical counterexample tooling that expected the prior defect; it is not the new acceptance gate and was not rewritten to erase history.

## Integrated verification

Commands: `pnpm --filter @frontbase/backend exec node test/sdk-http-mutation.mjs`, final `pnpm -r build`, final `pnpm -r check`; all exit 0. An initial check before rebuilding infra declarations failed against stale declarations; rebuilding resolved it, and both subsequent checks passed. The first HRANA fixture expected transaction construction to send a request; installed SDK begins lazily. The corrected fixture executes once successfully then verifies refusal on the second request. These initial failures are retained here rather than represented as first-run green.

All **18 selected regression processes exit 0**:

- Infra: `runners.mjs`, `vector.mjs`, `supabase-rpc-parse.mjs`, `no-leak.mjs`.
- Backend: `external-request.mjs` (13/13), `sdk-http.mjs` (15/15), `compat-security.mjs`, `compat-database-security.mjs`, `data-studio.mjs`, `compat-sync-functional.mjs`, `providers-supabase.mjs`, `system-services.mjs`, `directory-preview.mjs`, `editorial.mjs`, `site-publication.mjs`, `template-preflight.mjs`, `compat-tenant-matrix.mjs` (175/175) and `compat-conformance.mjs --gate` (257 conforming, zero violating/unreachable, 77 verified refusals across 334 operations).

Run each with `node test/<name>` from its package directory; the temporary orchestrator checked each process exit/signal/error separately and was removed after recording results. `node dist/smoke-host.mjs` from `examples/cf-full` exits 0. Regenerated host artifacts: CF 517.6 KiB, Vercel 518.0 KiB, Deno 519.0 KiB gzip; client no-prohibited-symbol and all local host smoke checks pass. Existing chunk/mixed-import warnings remain. This is local artifact/route proof, not actual platform deployment parity.

The behavior gate was not rerun or declared green for this transport increment; its separate fixture/classification repair remains open. Shared conformance source and behavior ledger hashes still match prior evidence (`c87f3688a80711831625b16294e77eead120c04c79a678d9e1c638806beb18a5` and `6f5cc3f7640a3408a2e0f4de6b20558e172a03042d7ee7340f3ae33db1f744bc`). No ledger refresh or acceptance waiver occurred.

## Open work and handoff

- Neon HTTP/global SDK injection policy and the five edge-database postgres callers remain open. Native Postgres/Hyperdrive and standalone operator DataProvider factories have independent deployment boundaries; no full transport inventory closure is claimed.
- URL-string/private-literal protection does not resolve DNS or certify production egress controls. Host-specific resolver/egress acceptance remains separate.
- Other Request-collapsing storage/S3 wrappers are outside this database/vector increment. No universal wrapper repair is claimed.
- D1 REST numeric affected-row shape, honest adapter guarantees and driver acceptance remain part of installer/state-adapter work; existing object-shaped behavior only is exercised here.
- Real Supabase/Turso/D1 credential-gated queries and native/non-Cloudflare deployment acceptance were not run. Canonical content, storage objects, credentials, saved layouts, publication/activation, deployed services and release state were not changed.
- Namespace/install, truthful behavior, distributable type remedy, full migration/editorial/media, catalog scale, inquiry persistence/delivery, reuse, backups/restore and cutover remain M1–M9/R1–R4 gates.

Primary has released this increment's source/build/mutation lock after restoring all sources and completing cumulative runtime gates. Separate session may claim a distinct build slot against the final restored baseline; any candidate report still needs independent primary review. Next primary task: review the separate session's behavior/type/data evidence as it arrives, and define a safe Neon transport policy without per-request global mutation. No commit/push is implied; existing unrelated/parallel changes and bytecode are preserved.

Final documentation/source checks: 225 local report/governance links resolve, both new JS syntax checks and whitespace pass. Mutation source hashes match the receipt; shared verifier/behavior ledger hashes match their preceding baseline. Temporary SDK orchestration/result helpers were removed; unrelated and parallel work remains preserved.
