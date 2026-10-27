# WordPress pilot: parallel session Wave 1 progress

Updated 2026-10-10. Owned by the separate parallel session; claimed in
[PUBLIC-RELEASE-AUDIT.md](../history/PUBLIC-RELEASE-AUDIT.md) (2026-10-10 parallel-session
Wave 1 packet claim). Assignments come from the
[two-session packet](wordpress-pilot-two-session-waves.md); primary acceptance governs.
Baseline: branch `codex/wordpress-pilot`, HEAD `d3cd122`, with primary's uncommitted
foundations and its concurrently claimed SDK threading increment preserved untouched.

## Shared-worktree protocol in force

- Primary is the exclusive build/mutation owner. This session performs source-level
  checks only and requests a build slot before any dist-consuming rerun. Any
  dist-based candidate run is preliminary, records compiled-file hashes, and requires
  primary's integrated rerun.
- No git add/commit/stash/checkout/restore/reset by this session; read-only status/log
  checks only. No ledger, shared verifier/harness, test-registration, manifest,
  lockfile, or generated-host (`examples/cf-full/api/cms.mjs`) edits.
- No live data writes, uploads, publication, deployment, dependency adoption,
  commit/push, or later-wave (Wave 2–5) shared-surface work.
- Fresh Supabase/storage access is not assumed available; when absent, reports state
  snapshot age and exact missing access rather than presenting dated counts as fresh.

## Lane status

| Lane | Owned files | Status | Report |
| --- | --- | --- | --- |
| P1-A fresh coverage/conversion evidence | `scripts/wordpress-audit/` source/tests/fixtures (excluding `__pycache__/` bytecode and private source exports) | Delivered; primary's five corrections applied 2026-10-10; awaiting primary re-review | [wordpress-pilot-parallel-wave1-data.md](wordpress-pilot-parallel-wave1-data.md) |
| P1-B isolated behavior candidate | new `packages/backend/test/parallel-wave1-behavior*.mjs` only | Delivered; rev 2 refusal correction applied + coordinator-reproduced 2026-10-10; PRELIMINARY pending fresh primary rerun | [wordpress-pilot-parallel-wave1-behavior.md](wordpress-pilot-parallel-wave1-behavior.md) |
| P1-C external type/dependency experiment | new `scripts/parallel-wave1-types*.mjs`, `scripts/parallel-wave1-types/` fixtures | Delivered; provenance-wording correction applied 2026-10-10; primary offline reproduction recorded | [wordpress-pilot-parallel-wave1-types.md](wordpress-pilot-parallel-wave1-types.md) |
| Coordinator review | this file; audit claim | Open | — |

Build slot requests: none yet. P1-B's candidate is dist-consuming; its first run is
permitted only with a stability check on `packages/backend/dist` (no concurrent
primary build in progress), recorded compiled hashes, and an explicit preliminary
marking. Mutations are never run by this session.

## Coordinator review findings

Each delivery receives an independent review here before any integration request:
owned-path diff inspection, rerun of cheap commands, out-of-scope edit detection via
`git status`, and correctness of honest-refusal/expectation claims against the cited
evidence documents. Corrections are listed per lane with the exact requested change;
residual risks and dependencies on primary's unfinished work are stated explicitly.
No lane is declared complete from worker test totals.

### P1-A — reviewed 2026-10-10, accepted with notes (not primary acceptance)

Independently verified: owned-path diff is exactly `scripts/wordpress-audit/test_audit.py`
(+27 lines: one test plus one import) and the report file; no out-of-scope edits.
Coordinator reran `python -m unittest test_audit` — **39/39 OK** (baseline was 38/38).
The new `test_repeat_run_into_same_output_directory_does_not_duplicate` genuinely uses
`hashlib.sha256` per-file digests (a transient mid-edit "unused import" diagnostic is
stale; lines 22–23 `ModuleSpec` diagnostics are pre-existing importlib code outside the
diff). Fixture `country_id` is 5, so the fixture CLI run with `--country-id 5` is
coherent; the real-run invocation (`--country-id 22`) remains correctly documented for
when protected inputs reappear.

Acceptance-relevant notes for primary:
1. **Fresh pilot evidence is genuinely unavailable**: the protected
   `garage-deployment/ac-reconciliation-2026-10-07/` input tree was not found anywhere
   on this machine (bounded read-only search; three recorded SHA-256 digests could not
   be verified because nothing exists to hash). All pilot counts in the report are
   dated 2026-10-07 historical evidence, never fresh. This packet therefore does not
   satisfy a fresh M3 digest by itself; it delivers verified tooling, honest
   snapshot-age marking, and the four required test properties.
2. **Test-suite delta is additive and disclosed**: 38 → 39; the new test covers the
   same-directory repeat-run (refresh) workflow. The test's own initial failure
   (unsorted expected-file list) was fixed before delivery and disclosed.
3. **`__pycache__/test_audit.cpython-311.pyc` regenerated** by mandated suite runs
   (untracked bytecode; disclosed; no manual bytecode action). Bytecode stays excluded
   from any future checkpoint.
4. **Editorial-path counts**: report correctly distinguishes the non-comparable
   61-path route-normalized scan from the older 151-occurrence editorial-only report.

No corrections requested for this lane. Dependency on primary: none — but the
next executable task (fresh digest run) requires the protected input tree or
explicitly authorized read-only Supabase/storage access, which this session does not
hold.

**Correction status (2026-10-10, post primary review):** primary's five required
report corrections are applied to [the report](wordpress-pilot-parallel-wave1-data.md)
and supersede review note 1 above — primary located all three protected inputs under
`C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6/`;
this coordinator independently re-verified all three SHA-256 digests, ran the CLI
(`--country-id 22 --self-check`) into a new private out-of-Git directory
(`garage-deployment/parallel-wave1-data-2026-10-10/`), and obtained **byte-identical**
five-file output against both the historical `ledger-reviewed/` artifacts and primary's
same-day replay (report §3.1 records the common hashes). ELS 852 restored as an
owner-confirmed completed fact (harmonization header); path-unresolved records kept
disjoint from the 966 `missing`; the delivered guarantee renamed repeat *generation*
(repeat *import* unclaimed and unimplemented); access statements scoped to the
allocation. Reproduced counts remain 2026-10-07 snapshot values, not fresh data.
Awaiting primary re-review of the corrected report.

### P1-B — reviewed 2026-10-10, accepted with notes (PRELIMINARY; not primary acceptance)

Independently verified beyond the worker's own run:
1. **Shared surfaces untouched**: `contracts/behavior.ledger.json` SHA-256
   `6f5cc3f7640a…744bc` and `compat-conformance.mjs` `c87f3688…8a5` both match the
   2026-10-09 baseline recorded in the isolation evidence — byte-identical before and
   after all runs. `git status` shows only the two owned `.mjs` files plus the report
   as this packet's artifacts.
2. **Source integrity spot-check**: the candidate writes only into its OS-temp
   evidence directory; the behavior ledger is hashed (before/after, with an internal
   `ledger-integrity` detector) and never imported; its classifier is self-contained
   (`compat-conformance.mjs` is only hashed, never imported or called); offline
   enforcement is doubled (denying injected `externalFetch` + module-load
   `globalThis.fetch` guard with `offline-guard` detectors). Both files pass
   `node --check`.
3. **Coordinator reproduction (this session, Node v26.7.0, dist current —
   `srcNewerThanDist: []`)**: candidate rerun `passed: true` with zero failures —
   11 operations, identical outcomes across forward/reverse/mulberry32 seeds 1–2,
   five counterfactual flips, cross-owner isolation, 4 injected-transport denials
   correctly attributed per order, 0 global-fetch attempts. Negative harness rerun:
   control EXPECTED-COMPLETE; empty-fixtures 32, starved-reads 28, shared-state 4
   (including one honest `fixture-failure` kept in the denominator),
   success-false-as-success 8 — every degraded mode tripped exactly its intended
   detector, `allExpectedFailuresFired: true`. Coordinator evidence dirs:
   `…\Temp\frontbase-p1b-behavior-none-0Se6nU`, `…\Temp\frontbase-p1b-behavior-negative-RjxFAy`.
4. **Review observation**: the success-false-as-success mode is the sharpest
   demonstration — with 2xx blindly treated as success, every positive operation
   stays "functional" and only the refusal invariant catches the misclassified
   vector test-connection. This is precisely the envelope-shape classification hazard
   the repair plan describes for the existing probe.

Acceptance-relevant notes for primary:
1. All results remain **PRELIMINARY** until primary reruns both commands under its
   exclusive build lock; the candidate self-blocks (`exit 2`) on unstable dist.
2. Coverage is 11 of ~334 probe operations (listed in the report); no
   generalization to the rest of the inventory is claimed.
3. Instrumentation seam flagged honestly: `datasource-search-all` records 0 SQL
   observations because it runs through its own `datasourceRunner` outside the
   tracing wrapper — a shared-harness integration decision (trace-through vs
   per-runner tracing).
4. The worker disclosed two earlier failed iterations (wrong edge-infra dist path in
   preflight; a predicate reading `m.id` against the handler's actual
   `row_id`/`record.id` shape) — the final predicate targets the handler's real
   evidence and the attempt-attribution bug (cumulative vs per-operation slices) was
   fixed; disclosed, not hidden.
5. Dependency on primary's unfinished work: none for this packet, but the
   auth-primary positive fixture exercises the accepted column-based repair in the
   current compiled route; if primary's in-flight SDK threading changes any of the
   12 consumed compiled entries, the lock-gated rerun must land after that lands.

No corrections requested for this lane.

**Rev 2 (2026-10-10, post primary review):** primary's required refusal correction is
applied and coordinator-reproduced. Source review of the rev-2 predicates: both now
assert the routes' documented refusal evidence component-by-component with per-operation
attempt attribution (pre-request length slices) — reset-role-password: exact HTTP 400 +
credential marker + zero injected/global attempts; vector-test-connection: exact HTTP 200
`success:false` + offline-guard marker + exactly 1 injected `GET https://p1b.invalid/vector`
+ zero raw/global + no round trip; anything else classifies `unexpected-response`.
New negative modes (e) wrong-route and (f) server-error each trip
`[p1b-detector:refusal-evidence]` 8 times (2 ops × 4 orders) — my rerun shows the app's
real unrelated 404 and a labelled 500 both rejected, closing exactly the hole primary
identified. Coordinator reruns both exit 0: candidate
`…\Temp\frontbase-p1b-behavior-none-PLZp4U`, negative
`…\Temp\frontbase-p1b-behavior-negative-dfi5Jh` (7/7 modes correct,
`allExpectedFailuresFired: true`); ledger and probe hashes byte-identical before/after
(re-verified). All results remain PRELIMINARY: primary's earlier pass predates rev 2, so
a fresh primary rerun under its exclusive build lock is required for acceptance.

### P1-C — reviewed 2026-10-10, accepted with notes (not primary acceptance)

Independently verified structurally:
1. **Repo boundaries intact**: driver passes `node --check`; the only `package.json`
   write targets `join(output, scenario.key)` inside a `mkdtempSync` workspace
   validated under the OS temp root — repo manifests/lockfile untouched
   (`packages/backend/package.json`'s dirty state predates this session and belongs
   to primary). The five fixtures are purely synthetic model code (no private hosts,
   project refs, or credentials). `git status` shows only the driver, fixtures
   directory, and report as this packet's artifacts.
2. **Read-only reuse of primary's evidence** is correctly bounded: the driver
   auto-discovers the retained proof consumer and re-verifies all six archive
   SHA-256s before/after every run; `scripts/release-backend-compat-experiment.mjs`
   was never modified.
3. **Report honesty checks out**: two early failures are disclosed with fixes
   (MSYS tar `C:` misread → System32 bsdtar; explainFiles parser quote-style gap),
   the first online run is marked as lacking byte-comparisons, and the offline
   provenance step self-skips with a recorded reason rather than fabricating values.

**Coordinator matrix reproduction not completed**: I launched an independent offline
rerun (`frontbase-p1c-review` temp workspace) and the system killed it while idle due
to critically low memory — not a command failure. It left only an empty workspace and
no evidence. The acceptance matrix therefore rests on the worker's three complete
recorded runs (two online, one offline; all exit 0 with nine acceptance checks true).
Primary's own reproduction is the acceptance path regardless. Do not treat this
review as an independent matrix confirmation.

Acceptance-relevant notes for primary:
1. **Decision required, none taken**: the packet recommends upstream accepted repair
   first; otherwise a maintained fork is technically viable with requirements spelled
   out (immutable renamed identity, Apache-2.0 compliance incl. changed-file notices,
   update policy pinned to commit `03f6239c…`, column-builder/mysql2 decoupling,
   clean-install + mixed-caller acceptance). Maintenance/license/distribution choices
   belong to primary/owner; nothing is adopted, forked, or published.
2. **New load-bearing findings**: published 0.36.4 tarball ships **no LICENSE/NOTICE**
   (1850 files inventoried) while the upstream tag's LICENSE is plain Apache-2.0
   (`c71d239d…`), upgrading the prior "URLs unavailable" caveat to a pinned result;
   the mysql2 burden is **type-only** via root `column-builder.d.ts` → `mysql-core`
   import (every dialect charged; runtime never references mysql2 outside
   `drizzle-orm/mysql2/`) — a candidate upstream fix in its own right; compiler/module
   mode is not a lever (19/19/19→18→1→0 invariant across TS 6.0.3/5.9.3 ×
   NodeNext/Bundler); runtime `is()` accepts cross-copy instances (entityKind
   branding) while the type layer rejects them — identity policy must rest on package
   identity/resolution, not runtime discrimination.
3. The unpatched strict failures remain the open R1 gate; this packet changes no
   M1 acceptance and no CF-22 scope.
4. Dependency on primary's unfinished work: none for this packet. If the repair path
   is chosen, the packaging-identity/licensing decision and the external
   clean-install + backend/store/migration/security re-gates need a new allocation.

**Correction status (2026-10-10, post primary review):** primary's required
provenance-wording correction is applied to
[the report](wordpress-pilot-parallel-wave1-types.md): tag `0.36.4` → commit
`03f6239c…` resolution plus byte-identical installed-vs-published bytes identify the
binary input but do **not** prove the artifact was built from that commit; the tag is
retained as a candidate source reference and the registry artifact as the
independently identified binary input (report (a), plus the fork-base pin wording).
Primary's own offline reproduction (all nine acceptance checks true, matrix counts
reproduced) is recorded in its review receipt; the coordinator matrix note above is
superseded in practice — acceptance no longer rests on the worker's runs alone.
Awaiting primary re-review of the corrected report.
