# WordPress pilot parallel Wave 1 — P1-B isolated behavior evidence candidate

**2026-10-10; worker P1-B delivery for primary review. REV 2 — applies primary's required refusal-predicate correction; rev-1 results superseded where noted.** Baseline `codex/wordpress-pilot` HEAD `d3cd122` (dirty tree preserved; no Git mutations performed). This packet delivers a behavior-measurement **candidate** with self-proving failure detection. It is **NOT a passing behavior gate**. The existing behavior ledger was not read for classification, not modified, and not regenerated; the shared verifier, the isolation diagnostic, production routes, test registration, package manifests, and all ledgers are untouched.

## Status: REV 2 RUN COMPLETED against the rebuilt dist (PRELIMINARY pending a fresh primary rerun)

Rev 2 applies primary's required correction (see "Corrected refusal semantics" below): the refusal predicates now assert the **specific documented refusal evidence** (exact status + exact marker + exact transport behavior) instead of "not a successful round trip", and two substitution modes prove an unrelated 404/500 is rejected. Both commands were rerun end-to-end after the correction, against the dist rebuilt by primary's D1 delivery: preflight found dist stable across mtime sampling, no `src` file newer than any consumed `dist` entry, and every compiled-entry SHA-256 identical to the table below — so the rev-2 rerun is directly comparable with the original pass.

**Primary's earlier rerun (evidence `frontbase-p1b-behavior-none-cM11Sv` / `-negative-LompuE`) predates this correction and is superseded; a fresh primary rerun under its exclusive build lock is required.** Until then every result below is **PRELIMINARY**. The candidate still blocks itself with `exit 2` (`blocked-pending-build-slot`) if a future invocation finds dist missing or unstable.

## Owned files (the only repository artifacts of this packet)

- `packages/backend/test/parallel-wave1-behavior-candidate.mjs` — the candidate harness (exports `runCandidate(options)`, `preflightDist()`, `ledgerSha256ForReport()`; main entry guarded for direct execution).
- `packages/backend/test/parallel-wave1-behavior-candidate-negative.mjs` — negative self-test harness.
- `docs/plans/wordpress-pilot-parallel-wave1-behavior.md` — this report.

No transient sibling files were needed; no `parallel-wave1-behavior-tmp-*` files exist.

## Actual commands

```powershell
# from repo root (recorded Node: v26.7.0, win32)
pnpm --filter @frontbase/backend exec node test/parallel-wave1-behavior-candidate.mjs
pnpm --filter @frontbase/backend exec node test/parallel-wave1-behavior-candidate-negative.mjs
```

Evidence JSON (incl. every compiled-entry SHA-256, staleness scan, all per-order measurements, refusal transcripts, and the negative-harness records) went to OS temp directories printed by each command:

- Candidate (final rev-2 pass): `C:\Users\drmoy\AppData\Local\Temp\frontbase-p1b-behavior-none-zwBS5m\evidence-none.json`
- Negative harness (rev 2, seven modes): `C:\Users\drmoy\AppData\Local\Temp\frontbase-p1b-behavior-negative-3pbPfT\negative-selftest.json` (plus per-mode `evidence-<mode>.json`)

Rev-1 evidence directories (`…none-OTWoIg`, `…negative-C1GHAI`) predate the correction and are superseded; they remain in OS temp only as history.

Two earlier candidate iterations failed honestly and are part of the record: one blocked by a wrong edge-infra dist path in the preflight (fixed in the candidate), one failing `datasource-search-all` because the predicate read `m.id` while the handler returns `{row_id, record:{id,...}}` (predicate corrected to the actual response shape — the fix tightened the predicate to the handler's real evidence, it did not loosen anything). An attempt-attribution bug (cumulative instead of per-operation transport-attempt slices) was also found and fixed; the final evidence attributes attempts per operation correctly. After primary's review, rev 2 additionally tightened both refusal predicates and added the two substitution modes described below; the rerun recorded above is the rev-2 evidence.

## Runtime and driver scope

- Exercises **compiled handlers** through `dist/compat/app.js` (same driver class as `behavior-isolation-diagnostic.mjs`), with a fresh in-memory SQLite runner migrated per operation (`migrateUp`), a fresh app instance, fresh `memoryStorageProvider()`, fresh reset-token map, and fresh tracing state per measured operation. Contexts are constructed immediately before fixture preparation and disposed afterward; temp datasource SQLite files are deleted per context (process-exit backstop included).
- One invented owner principal per context (owner A, tenant `_p1b_owner_a`; a UserStore user is seeded per owner with a single cached password hash). Owner B exists only for the explicit cross-owner isolation assertion inside the same app instance.
- **Offline transport, doubly enforced:** the app's `externalFetch` is a recording denier (no scripted success envelopes exist anywhere in this candidate — a "successful" provider check cannot be faked), and `globalThis.fetch` is replaced at module load by a throwing guard that records every attempt. Any raw/global fallback attempt is recorded as an integrity failure (`[p1b-detector:offline-guard]`), never a pass.
- Classification is this candidate's own four-value scheme (`functional`, `refusal-incomplete`, `inconclusive`, plus `fixture-failure`/`integrity-failure` records), recorded per operation next to the observed HTTP code, the operation-specific success predicate, and captured evidence. The existing probe classifier is neither imported nor called; the ledger is only hashed.
- Fixture failures are kept in the denominator as explicit `fixture-failure` measurements — they never disappear.

## Compiled entries consumed (SHA-256 recorded in evidence; all stable during runs)

| Entry | SHA-256 (prefix) |
|---|---|
| `dist/compat/app.js` | `d35893181abe66ac…` |
| `dist/compat/routes/storage.js` | `e414974f033f5f05…` |
| `dist/compat/routes/edge-generic.js` | `4742af41bccf0a41…` |
| `dist/compat/routes/auth-forms.js` | `535027bb4d0fd73d…` |
| `dist/compat/routes/agent-compat.js` | `8ea0a901e1cbfd68…` |
| `dist/compat/routes/project.js` | `9ab874805b1e7324…` |
| `dist/compat/routes/sync.js` | `1cc605e9b20a81ae…` |
| `dist/compat/routes/edge-databases.js` | `f679d5c91780585f…` |
| `dist/db/migrations.js` | `a66a253db1a96232…` |
| `dist/db/users.js` | `229271463f962d7e…` |
| `dist/db/datasource-runner.js` | `69253cdfe1957bce…` |
| `packages/edge-infra/dist/index.js` | `7bfea9ab6157c8a3…` |

Staleness: `srcNewerThanDist: false` for every entry. Full hashes are in the evidence JSON.

## Coverage scope — an 11-operation subset of the probe's 334

`GET /api/storage/compute-size`; `GET /api/storage/list`; `DELETE /api/storage/providers/{provider_id}`; `GET /api/edge-queues/`; `GET /api/edge-vectors/`; `GET /api/agent/settings`; `GET /api/auth-forms/primary/`; `POST /api/project/assets/upload/`; `GET /api/sync/datasources/search-all/`; `POST /api/edge-databases/reset-role-password`; `POST /api/edge-vectors/test-connection`.

The other ~323 operations are out of scope for this packet; nothing here generalizes their classification.

## Results (final pass, all four orders identical)

| Operation | Fixture (nonempty, owned) | Outcome (identical in forward / reverse / seed-1 / seed-2) | Counterfactual (target row removed only) |
|---|---|---|---|
| storage-compute-size | cloudflare account → local provider → bucket via API → 42-byte `storage_files` row bound to that bucket id | HTTP 200, `size` **42**, functional | size 42 → predicate **flips** (provider/account/bucket rows retained) |
| storage-list | same chain | HTTP 200, `total` **1**, named `sized.txt` size 42, functional | named file/total 1 → **flips** |
| storage-delete-provider | owned account + provider | HTTP 200 removal + **persisted effect**: post-delete registry read shows provider gone, functional | n/a (mutation; persistence is the proof) |
| queue-list | queue created through real API | HTTP 200 list contains the seeded **id and name**, functional | n/a (empty lists recorded inconclusive, never functional) |
| vector-list | vector created through real API | HTTP 200 list contains seeded id/name, functional | n/a (as above) |
| agent-settings | PUT nondefault `temperature 0.23` (default 0.7) | GET HTTP 200 returns **0.23**, functional | settings row deleted → GET returns 0.7 → **flips** |
| auth-form-primary | CREATE (config `{}`) → set-primary | GET HTTP 200 `success:true`, `data.id` = chosen, `is_primary:true` (repaired **column-based** rule), functional | chosen row deleted → `success:false` → **flips** |
| project-asset-upload | `probe.png` bytes, `asset_type=favicon` (allowed extension) | HTTP 200 `success:true`, `publicUrl` = `/static/assets/favicon-<hex8>.png` + **persisted** meta row `project_asset:<file>` and chunk row `#0` in tenant settings, functional | n/a (mutation; persistence is the proof) |
| datasource-search-all | real SQLite file row `p1b-search-1` / title 'P1B searchable fixture' + matching `q` | HTTP 200 `matches` contains `row_id` `p1b-search-1` of the seeded datasource, functional | row deleted in the datasource file → HTTP **404** → **flips** |
| edge-db-reset-role-password | intentionally unresolvable `provider_account_id` | **HTTP 400** with `detail` containing exactly `"Could not resolve Supabase credentials"` → **refusal-incomplete**; rev-2 predicate also requires **zero injected and zero global transport attempts** in the measured request (credential resolution fails locally, so no provider call is even attempted, hence no remote DDL) and no round trip — any other status/marker/transport count classifies `unexpected-response` | n/a |
| vector-test-connection | `provider: vectorize`, no CF credentials, no configured transport | **HTTP 200 `success:false`** with `message` containing the injected-denial marker `"P1B offline guard: injected transport denies all external calls"` → **refusal-incomplete**; rev-2 predicate also requires **exactly 1 injected attempt and it is `GET https://p1b.invalid/vector`**, 0 raw/global attempts, no successful round trip, no DDL/upsert/search/delete — anything else classifies `unexpected-response` | n/a |

Cross-owner isolation (same app): owner A's seeded queue is visible to A and absent from B's list (B list length 0); B's primary-form GET returns `success:false`. Recorded as `isolation` in evidence.

Transport integrity across the whole run: **0 global-fetch attempts**, 4 injected-transport denials (1 per vector test-connection order, correctly attributed per operation). No integrity failure fired.

## Order invariance

Forward, reverse, and two mulberry32 shuffles (fixed seeds 1 and 2) produce identical per-operation semantic outcomes (`observedHttpCode`, predicate, classification, normalized detail) for all 11 operations, because each operation runs in its own fresh context. The comparison is asserted, not assumed (`[p1b-detector:order-invariance]`).

## Corrected refusal semantics (rev 2 — supersedes rev-1 predicates)

Primary's review rejected this candidate's original refusal predicates (`!successfulRoundTrip` / `!roundTripSucceeded`, with the classifier accepting any non-2xx status or `success:false` body): an **unrelated** 404 or 500 would have satisfied them, so "expected refusal" evidence could have been produced by the wrong route or a server error. Rev 2 replaces both predicates with the routes' documented expected evidence, asserts every component, and proves the rejection with two substitution modes wired into the negative harness.

**`edge-db-reset-role-password` — accepted as `refusal-incomplete` only if ALL of:**

- HTTP status is exactly **400**;
- `detail` contains the specific credential-resolution marker **"Could not resolve Supabase credentials"**;
- **zero** injected-transport attempts and **zero** global-fetch attempts occur during the measured request (per-operation attribution: attempt arrays are sliced from their pre-request lengths) — credential resolution fails locally, so no credential-dependent provider call is attempted, and no remote DDL can occur.

Anything else — different status, different marker, any transport activity — classifies **`unexpected-response`**, never `refusal-incomplete`.

**`vector-test-connection` — accepted as `refusal-incomplete` only if ALL of:**

- HTTP status is exactly **200** with `success: false` (the documented denied-legacy-probe shape), and the response is **not** a successful round trip;
- `message` contains this candidate's specific injected-denial marker **"P1B offline guard: injected transport denies all external calls"**;
- **exactly 1** injected-transport attempt occurs and it is `GET https://p1b.invalid/vector`; **zero** raw/global attempts;
- no DDL and no upsert/search/delete round trip takes place.

Neither predicate freezes an observed failure as a success expectation: both assert the documented refusal semantics of each route (a local credential-resolution refusal; a denied-transport probe report), and each component is checked independently, so any future behavioral change — different status, different marker, different transport count — fails the predicate rather than being absorbed.

**Substitution proof (new negative modes e/f):** for the two refusal operations only, mode `refusal-wrong-route` rewrites the request path to a nonexistent route (`/api/p1b-substituted-nonexistent/…`) so the operation observes the app's **real unrelated 404**, and mode `refusal-server-error` substitutes a synthetic, clearly-labelled **500** response. In both modes every refusal measurement across all four orders fails via `[p1b-detector:refusal-evidence]` — 8 failures per mode (2 refusal ops × 4 orders), each classified `unexpected-response` (first failure, wrong-route: `expected documented refusal (HTTP 400 "Could not resolve Supabase cre…`, got `unexpected-response`). An unrelated error envelope can no longer stand in for the designated refusal, and that property is self-proving inside the harness rather than asserted in prose.

## Expected failures — negative self-tests (all fired; exit 0; seven modes)

| Degraded mode invoked | Expected detector | Result |
|---|---|---|
| control `none` | must complete | **EXPECTED-COMPLETE** (no failures) |
| (a) `empty-fixtures` — seeding skipped, owner rows kept | `[p1b-detector:positive-outcome]` | **EXPECTED-FAILURE** — 32 failures; storage ops 404, lists empty (recorded inconclusive), settings return default 0.7, primary GET `success:false`, search 404 |
| (b) `starved-reads` — reads return `[]` during measured requests only | `[p1b-detector:positive-outcome]` | **EXPECTED-FAILURE** — 28 failures; 404s where provider resolution reads starved, seeded names absent, default settings, primary unresolved |
| (c) `shared-state` — one shared context, memoized storage chain models the pre-isolation shared-state fault | `[p1b-detector:positive-outcome]` (or order-invariance) | **EXPECTED-FAILURE** — 4 failures; reverse-pass storage ops hit the provider deleted by the earlier delete-provider (404), plus one duplicate-name datasource fixture failure honestly kept in the denominator as `fixture-failure` |
| (d) `success-false-as-success` — 2xx treated as success regardless of refusal semantics | `[p1b-detector:refusal-invariant]` | **EXPECTED-FAILURE** — 8 failures; every positive op stayed silently "functional" and only the refusal invariant caught the misclassified vector test (also flagged by `[p1b-detector:refusal-evidence]`) |
| (e) `refusal-wrong-route` — the refusal ops observe the app's **real unrelated 404** from a nonexistent route | `[p1b-detector:refusal-evidence]` | **EXPECTED-FAILURE** — 8 failures (both refusal ops × 4 orders); every substituted response classified `unexpected-response`, none accepted as the designated refusal |
| (f) `refusal-server-error` — the refusal ops observe a synthetic, clearly-labelled unrelated **500** | `[p1b-detector:refusal-evidence]` | **EXPECTED-FAILURE** — 8 failures (both refusal ops × 4 orders); same rejection as (e) |

Ledger SHA-256 before and after the negative run: `6f5cc3f7640a3408a2e0f4de6b20558e172a03042d7ee7340f3ae33db1f744bc` (unchanged).

## Residual drift notes relative to PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md

- The observed-case outcomes match the isolation doc's positive controls (storage 42/total-1/removal, seeded queue/vector names, 0.23 settings round trip, allowed-extension asset accepted, search hits the intended record).
- The auth-primary GET now succeeds after normal CREATE → set-primary → GET, consistent with the **accepted** primary repair (column-based selection) that postdates the isolation doc's "Auth form not found" observation. This candidate exercises the repaired compiled route; it does not re-litigate the acceptance.
- The vector connection test still returns HTTP 200 `success:false` after a denied transport attempt, and SQL/refusal text matching still cannot prove connectivity — this candidate classifies it refusal-incomplete with captured evidence instead of functional, per repair-plan section 5.
- The reset-role-password refusal reproduces the isolation doc's HTTP 400 with zero transport activity (no resolvable credentials), recorded as refusal/incomplete, never functional.
- Count-token drift (the "31 count-only" bucket) is not exercised here: this candidate does not compare against ledger evidence strings at all.

## Explicit statements

- The existing behavior ledger remains **RED and byte-identical** (`6f5cc3f7640a3408a2e0f4de6b20558e172a03042d7ee7340f3ae33db1f744bc` before and after every run; also asserted inside each run and re-verified with an explicit `sha256sum` after the rev-2 reruns). `compat-conformance.mjs` hash `c87f3688a80711831625b16294e77eead120c04c79a678d9e1c638806beb18a5` unchanged (same explicit after-check). **No ledger regeneration occurred; `--dump-ledger` was not used.**
- This candidate is a **measurement-integrity candidate for primary's shared-harness integration decision** — it is **not a passing behavior gate**, not a CF-22 runner, and does not close any milestone or wave exit. No milestone status was changed.
- No production route, shared verifier, test registration, package manifest, or example file was modified; no builds were run; dist was consumed read-only under a verified-stable, apparently-idle build window.
- No live data writes, uploads, publications, deployments, commits, or pushes occurred. All fixtures are invented local state; no secrets or PII are included.

## Gaps and limits for primary's review

1. **PRELIMINARY pending primary's fresh exclusive-lock rerun** of both commands above. Primary's earlier rerun (evidence `frontbase-p1b-behavior-none-cM11Sv` / `-negative-LompuE`) predates the rev-2 refusal-predicate correction, so its pass does not cover the corrected predicates or the substitution modes and must be repeated.
2. Coverage is 11 of ~334 probe operations; integration into the shared harness would need the operation-context factory generalized to the full inventory (repair plan increment 1), which this packet deliberately did not do.
3. `sqlObservations` for `datasource-search-all` is recorded as 0 because the search runs through its own `datasourceRunner` (a separate runner outside the context wrapper) — an instrumentation seam a shared-harness integration should decide about (trace-through vs. per-runner tracing).
4. The search-all predicate now targets the handler's actual shape (`row_id`/`record.id`); if the shared harness adopts operation-specific predicates, each of the ~334 needs the same response-shape review — this candidate demonstrates the method on 11.
5. Counterfactuals cover five read candidates; the two designated refusals and the two mutation ops are proven by persisted-effect checks rather than row-removal flips.
6. The negative harness runs in-process with the module-level global fetch guard installed; a shared-harness integration that runs probes as child processes should keep an equivalent per-process guard.
