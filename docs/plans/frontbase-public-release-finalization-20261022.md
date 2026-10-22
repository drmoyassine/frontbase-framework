# Frontbase public release finalization — 2026-10-22

**Edition:** Frontbase Framework Developer Preview. **Status:** release preparation; public distribution is not yet accepted. **Candidate checkpoint:** runtime `b7cb5d9`, generated artifact `e9f3506` on `codex/integrated-finalization-20261022`; retained staging `e1a7b74` awaits this candidate's deployment. This is the current ordered execution plan under the existing [release strategy](../history/PUBLIC-RELEASE-STRATEGY.md), [readiness requirements](../history/RELEASE-READINESS.md) and accepted decisions. It supersedes older next-task ordering, without turning historical receipts into fresh runs or reopening completed work.

## Concrete current findings

**Owner-authorized implementation update:** frontend editing and the first repairs already have native staging acceptance. The subsequent [repair candidate receipt](../reports/frontbase-repair-finalization-20261023.json) records responsive multilingual text editing, actual workflow lifecycle/history/versions, truthful legacy-engine capability refusals, isolated diagnostics, host DNS-pinned HTTP and self-host reset wiring. Full Node22 workspace check/build/test, seven strict archive consumers/starter proof, four invariant334-operation runs,175 identifier-bearing tenant operations and focused functional/fault gates pass. Deployment and native UI/preservation verification are next. The original triage below remains dated evidence, not a claim that repaired defects are still enabled or that a local test proves live acceptance. Public/default-source, registry, real provider/inbox and private-reporting gates remain explicit.

The owner retired CF-22 as an active planning umbrella on2026-10-22. The [source-backed current gap register](frontbase-current-product-gaps-20261022.md) identifies priority repairs: genuinely sealed engine transfer or safe refusal, the Neon HTTP adapter, visual workflow/executor/mail wiring and truthful in-app remote engine deployment. It also separates behavior/transport qualification and public-install/distribution gaps. These are current Frontbase requirements, not an old-product parity target. No fresh runtime acceptance of these findings is claimed by this documentation review.

## Completed and retained

The [bounded acceptance closeout](frontbase-acceptance-closeout-20261022.md) and [sanitized receipt](../reports/frontbase-acceptance-20261022.json) establish:

- The accepted seven library candidates install and typecheck outside the workspace. The backend's pinned declaration-only Drizzle remedy is adopted, licensed and runtime-hash checked. Strict NodeNext/Bundler consumers and the independent starter install/build/test/check pass. Registry consumption remains separate.
- Reusable translated Repeaters, Tables and Grids retain interactive controls and mandatory filters through the existing publication/data contracts.
- Actual Cloudflare and Vercel fresh-state journeys, existing-host upgrades, preserved sessions/configuration/publications and anonymous default-deny have bounded evidence. These receipts distinguish native clones, repaired hosts and managed CLI paths.
- Actual D1 export/reset/import/re-export and Turso HTTP fresh-target restore pass within their documented secret-custody boundaries. The Turso transaction and D1 locale-prefix defects are repaired.
- The captured staging query/credential failures are repaired. The corrected deployment passes 144 requests over 30.6 minutes, twelve concurrent Arabic requests, mixed English/Arabic requests, exact visible-text/link equivalence and native dropdown/locale-navigation checks.

These are completed engineering inputs to a release candidate. They do not establish the full cumulative release matrix, default-main installation, registry publication or independent clean-room documentation acceptance. Do not repeat this entire acceptance stream unless the final candidate changes an affected surface.

## Release boundary

Keep the existing six-package architecture plus its accepted standalone `@frontbase/translation` extension: seven library candidates. Console, hydration and example applications remain distinct artifacts; the monorepo root stays private. Publication must use the supported release packer for the backend, retaining its dependency patch/provenance checks.

Prioritize Cloudflare Workers, Vercel's verified Node runtime and Node/Docker to their certified support levels. Vercel Edge, Deno and every optional provider are not implied by a successful Cloudflare build. A feature may ship as experimental/unsupported only when its public contract and runtime refusal make that limitation truthful; an enabled known-unsafe path cannot be excused by a documentation label.

## Ordered remaining work

| Order | Work package | Exit evidence before moving on |
|---|---|---|
| 1 / P0 | **Finish R2 behavior and security integrity** | The complete operation denominator is retained; isolated forward/reverse/seeded runs produce stable results; meaningful success/refusal/counterfactual assertions replace incidental SQL-count evidence. Every ledger amendment is reviewed. Supported HTTP paths enforce the owner-scoped transport and accurate affected-row semantics. Changed security faults fail independently. |
| 2 / P0 | **Freeze the release candidate and run the cumulative matrix** | Reviewed inclusion list and immutable source/artifact identities; no untracked/private/local dependency; frozen install, full build/check and release functional/console/mutation/conformance/security/host suites pass together on a clean checkout. Final seven-package archives and consumer proofs are attached to that same candidate. |
| 3 / P0 | **Certify the public installation and upgrade paths** | The actual public/default source refs and commands succeed from a fresh environment, including CF and Vercel buttons, documented Node/Docker and versioned starter/full-CMS paths. Setup, data, storage, representative automation, edit/save/preview/publish, upgrade and recovery work without undocumented source repairs. |
| 4 / P0 | **Finish adopter and operations documentation** | A clean-room adopter follows only the public instructions to first publication and an upgrade/recovery exercise. Support/limitations, runtime/tool versions, secrets, migrations, backup/restore, rollback, reset delivery, troubleshooting, security reporting and contribution paths agree with evidence. |
| 5 / P0 | **Prepare versioned distribution and rehearse release/rollback** | Registry/package ownership and names are verified; preview versions and dependency ranges are approved; all seven archives pass provenance/license/no-secret checks and publish dry-runs; tagged-source build and publishing automation are reviewed. Changelog, release notes, compatibility and upgrade guidance exist. Registry installation and rollback rehearsal have explicit outcomes. |
| 6 / release action | **Publish the Developer Preview and verify adoption** | Exact versions/artifacts/registry target are authorized after gates 1–5. Publish, tag and repository release agree; a new external project installs the published versions and completes the supported journey. Record support ownership and follow-up issues. |

Work packages 3–5 may be prepared alongside 1, but final certification must use the frozen candidate from 2. Do not deploy or republish a new candidate merely because a documentation task completed. Re-run affected proofs after an implementation change; retain unchanged accepted receipts.

### 1. Behavior and security: the next executable task

Use the existing [behavior repair plan](../history/PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md), [isolation evidence](../history/PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md), [SDK HTTP delivery](../history/PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md) and [Neon evidence](../history/PUBLIC-RELEASE-R2-NEON-TRANSPORT-PROPOSAL.md). Their measurements are dated; first reproduce and pin the current source/compiled baseline.

1. Give each measured operation fresh application/database/settings/provider/reset state and valid owned, nonempty fixtures. Preserve all 334 contracted operations or explicitly review any contract change.
2. Separate a demonstrated effect from a deliberate refusal, a constant/shape-only response, unavailable provider capability and an inconclusive fixture. A 200 envelope with `success:false`, a 404 or SQL activity alone is not functional success.
3. Repeat forward, reverse and seeded order; compare classifications and actual effects. Review historical count-only differences and ledger changes individually. Do not regenerate the ledger to make the current result pass.
4. Correct the current Neon adapter before claiming it as supported: production source still uses the obsolete callable query form, derives affected rows from row-array length and lacks a per-instance guarded transport. The copied SDK/package experiments demonstrate feasibility only; they are not an adopted production repair. Reuse the existing runner seam, decide a maintainable per-client transport remedy, preserve actual SDK serialization, use the supported query API and validated affected-row metadata, then prove parallel owner isolation/no raw fallback. If deferred, acceptance requires an explicit fail-closed unsupported path and an accepted release-scope change.
5. Complete the supported-path HTTP/SSRF/redirect/cancellation/no-leak matrix, including the real host egress boundary. Native operator databases and DNS/egress capabilities require their own documented policy; HTTP string validation cannot prove DNS-rebinding protection.
6. Reconcile the existing secret/reset/auth/tenant/recovery evidence against the candidate. Test real password-reset delivery and token lifecycle on a supported deployment; retain tenant and secret-custody mutation gates. Do not reopen the already repaired auth-form primary defect simply because it appears in the older diagnostic.

**Deliverable:** an adopted, reproducible behavior ledger and supported-transport/security receipt, with zero unresolved release-blocking defects. Skipped optional providers stay explicit and outside supported release claims.

### 2. One candidate, one cumulative result

Review the integrated branch against the intended release baseline; preserve unrelated worktrees and normal Git history. Identify runtime, generated artifacts, package archives, console/hydration assets and any declaration patches separately. Finalize runtime/tool support from evidence: current host receipts include Node 22/Linux and Node 24; broader `engines` claims still need reconciliation.

Use the existing workspace commands, package consumer proof, mutation harnesses and CI jobs. Add a release matrix entry point where necessary rather than creating a second test framework. Include changed translation/publication/deployment/backup/account-refresh surfaces and the repaired R2 ledger. Record exact command exits, source hashes and credential-gated omissions. Ensure the release branch/default-main source eventually contains the accepted changes; a private branch receipt alone cannot certify a README button that points elsewhere.

**Deliverable:** immutable candidate manifest, exact archives and a clean-checkout CI result. This step also verifies the provenance of the adopted backend declaration remedy; it does not request a new dependency experiment.

### 3. Public installation and actual default buttons

Existing CF/Vercel runtime and recovery proofs are retained. Remaining acceptance is the public entry point and adopter environment:

- Run both actual README buttons against the intended public release/default source, including provider clone/resource handoff. Preserve the distinction between a clean native flow and a manually recovered deployment. Document Vercel's first-project preview restriction and its supported initial environment.
- Complete a fresh Linux/container or equivalent clean environment without the developer's package cache, private staged assets or local sibling repositories. Verify the starter and full CMS separately; the pure starter proof does not prove the complete administration artifact.
- Follow first-admin setup through authenticated console, data binding, storage, a representative automation and page save/preview/publish. Verify anonymous publication and private API denial. Upgrade a prior candidate/version while preserving session, encrypted configuration, data and public content; exercise the documented backup/restore and rollback procedure.
- Certify only the providers included in the release support matrix. Missing optional HTTP-provider credentials can remain explicit skips if those combinations are outside supported release claims. Do not turn a skipped live test into parity.

**Deliverable:** reproducible commands/public source refs, supported-target matrix and clean-room journey receipt. Reuse existing approved fixtures where meaningful; any new persistent resources need their own applicable authorization.

### 4. Documentation and support

The dated strategy/audit logs remain history; this plan owns current execution order. Update public claims to match the final candidate. Provide one clear start-to-first-publication path, deployment/binding defaults and overrides, component/data/auth concepts, supported translation scope, operations/runbooks and troubleshooting.

Root `SECURITY.md`, `CONTRIBUTING.md` and `CHANGELOG.md` are absent at this checkpoint. Establish a real private vulnerability-reporting contact/process, contribution guidance and a versioned changelog. Verify each selected package's license/notice obligations, including bundled declarations/dependencies. Define preview support ownership, supported runtime/package versions, known limitations and upgrade/deprecation policy. Clean-room acceptance can be executed in an isolated agent/environment, provided it has no undocumented developer state.

**Deliverable:** reviewed docs, working support/reporting channels and a recorded clean-room pass. Known limitations belong in public release notes, not only internal history.

### 5–6. Distribution mechanics and publication

The seven-package local consumer proof is complete; package identity/registry/versioned consumption is still open. Verify namespace ownership and existing registry versions before selecting preview versions. Coordinate dependency ranges and ordering; keep root/private application artifacts out of the library publication set. Reuse the existing release packer and `scripts/release-consumer-proof.mjs`; raw backend packing must not bypass its bundled-declaration/runtime/license checks.

Prepare a reviewed CI publication workflow with scoped registry authentication/provenance, explicit version/tag checks, archive hashes, dry-run validation, release notes and a failed/partial-publication recovery procedure. Document that registry versions cannot simply be overwritten; test the approved distribution rollback/deprecation approach. Rehearse versioned installation from the intended registry/distribution channel when that channel is authorized, then perform exact-version publication only after the candidate gates pass.

**Deliverable:** published Developer Preview versions plus repository tag/release and a fresh consumer acceptance receipt. Production website cutover remains a separate operation.

## Explicitly outside this release's critical path

- Completing translations of every Study in USA datasource record, migrating every WordPress site or performing the USA production cutover.
- Deno parity, Vercel Edge parity, all optional provider combinations or every possible binding. Unsupported combinations must remain truthful and safe.
- The retired CF-22 product-equivalence objective, additional feature sprints, bookings/payments or a second app engine.
- A full paid Frontbase Cloud/SaaS launch, billing and downstream education schedules.

These exclusions preserve the existing Developer Preview scope. They do not excuse security defects in enabled supported paths or missing functionality advertised by that edition.

## Readiness now and next action

R0 scope and bounded acceptance are complete. R2 source repairs and named local qualification now pass at runtime b7cb5d9/artifact e9f3506; candidate deployment/native preservation verification is next. R1 retains strict local archives and host/recovery evidence, with public-default-source/clean-room boundaries still explicit. R3 support/distribution preparation and R4 exact-version publication remain open where channel/namespace/provider acceptance is unverified. No public release date or GA claim is inferred.

**Next executable work, updated2026-10-23:** finish final cumulative/fault/archive/host qualification of the implemented G3/G5/G6 and self-host reset candidate, commit source and generated artifacts separately, push and deploy to the existing staging/test hosts, then record native UI and preservation evidence. G1/G2/G4 and the first frontend editor checkpoint already have staging acceptance. Remaining public release work is public-default-source integration/clean-room certification, exact registry names/versions/distribution, private vulnerability reporting activation and credential-specific provider/inbox acceptance. GitHub's private reporting setting is confirmed disabled and an attempted activation was rejected by automatic approval review; no workaround or setting change was performed. Do not turn any of these deltas into a GA or published-package claim.
