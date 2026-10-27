# R2: response conformance fixtures and remaining behavior evidence

**2026-10-08; bounded fixture correction verified locally, uncommitted.** Follows accepted Developer Preview scope and [R1 consumption proof](PUBLIC-RELEASE-R1-CONSUMER-PROOF.md). This changes the probe's success preconditions, not production handlers, schemas, authorization, SSRF, refusal classifications or pass thresholds. CF-22 visual work remains paused. Full security/behavior/clean-room release acceptance is still open.

## Nine previously unreachable operations

The original verbose strict gate returned exit1:248 conforming, zero violating, nine unreachable,77 verified refusals across334 operations. Source inspection confirmed intentional safeguards prevented the generated requests from reaching success paths:

| Operations | Failed precondition | Corrected synthetic fixture |
|---|---|---|
| Cache, queue and vector resource test (3) | Resource creation reused the same URL and received409 | Unique URL path for each invented service resource; existing externalFetch stub unchanged |
| Bucket GET/PUT/DELETE/empty (4) | Bucket creation referenced an absent provider and received404 | Create a synthetic connected account, owner-local provider and bucket through actual API routes; pass that provider ID to the operation |
| Datasource search-all (1) | Missing nonempty search/matching data returned404 | Real temporary SQLite datasource with a searchable row and explicit matching query |
| Datasource test-raw (1) | Synthesized invalid kind/config reached the intentional unexpected-error500 path | Explicit SQLite kind and temporary connection URL |

**Corrected strict gate: exit0,257 conforming, zero violating, zero unreachable,77 verified refusals.** The same334-operation contract and577-case/76-differing differential refusal evidence remain. This does not imply every operation is functionally complete or a real upstream provider was tested.

`test/conformance-fixture-mutation.mjs`, registered as backend `test:conformance-fixtures`, proves the real strict gate fails when unique URL, provider binding, valid connection or nonempty query preconditions regress. Four faults return exit1 with unreachable operations; the original fixture is restored and the strict GREEN baseline runs after each fault and finally. Source SHA256 matches. This mutates test fixtures only, so no production compilation substitution is needed between faults. No failure is reclassified as success.

## Behavior gate remains a failure

`compat-conformance.mjs --gate --behavior --behavior-gate` returns **exit1**. Current classification is270 functional,47 shape-only,17 external-disabled. These are the existing probe's observations, distinct from response-schema conformance; no full feature/behavior-parity claim follows.

An isolated temporary copy of the original HEAD probe was run against current production source with `--behavior --behavior-gate`. It already reports43 drift lines, including a327-vs334 measured-operation mismatch because seven fixture creations threw before classification. The corrected probe reports50 drift lines and classifies all334. Many differences are stale SQL observation counts or existing shape-only/provider-unavailable behavior. New reachable bucket/service/search probes add evidence differences, while introducing populated local-provider state also changes later storage classifications; these require fixture-isolation/counterfactual review. They are not silently accepted into the baseline.

The original strict failure short-circuited before ledger comparison when `--gate` was included; the baseline comparison was therefore rerun without that flag, keeping the original strict failure separately recorded. Temporary baseline test copies were removed. Full logs remain outside Git:

- `C:/Users/drmoy/AppData/Local/Temp/frontbase-r2-behavior-baseline-20261008.log`
- `C:/Users/drmoy/AppData/Local/Temp/frontbase-r2-behavior-current-20261008.log`

The behavior ledger is unchanged. Next review must distinguish changed instrumentation counts, incomplete or order-sensitive fixtures, intended capability refusals and actual functional defects before proposing any baseline update. Do not regenerate the ledger to hide the failure or resume visual parity work.

## Verification and boundaries

Strict response gate passes; fixture mutation4/4 passes with independent restored baselines/source hash. Existing compatibility security/database-security and tenant175/175 pass. Final workspace build and `pnpm -r check` pass with prior chunk/mixed-import warnings and unchanged CF517.1KiB/Vercel517.6KiB/Deno518.6KiB gzip measurements. Four additive/repaired JS syntax checks and whitespace check pass;107 local links across the four dated release reports and audit resolve. Compiler functional suite/mutation3 and setup/host smoke from the immediately preceding R1 increment remain dated evidence on unchanged production source, not a new full security matrix.

All database/account/provider fixtures are invented local state. External operations use the existing scripted transport; no Supabase bootstrap privilege, real connected account, storage bucket, canonical record, private pilot layout, publication, release package or deployment changed. Existing provider refusal/secret/owner protections remain intact. No broad backend feature sprint, release announcement, clean-checkout certification or real provider acceptance is claimed.

Next executable tasks: behavior probe isolation and evidence review; full public declaration/lifecycle consumption; versioned full CMS clean-room path. Pilot namespace/install/forms/migration work retains its separate backlog. R1/R2 and release operations remain open despite the corrected response gate.
