# R1 upstream declaration repair candidate

**2026-10-09; external candidate/proposal only. No production dependency or package-maintenance decision adopted.** Primary requested a follow-up to the [backend compatibility matrix](PUBLIC-RELEASE-R1-BACKEND-COMPAT-EXPERIMENT.md). This does not change the strict failures measured for unpatched immutable archives or certify backend consumability.

## Reviewable patch taxonomy

The candidate copies the installed Drizzle0.36.4 package into a new independent temporary directory before changing anything. Existing consumer directories, pnpm store files and six Frontbase archives remain untouched. The exact patch is reproducible with `pnpm exec node scripts/release-backend-compat-experiment.mjs C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-consumer-bssJsT --repair-candidate`. Dependencies install offline with lifecycle scripts disabled; no consumer ambient declaration, ignore directive, replacement any type, compiler waiver or runtime upgrade is used.

Eight ESM declaration files and their eight corresponding CJS declaration files change:

| Files, each .d.ts and .d.cts | Repair | Runtime/source basis |
|---|---|---|
| pg-core/query-builders/query | Import existing SQL type and declare getSQL():SQL | Actual PgRelationalQuery method exists in JavaScript |
| sqlite-core/query-builders/query | Import existing SQL type and declare getSQL():SQL | Actual SQLiteRelationalQuery method exists in JavaScript |
| mysql-core/query-builders/delete | Declare getSQL():SQL | Actual MySqlDeleteBase method exists in JavaScript |
| mysql-core/query-builders/select | Declare getSQL():SQL on the base | Actual base method exists; inherited abstract contract now has its implementation declaration |
| sqlite-core/query-builders/select | Declare getSQL():SQL on the base | Same inherited implementation evidence |
| mysql-core/query-builders/select.types | Remove only session from MySqlSetOperatorExcludedMethods | The field is internal/nonpublic in emitted class declarations; public excluded methods remain |
| sqlite-core/query-builders/select.types | Remove only config from SQLiteSetOperatorExcludedMethods | The field is internal/nonpublic in emitted class declarations; public excluded methods remain |
| pg-core/roles | Declare createDb/createRole/inherit as optional booleans | Actual constructor assigns these existing fields from the typed configuration |

This keeps the original generic constraints rather than broadening them to arbitrary strings. It does not expose internal config/session fields, erase schema generics, delete real public method exclusions or replace SQL identity with a structural placeholder. Restoring internal-key names into visible public declarations would unnecessarily broaden the public surface; the candidate instead removes those impossible omission keys from the aliases.

Every copied package file is hashed before and after patching. Exactly16 declaration files differ; all JavaScript, CJS, source maps, package metadata and other bytes remain identical. `declaration-patches.json` retains full original/updated declaration contents and individual hashes for review; evidence.json retains the complete file hash inventories. This establishes unchanged runtime bytes, not independent behavioral correctness of all upstream runtime methods.

## Candidate evidence

Initial successful repaired candidate: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-backend-compat-39fkSI/evidence.json`. NodeNext, Bundler and upstream-only strict profiles exit0 with zero diagnostics using TypeScript6.0.3 and @types/node26.1.1, skipLibCheck:false and actual mysql2 3.24.5. All23 public imports succeed;26 exported table metadata agrees with the unpatched baseline digest `c681a859e59286b2562608ffd1012bb5302c45f8ffe10c0da3fd855eefc90217`. All16 changed files and unchanged runtime file inventories are recorded. Candidate dependency uses an explicit file override to its independently copied package; it retains upstream name/version for local comparison only and is not a publishable adopted identity.

Final expanded evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-backend-compat-NzzUFn/evidence.json`, offline diagnostic exit0. The candidate with actual mysql2 passes NodeNext/Bundler/upstream-only strict profiles with zero errors, including real SQL assignment and invalid string refusal, numeric column refusal, static where repetition refusal and union's public where exclusion. Both standalone upstream builders and the real exported Frontbase schema receive those model checks. Runtime queries return actual SQL instances and compile to strings without a database. Both consumers import23 entries and retain the26-table baseline metadata digest; source archive hashes remain unchanged and dependency links stay within each consumer.

The final no-driver control reports one diagnostic and exit2 in each strict profile: missing mysql2/promise. Runtime imports/query construction still pass. Installing real mysql2 is required for this graph to become type-complete; it is not evidence that Frontbase begins using MySQL at runtime. This inherited unrelated-driver coupling must be represented honestly in any selected distributable dependency graph.

An independent native PowerShell Get-FileHash comparison of every original installed Drizzle package file against the candidate's before-copy inventory found zero mismatches after testing. The original package is unchanged as well as the archives. Final diagnostic-tool syntax and repository whitespace checks exit0. No workspace build is run by this bounded experiment; primary retains integrated verification ownership.

Three early harness runs failed before consumer tests: resolving drizzle-orm directly from the root consumer when it was transitive; omitting recursive copy for an independent package directory (`S33QgF`); and assuming private-key literals occurred directly in select methods instead of the shared exclusion aliases (`xnbGSV`). Corrected lookup uses backend's actual pnpm dependency graph; recursive copying creates independent files; unique patch anchors target the aliases. Those failed runs do not establish a candidate result or alter original installed packages.

## Packaging and maintenance proposal

Prefer an upstream accepted repair and a verified release containing it. Otherwise, primary must explicitly decide whether Frontbase maintains a dependency patch/fork, how it receives security/upstream updates, and how an external consumer gets the same corrected graph. A repository-level pnpm patchedDependencies entry alone does not prove arbitrary external consumers install the repair. Evaluate an immutable distributable identity/alias or a verified bundled dependency path, with clean installation and mixed-Drizzle caller identity tests. No such packaging path is validated by this copied-package test; original-name/version local file overrides must never masquerade as released upstream0.36.4.

The installed manifest declares Apache-2.0, while its published root has no LICENSE file. The [official repository's current license](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/LICENSE) is Apache2; attempted0.36.4/v0.36.4 historical license URLs were unavailable through the browser. Before any redistribution, pin the actual source revision/license/attribution, retain upstream notices and add changed-file notices as required by that license. This is a delivery prerequisite, not a completed legal/provenance acceptance or an instruction to publish a fork.

After a maintenance/packaging decision: independently reproduce this candidate, verify upstream/public type compatibility beyond these models, test supported TypeScript/ESM/CJS callers including callers bringing their own Drizzle version, establish the real driver dependency graph, rebuild/repack and repeat complete external and backend/store/migration/security/host gates. Lifecycle/full CMS and intended-host evidence remain open. No production source/schema/exports/dependency/lockfile, package publication, deployment, canonical state, provider action or CF-22 scope changes occur here. Primary owns integration and final acceptance; no commit/push is performed by this agent.
