# Second swarm: initial primary review

**2026-10-07 — independent review of delivered branch tips, not integration or full acceptance.** Read with the [progress report](wordpress-pilot-second-swarm-progress.md) and [assignments](wordpress-pilot-second-swarm.md). No commits were cherry-picked, merged or pushed in this review; no actual pilot/canonical/review/activation/deployment state changed.

## Independent verification

| Workstream / tip | Primary rerun | Assessment |
|---|---|---|
| A / `45257bd` | `python -m unittest test_audit`, worktree scripts/wordpress-audit:37 tests pass | Useful bounded offline tooling; actual migration reconciliation remains incomplete |
| B / `977af101` | `pnpm test`, worktree examples/education-template-proof: artifact-contract and destination-proof pass | Prototype evidence accepted for further design review, not a production installer or hosted clean-install claim |
| C / `2e2d0e26` | `pnpm e2e:quality`, worktree examples/cf-full:30/30 pass against isolated port4393 | Useful baseline observations; integration will need updated expectations for first-swarm fixes |
| E / `84a931da` | `pnpm exec node scripts/wordpress-pilot-ops/rehearsal.test.mjs`:15/15 pass | Successful synthetic happy-path evidence, but restore safety acceptance withheld pending the finding below |
| D / `aeefdd1` (2 commits) | Primary27-check rerun at c67df96; final delta adds only comments/documentation, independently inspected | Fake-delivery prototype evidence only; production contract still pending |

These commands ran in the delivered worktrees with their built dependencies. This review did not independently renew every recorded workspace build/security gate or replay E's entire boot/destroy/restore server chain. It checked branch tips and inspected key implementation contracts. One combined main-tree rebuild will own the generated cms.mjs artifact after reviewed integration; do not cherry-pick incidental bundles from separate worktrees.

## Confirmed restore-safety gap

At E's branch tip, restoreBackup creates the target and copies the snapshot to app.db **before** checking its hash, and copies objects before checking their hashes. It does not fully validate the manifest and all source artifacts before destination writes. Manifest-controlled file/key paths also need explicit schema and resolved-path containment validation, rather than relying on ad hoc substring checks.

A separate primary synthetic proof passed a deliberately corrupt snapshot with a mismatching manifest hash to the CLI. The command returned exit1 / restored-state-hash-mismatch, while both targetCreated and stateWrittenBeforeFailure were true. No live database was used. Private reproduction: primary-restore-failure-proof.mjs in the primary evidence directory.

The existing test named "failed object check leaves no partial writes behind" exercises check-restored against an already-restored object; it does not test restore failure before/while writing. Therefore the progress report's broad no-partial-write safety description is unsupported. The tool refuses a bad hash, but leaves a failed restore target on disk.

**Required fix before operational adoption:** validate schema/version, all paths/containment, source hashes/sizes and database integrity before destination writes; stage a restore in a fresh controlled sibling and only expose the completed target on success, with explicit platform-safe cleanup/refusal behavior. Test corrupt first/later object, malformed manifest, traversal/absolute/Windows path variants and hash failure; prove destination unchanged or absent on failure. Keep tests entirely synthetic and do not weaken overwrite/fresh-target confirmation guards. Decide symlink/reparse-point handling explicitly. Until then E is rehearsal tooling, not an accepted supported restore command.

The runbook also says secrets are "runtime env only" while documenting boot-generated persistence inside state DB snapshots. Correct that general statement: operator-supplied env secrets and boot-persisted secrets have distinct custody models; a sanitized manifest does not make the underlying snapshot nonsensitive. No live key rotation or backup schedule is authorized by this review.

## Primary design dispositions

- **A:** accept the bounded offline tooling as a candidate for integration, subject to source review. Its seven decisions are a gap backlog, not seven immediate questions requiring the owner to stop work. Primary should first run authorized snapshot/read-only reconciliation and retrieve missing permalink/link/media evidence; only unresolved discretionary exclusions/field updates return for concrete review. Extra canonical rows remain intentional expansion. No bulk import/write approval follows.
- **B:** a private example workspace member and narrowly scoped lockfile importer are reasonable for a prototype within the existing six-framework-package architecture; verify locked installation at integration. This does not accept the final export format, a new template registry or code extraction. Keep deterministic template ownership/customization preservation as a candidate design. Production install must specify preflight, recovery/idempotency and partial-failure semantics: the current prototype saves configuration then creates pages sequentially, so it is not an atomic installation proof. Internal skipChecks is not an acceptable public import bypass.
- **C:** accept the test suite as bounded baseline evidence, not a clean usability sign-off. Some checks assert observed missing behavior. Prioritize brand navigation that reaches a captured configured route, a single page-level list heading, distinct accessible card-link names, valid mapped cover alt semantics, and consistent malformed/out-of-range request outcomes. Avoid raising capture limits or declaring full-catalog browsing fixed. Rebase expectations only after first-swarm integration; retain tests that catch regressions rather than preserving known defects as desired behavior.
- **E:** retain local synthetic restore evidence and runbook proposal; withhold supported-command/safety acceptance until the above fix and independent retest. Backup destination/cadence and live Garage capture remain owner-deferred. D4 state-DB choice must match intended deployment; do not silently choose from this SQLite fixture. D6 public operations CLI adoption is a separate framework decision. D7 primary owns acceptance evidence; real operational responsibility/cadence still needs the operator's decision before cutover.
- **D:** final tip aeefdd1 follows c67df96 with12 comment/documentation lines explaining a fabricated credential-shaped refusal fixture; primary inspected the exact delta, which changes no executable behavior. Independent fake-delivery/context/duplicate/retry/HTTP tests passed27 checks at c67df96; no unnecessary repeat or production adoption claim. Review retention enforcement, durable deduplication/delivery state, status endpoint access/rate limits and public input primitives before any production route. Its fixture-owned input markup is not a new accepted engine architecture. API rate limits were agent infrastructure failures, not product defects.

## Integration order

1. Independently integrate/retest the completed first swarm (browser/storage, captured SEO, optional contacts/date). Regenerate the tracked host bundle once from that integrated source.
2. Review/import A's tooling and use authorized private inputs to establish current real gaps; do not label synthetic results live migration completeness.
3. Review/import B's isolated prototype and C's quality tooling. Rerun C against the integrated presentation and preserve newly identified navigation/heading/alt/request findings as explicit fixes.
4. Return E's confirmed restore-safety gap for a bounded fix and retest before adopting its command. Review D's newly landed production-contract proposal separately from its passing fake-delivery fixture.
5. Keep guarded publication controls, actual reviewed staging, full-catalog/content coverage, final packaging/reuse and production operations acceptance in the primary roadmap. No release/cutover claim follows from passing these synthetic suites.

This review documentation remains uncommitted. Existing strict-conformance residues remain open; first-swarm reports of fixed S3 checks await integrated primary verification. R0 remains in progress and CF-22 paused.
