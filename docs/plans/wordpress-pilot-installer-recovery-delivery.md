# B: primary integration and recovery review

**2026-10-08. Bounded integration/design proof verified locally; uncommitted.** Imported twelve Git-tracked files from B `e619199` into the private education-template-proof example, plus a scoped four-workspace-dependency lockfile importer. Preserved T3/E work. No production import route or actual pilot install is introduced.

The artifact boundary now refuses malformed/unknown envelope/page/capability fields, invalid slugs, duplicate node identities, resolved origin/scope and scalar or array excluded content. Layouts are bounded and rebound grammar is checked before mutation. The old internal `skipChecks` option now refuses. Fresh installation refuses existing configuration even if all page slugs are free, and failed destination reads are explicit. The sequential installer is still a synthetic demonstration, not an atomic/recoverable executor.

A new read-only recovery planner requires actual owner-scoped SQL capability facts, exact artifact/binding digest and trusted server receipts. Known partial state plans only missing pages; complete state plans keep/no-op. Uncertain outcomes yield no write tasks. Revision/content/name/publication/deletion/ID changes and unowned collisions stop recovery; equal content is not adopted as evidence of ownership. Receipts and destination facts remain trusted private fixture inputs, not a public request contract.

Upgrade proposals preserve owner-deleted nodes and edited subtrees removed from the newer template. Owner reorder and new-node identity conflicts return unchanged live content for review. Applying a proposal still needs conditional page writes/history and durable recovery; the existing page PUT APIs are not sufficient. The [production contract](wordpress-pilot-installer-recovery-contract.md) records these prerequisites and the core/template boundary.

| Gate | Result |
|---|---|
| Offline filtered frozen-lockfile install | Pass; existing workspace links, no new external dependency/version resolution |
| Final complete example test suite | Artifact, two-destination and 17-group recovery suites pass on final restored source |
| End-to-end synthetic `pnpm --filter @frontbase/example-education-template-proof proof` | Pass: export, two-country install/preview/isolation/refusal, owner-customized upgrade proposal/history; actual guarded publication state remains inactive |
| Recovery mutation/restoration | 8/8 faults RED with independently GREEN recovery suite after each restoration; exact final source hashes match |
| Final restored workspace check/build | Pass, including private example selfcheck; CF512.0KiB gzip, Vercel512.2KiB, Deno513.2KiB; no prohibited client symbols; existing warnings retained |
| Final regenerated host smoke | Pass: byte-identical Vercel stage, Deno/static/SPA/state/boot and no-leak guards |

Corrections: the first file-copy command traversed a dependency directory unexpectedly. Primary stopped only that task process, verified the new workspace-local cleanup path, removed only its copied node_modules and imported tracked files individually. No existing service/worktree changes were removed. Initial stricter validation changed a missing-binding diagnostic and preflight ordering; exact field/capability diagnostics were restored without weakening validation. These failed attempts are not accepted proof.

Windows/Node26.7.0 local evidence only. No real data/layout/configuration, Garage/Supabase, publication/review/activation, deployment or external install was touched. Separate synthetic tests exercise real existing compat routes under fixture principals; they are not full browser/operator proof. Previous T3/E results remain dated evidence. Strict conformance's nine unreachable cases remain historical residue, CF-22 paused, R0 in progress; no GA or production installability claim.

Owned files are the private example including [artifact validator](../../examples/education-template-proof/src/artifact.mjs), [sequential demo](../../examples/education-template-proof/src/install.mjs), [read-only recovery planner](../../examples/education-template-proof/src/recovery-plan.mjs), [focused tests](../../examples/education-template-proof/test/recovery-contract.test.mjs) and mutation harness; lockfile importer and B audit/decision/plan evidence. No six-package runtime ownership or architecture change. Generated api/cms.mjs was refreshed by the final workspace build, alongside the already pending T3 bundle; no remote deploy or local-preview restart was performed.

Next: D inquiry production-contract review, while production B delivery remains open in the ordered [execution plan](wordpress-pilot-execution-plan.md). Owner review of final core/template/consumer packaging, complete migration/SEO coverage, separate-country reuse and operations/cutover gates remain ahead. No new owner input is required for that review. Documentation changed-line whitespace and 223 local targets across 14 files pass, zero missing.
