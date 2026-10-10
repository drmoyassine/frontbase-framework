# R2 behavior isolation and counterfactual diagnosis

**2026-10-09; diagnostic delivery for primary review, uncommitted.** Owner-authorized parallel work follows checkpoint `d3cd12277423e78538527400ba24cfe1c26ce237`. Primary owns shared audit/plans, architectural decisions, repairs and final acceptance. This investigation changes neither the existing conformance probe nor its behavior ledger, handlers, schemas, classifications or thresholds. CF-22 remains paused. See [R2 response-fixture evidence](PUBLIC-RELEASE-R2-CONFORMANCE-DIAGNOSIS.md) and [current audit](PUBLIC-RELEASE-AUDIT.md).

## Reproduce

With the existing backend/infra distribution built:

```powershell
pnpm --filter @frontbase/backend exec node test/behavior-isolation-diagnostic.mjs
```

The additive [diagnostic](../../packages/backend/test/behavior-isolation-diagnostic.mjs) makes temporary uniquely named sibling copies of the existing probe so its package-relative imports and contract resolution remain correct. It changes only iteration order/selection, adds captured real HTTP responses/SQL observations, and inserts bounded synthetic success preconditions. Each run uses a fresh actual SQLite-backed compatibility app. Counterfactual reads use the unchanged probe's read-starvation mechanism. No release expectations are adopted. Exact generated copies are removed in `finally`; source and ledger hashes are checked after each run. Retained logs and `evidence.json` go to an OS temporary directory printed by the command. No `--dump-ledger` is used.

The command exits zero only when the diagnostic assertions complete. Its child behavior-gate processes intentionally exit **1**. Full forward/reverse runs genuinely fail their unchanged ledger; a single-operation run additionally differs from the ledger's 334-operation denominator, so its exit code cannot establish a standalone acceptance gate. Assertions verify actual response status/content for seeded successes, rather than asserting that a returned schema means functionality.

## Reproducible order dependence

| Existing probe iteration | Functional | Shape-only | External-disabled | Ledger differences | Unreachable |
|---|---:|---:|---:|---:|---:|
| Forward | 270 | 47 | 17 | 50 | 0 |
| Reverse | 271 | 47 | 16 | 74 | 0 |

Between these full runs, **36 operation evidence entries differ; 25 also change classification**. Separate per-operation resource IDs do not isolate app-wide settings/provider/default state. The existing comment claiming every result is independent is therefore unsupported. Forward drift comprises 35 unchanged-status evidence changes and 15 status changes. Of those 35, **31 differ only in the SQL observation count** after normalizing the count token. That is a candidate instrumentation-review bucket, not proof that all 31 changes are correct or harmless. Counts must remain recorded until each changed read/write path is reviewed.

## Concrete counterfactuals

| Operation | Existing fresh single-operation fixture | Valid positive fixture / finding |
|---|---|---|
| Storage compute-size | HTTP404 `Storage provider not found`; query `bucket=probe&provider_id=probe`; the existing classifier still calls it functional when settings reads return no rows | Create owned connected account, local provider and bucket; insert a 42-byte file tied to that exact bucket; bind both IDs. HTTP200 returns size42; starving reads changes response. |
| Storage list | Same absent provider404; forward calls it shape-only, isolated calls it functional | Same owned chain and file: HTTP200 returns `sized.txt`, total1; three SQL observations reflected. |
| Delete storage provider | Absent ID `local` returns404; classification changes with prior settings rows | Bind an actually created provider ID: HTTP200 provider removed, persisted effect with two observations. |
| Queue/vector list | Fresh app returns empty200 lists and is called functional; forward after prior operations returns empty200 but is called shape-only | Create a named queue/vector through real API first: list200 includes the seeded name; starvation changes response, five SQL observations. No provider connectivity claim. |
| Agent settings | Default settings appear identical with reads starved once an earlier operation persisted default/empty settings | PUT temperature0.23, then GET returns0.23; starvation changes response and existing classification is functional. Empty/default observations cannot establish a discarded-read defect. |
| Auth primary form | Normal CREATE with config{}, followed by successful PUT set-primary, still yields GET200 `success:false`, `Auth form not found` | Seeding `config.is_primary:true` changes GET to success, demonstrating that stored content matters and exposing the mismatch described below. |
| Project asset upload | Generated `probe.txt` is invalid for default favicon, HTTP400; no storage effect | Change only synthetic filename to allowed `probe.png`: existing handler accepts bytes and persists an asset. This is an extension validation fixture repair, not proof of image-content validation. |
| Database role password reset | HTTP400 `Could not resolve Supabase credentials`, yet classifier calls it functional because it consulted tenant state | Intended missing-capability refusal, not a successful reset; no live credentials or management mutation used. Requires a success fixture or explicit refusal evidence, not a ledger promotion. |
| Redis settings GET | Returns fixed defaults with no state/provider effect, in both fresh and forward runs | Source intentionally ignores stored values for compatibility. This is an intended constant response whose stale functional ledger expectation needs explicit review. |
| Vector connection test | HTTP200 `success:false` after an unconfigured transport attempt; SQL reads produce a functional classification | Success HTTP envelope and SQL activity do not prove connectivity or DDL/upsert/search/delete round trip. Guarded transport issue requires separate review. |

### Confirmed auth-form state inconsistency

`auth-forms.ts` has incompatible paths: PUT set-primary updates the `is_primary` column, whereas GET primary filters `config.is_primary` only. The normal synthetic fixture successfully creates a form and sets its primary column, then GET primary cannot find it. A configuration-seeded primary makes GET succeed, but subsequent normal fixture set-primary clears its column while leaving its config flag true; GET then returns that old form serialized with `is_primary:false`. These are contradictory actual handler responses, not a schema-only assumption.

Recommended bounded fix: establish one authoritative primary selection rule under existing API semantics and keep create/update/set-primary/GET aligned for legacy rows. Add tests for normal create→set-primary→GET, switching primary across two forms, inactive primary, tenant separation, legacy column/config disagreement and malformed stored config. A mutation must break real selection/switching and turn the tests red. **No authority choice or handler repair is made by this diagnostic.**

### Transport boundary needs review

The original probe's `externalFetch` does not cover every provider path. The Turso vector adapter calls `@libsql/client` without that injected fetch implementation; reverse ordering also exposes direct datasource RPC global fetch attempts. Final diagnostic runs replace global fetch with an explicit throwing offline guard and record URLs, while retaining the existing scripted `externalFetch`. Forward counts remain270/47/17 and50 drift with this guard. Thus the prior blanket claim that all external operations use scripted transport is too broad.

An initial diagnostic run inherited the original probe's real global-fetch behavior and observed a failed request to an invented `probe.example` endpoint. It made no real provider/data operation; final retained acceptance evidence uses the offline guard. This is an observed transport seam, not proof of an exploitable SSRF path. Audit adapter fetch injection and existing SSRF policy before proposing a production change; do not suppress attempted calls or label a failed round trip successful.

## Next bounded work

1. Repair the confirmed auth-form primary inconsistency after primary approval of the authoritative stored rule.
2. Repair fixture isolation: per-operation fresh application state or explicit local settings/resource restoration, valid owned provider IDs, nonempty target data, real primary form and allowed upload filename. Record absent/empty fixtures as inconclusive evidence rather than functionally successful effects.
3. Review classification against refusal/success semantics and transport traces. HTTP400/404 plus SQL reads, or HTTP200 with `success:false`, are not proof of intended operation success. Existing classifier is unchanged here; changing it requires separate reviewed negative/counterfactual tests.
4. Review the31 count-only candidates against handler diffs and qualitative writes/reads; only then propose explicit ledger changes. Do not regenerate the ledger to erase failures.
5. Repeat strict conformance, behavior, fault tests and appropriate workspace checks after any approved repair. Full CMS/package/host release gates remain independently open.

## Verification and limits

The diagnostic itself exercises real compiled handlers with invented local state, captures response bodies and SQL, and asserts nonempty success controls. Existing source and ledger remain byte-identical. No workspace build, dependency change, schema migration on the pilot, provider account operation, canonical data, saved layout, publication, activation, deployment, commit or push occurred in this workstream. Shared workspace verification belongs to primary; this delivery does not declare R2 green or release readiness.

Final diagnostic command exits0 after **21 child measurements**, each unchanged behavior gate exit1. All eight seeded positive controls complete: three storage operations, two populated resource lists, nondefault agent settings, configuration-seeded primary and allowed-extension asset upload. Forward/reverse measurements reproduce the table above. Source/ledger hashes match after every run; no generated sibling probe remains. JS syntax and whitespace checks pass. Retained final offline evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r2-isolation-jqzCdO/evidence.json` and sibling per-run logs. Earlier exploratory output is historical only; final evidence includes the global transport guard and fixture request/response captures.

Baseline SHA256: conformance source `c87f3688a80711831625b16294e77eead120c04c79a678d9e1c638806beb18a5`; behavior ledger `6f5cc3f7640a3408a2e0f4de6b20558e172a03042d7ee7340f3ae33db1f744bc`. The retained evidence records compiled app/storage/edge-generic hashes as well, so subsequent rebuilds cannot silently replace the measured baseline. Only the additive diagnostic and this delivery document are owned changes.
