# R1: external public-declaration diagnosis

**2026-10-08; bounded diagnostic complete, package type acceptance remains open.** This extends the [six-tarball runtime/pure-starter proof](PUBLIC-RELEASE-R1-CONSUMER-PROOF.md), using its immutable archives without rebuilding or patching them. Developer Preview preparation is accepted; registry publication and a release are not implied.

**Subsequent repair:** [Self-contained binding interfaces](PUBLIC-RELEASE-R1-BINDING-TYPES.md) pass fresh strict Node/actual Cloudflare assignment checks. The original21-error measurements below remain dated evidence for the original artifacts; current backend/all-package checks retain19 Drizzle errors. No full package acceptance follows.

## Reproduction and measured result

Run `pnpm exec node scripts/release-declaration-diagnostic.mjs <retained consumer-proof directory>`. The source directory must contain a successful evidence.json, archives and consumer manifest. The script verifies every archive SHA256 against that evidence, creates a separate temporary consumer, installs with explicit local overrides and `--offline --ignore-scripts`, and runs TypeScript6.0.3 with strict checking, NodeNext resolution and **skipLibCheck:false**. Node/DOM profiles explicitly declare @types/node26.1.1; the browser profile uses DOM/DOM.Iterable without Node ambient types. No fake Cloudflare ambient types, declaration patches, lifecycle scripts or registry operations are introduced.

Final evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-declarations-pQoDXv/evidence.json`. Overall command exits1 because required profiles fail; individual tsc failures exit2. The original runtime consumer remains untouched. The initial two-profile diagnostic in `frontbase-r1-declarations-PE26DV` gave the same aggregate/browser results; the final run adds package isolation.

| Profile | Public entries | tsc exit | Diagnostics |
|---|---:|---:|---:|
| All packages, Node + DOM | 23 | 2 | 21 |
| Core/UI/builder, browser | 16 | 0 | 0 |
| Compiler, Node + DOM | 5 | 0 | 0 |
| Infrastructure, Node + DOM | 1 | 2 | 2 |
| Backend, Node + DOM | 1 | 2 | 21 |

The browser/compiler results prove declaration loading in these configurations, not every caller pattern, TypeScript version, host or browser bundle safety. All-package runtime imports still pass; runtime importability is distinct from declaration checking.

## Evidence-linked blockers and ordered repair

1. **Close infrastructure's public type graph.** Packed `dist/cache/providers.d.ts` exposes an undeclared global KVNamespace and `dist/providers/runners.d.ts` exposes D1Database. The source-only ambient definitions in `packages/edge-infra/src/types/shims.d.ts` let the workspace build pass but do not make those public declarations self-contained. Define an explicit supported binding contract or an explicit host-type dependency/subpath; prove a Node consumer can import the package and actual Cloudflare bindings remain assignable. Do not copy permissive ambient shims into consumers or disable library checking to claim closure. This is a packaging repair proposal, not an accepted API redesign.
2. **Resolve backend's reachable Drizzle declarations.** Backend publicly exports the Drizzle schema and ConsoleStore's schema values. The installed drizzle-orm0.36.4 declaration graph reports missing mysql2/promise plus SQLWrapper/getSQL and generic-constraint errors across MySQL/Postgres/SQLite declarations under TypeScript6.0.3. Installing an unrelated driver alone cannot address those class/generic errors. Establish a tested dependency/compiler compatibility remedy and preserve the existing schema/public contracts; no broad ORM upgrade or export removal is adopted by this diagnostic. Backend also inherits the two infrastructure errors.
3. **Repeat immutable external proofs after repair.** Pack fresh artifacts, record hashes, rerun all declared entries in the five profiles, runtime imports and standalone starter tests. Independently test supported host/caller configurations. Do not rewrite these failed artifact measurements as results for new archives.
4. **Complete remaining R1 evidence.** Dependency lifecycle acceptance, versioned full CMS/first-admin/authoring/publishing/upgrade clean-room path and supported-host deployment/recovery remain open. Local overrides still substitute unpublished internal versions and are not registry evidence.

The [R2 response gate](PUBLIC-RELEASE-R2-CONFORMANCE-DIAGNOSIS.md) passes, but its separate behavior gate remains a failure with unchanged expectations. Behavior fixture isolation/counterfactual review is a parallel release blocker, not solved by type repairs. The [release strategy](PUBLIC-RELEASE-STRATEGY.md) still requires clean verification, operations/security acceptance and owner-approved release operations. Pilot installer namespace/recovery, inquiry production wiring, real migration and a second-country reuse proof retain their own backlog; CF-22 remains paused.

All diagnostic data is invented local consumer state. Existing source, archives, canonical records, connected accounts, storage, private layouts, publication and deployments are untouched. New diagnostic tooling and synchronized evidence remain uncommitted alongside earlier preserved changes.
