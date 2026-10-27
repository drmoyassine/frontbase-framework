# R1 backend dependency/type compatibility experiment

**2026-10-09; bounded diagnostic, no dependency or public API remedy adopted.** Owner-authorized parallel work after `d3cd122`, claimed by the primary in the [release audit](PUBLIC-RELEASE-AUDIT.md). This extends the [binding repair](PUBLIC-RELEASE-R1-BINDING-TYPES.md) and preserves the existing schema exports, six packages and strict declaration gate. Backend consumability remains blocked.

**Subsequent external candidate:** [Declaration repair proposal](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md) records a separately labeled copied dependency with16 declaration files changed and all runtime bytes retained. With actual mysql2 it passes the strict model/import profiles; without that driver it retains one missing-module error. This does not alter the unpatched archive measurements below or adopt a distributable maintenance remedy.

## Reproduction and boundaries

Run `pnpm exec node scripts/release-backend-compat-experiment.mjs C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-consumer-bssJsT --online` initially, then omit `--online` for an offline repeat after the exact dependencies are cached. The source must be a retained successful six-tarball proof. The script verifies its immutable archive hashes, creates three separate external consumers, uses explicit local archive overrides, disables all lifecycle scripts and checks dependency links stay within each consumer. It changes only each invented consumer's dependency graph. No repository lockfile/dependency/schema/handler edit, workspace build, package repack, declaration shim, skipLibCheck waiver, live provider, publication or deployment occurs.

Each consumer uses TypeScript6.0.3, @types/node26.1.1, strict checking, skipLibCheck:false and the same23 public entries. Both NodeNext and Bundler resolution are measured. Positive/negative schema-model assignments retain numeric version data and required tenantSlug. The upstream-only control imports just Drizzle's SQLite schema builders and requires a numeric inferred row. Runtime checks import all23 entries and inspect all26 exported Drizzle table objects using the matching dependency's getTableConfig. The metadata comparison includes table/column names, datatype/column type, nullability and defaults. It is a bounded schema metadata test, not an ORM query/migration/DDL or exhaustive public API compatibility proof.

Registry metadata reads `pnpm view drizzle-orm version` and `pnpm view mysql2 version` returned0.45.4 and3.24.5. They identify the exact experiment candidates as measured on this date, not a version adoption or claim that later versions cannot improve the situation.

## Measured matrix

Initial online evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-backend-compat-Z1vjyl/evidence.json`. All installs and runtime commands exit0; each strict tsc command exits2. The diagnostic command itself exits0 when experiments complete successfully even if tsc rejects declarations; it is **not a release gate**. Full stdout/stderr and exact commands are retained.

| Consumer graph | NodeNext errors | Bundler errors | Upstream-only errors | Runtime entries | Exported tables |
|---|---:|---:|---:|---:|---:|
| Current Drizzle0.36.4 | 19 | 19 | 19 | 23 | 26 |
| Drizzle0.36.4 plus actual mysql2 3.24.5 | 18 | 18 | 18 | 23 | 26 |
| Candidate Drizzle0.45.4 plus mysql2 3.24.5 | 65 | 65 | 65 | 23 | 26 |

All three table-metadata digests match: `c681a859e59286b2562608ffd1012bb5302c45f8ffe10c0da3fd855eefc90217`. Runtime importability/metadata agreement cannot turn the failing declaration profiles GREEN. The existing [TypeScript5.9.3 comparison](PUBLIC-RELEASE-R1-BINDING-TYPES.md) also reports19 current-backend diagnostics, so a simple compiler downgrade is unsupported by the tested evidence.

Final offline repeat: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-backend-compat-Unk4vk/evidence.json`, diagnostic exit0. Three installs and three runtime probes exit0; nine strict declaration probes exit2, with the counts above. All diagnostic positions are in installed drizzle-orm declarations; none are in the generated model tests or Frontbase declarations. The upstream-only graph reproduces exactly the same errors without importing Frontbase. Exact installed versions, no escaped links, metadata agreement and before/after archive SHA256 agreement are verified. Source archives include backend `4f254f03657ecaf0990c0332a241436960bd94dc401072c3b5a3a5bddfa28a41` and infrastructure `714e01bf6ef803144122efd546809b2dd6f36ab3c5651375096cefa96389e99a`; all six identities are retained in the evidence. No declaration or runtime package content is patched in either experiment.

`pnpm exec node --check scripts/release-backend-compat-experiment.mjs` and repository whitespace checks exit0. No workspace build or backend suite was rerun by this agent because its assigned changes are only the isolated experiment tool/document; primary retains integrated verification ownership. A final tool guard explicitly treats nonzero runtime exits as diagnostic failures; all recorded runtime exits are zero.

## What the failures establish

1. **Missing optional driver:** installing real mysql2 removes exactly one missing mysql2/promise error. Eighteen structural/generic declaration errors remain. Requiring a MySQL driver from every SQLite-only adopter adds unrelated dependency burden and does not solve this gate.
2. **Resolution is insufficient:** NodeNext and Bundler give the same counts for each graph. Changing the public consumer resolution mode alone is not a demonstrated fix.
3. **Published upstream declarations omit runtime members:** in0.36.4, SQLiteRelationalQuery's emitted declaration implements SQLWrapper but lacks getSQL; the installed JavaScript contains that method marked `@internal`. PgRole's declaration implements PgRoleConfig without its optional properties; JavaScript assigns createDb/createRole/inherit and marks their fields internal. Select builders constrain omission keys against public keyof while including private/protected config/session keys. These are direct installed-source observations; the inference is that declaration emission/visibility is a material cause, rather than a missing Frontbase implementation. No declaration changes were made to verify a repaired graph.
4. **Broad upgrade is not a narrow remedy:**0.45.4 still has SQLWrapper/member and generic errors and additionally exposes gel/singlestore declaration failures and missing gel dependencies. Its successful bounded runtime/metadata check does not prove migration or host compatibility. Do not adopt this upgrade merely for freshness.

## Ranked next action

1. **Investigate a reproducible upstream declaration repair while preserving runtime bytes and Frontbase's schema contract.** Prefer a verified upstream release/build that emits consistent declarations. If unavailable, explicitly evaluate a maintained, licensed dependency patch/fork with a reviewable patch, immutable package identity, unchanged JavaScript hashes, strict external model tests and repeatable installation. This is a proposal requiring the primary's architectural/maintenance acceptance, not an implemented candidate or permission to edit installed consumer declarations. Consumer-applied shims, untyped export replacement and skipLibCheck are excluded. The upstream-only control provides the starting reproducer.
2. **Treat driver reachability as packaging work within that repair.** Determine whether the corrected graph still imports an unrelated MySQL driver and whether supported type-only imports can remove that coupling without narrowing public Drizzle schema identity. A real required driver must be declared accurately; installing all optional drivers is not a substitute for type correctness.
3. **After a selected remedy, rebuild/repack and repeat complete consumption evidence.** Re-run23 exports, strict Node/Cloudflare profiles, inferred select/insert models, all schema metadata, actual backend/store/migration/security gates and supported host builds. Compare public contracts before accepting a dependency change. This diagnostic cannot certify that unimplemented remedy.

Backend strict declaration acceptance, lifecycle/full-CMS clean-room and intended-host evidence stay open. R2's separate behavior gate and pilot installer/inquiry/migration/reuse backlogs are not addressed. CF-22 remains paused. Only this additive script and delivery document are owned by this parallel task; primary owns shared document reconciliation, review and integration. No commit/push is performed here.
