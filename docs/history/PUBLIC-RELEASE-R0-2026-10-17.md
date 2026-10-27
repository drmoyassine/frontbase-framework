# R0 refresh — edition, evidence and ordered release backlog

**Subsequent owner-requested checkpoint:** the source baseline is now captured in focused commits; see the [audit](PUBLIC-RELEASE-AUDIT.md) for hashes and fresh checks. The dirty-tree/uncommitted observations below describe the original audit, not the later checkpoint. External type, behavior and clean-room release gates remain open.

2026-10-17. Documentation/read-only audit at HEAD b369784 on codex/wordpress-pilot. The initial inventory has 331 status entries, including staged deletions with corresponding untracked files and unrelated concurrent work. That is not a clean release baseline. No reset, staging, code change, deployment, registry operation or feature sprint is performed by this refresh.

## Edition recommendation

Retain the already accepted **Frontbase Framework Developer Preview**, for developers and agents operating their own deployment. Do not promote to alpha/beta/stable or GA from pilot success. Cloudflare leads; Node/Docker, Vercel and Deno claims require their own dated acceptance. CF-22 remains paused accepted residue. NoCodeHero and Studygram are downstream evidence, not release authorities.

The six original Apache-2.0 library candidates remain, plus the explicitly accepted seventh candidate @frontbase/translation. This accepted exception supersedes older six-only inventory wording, not the release gates. Seven top-level non-private library manifests are present; console, hydrate and setup/admin-console are private application artifacts. Root private:true prevents publishing the monorepo root. Six libraries use version0.0.0; builder uses0.1.0. These are candidate manifests, not verified registry releases. No local tags or root SECURITY.md, CONTRIBUTING.md or CHANGELOG.md are present; this is local evidence only, not a remote registry/release inventory.

## Evidence reconciliation

| Surface | What the evidence supports | What remains open |
|---|---|---|
| Original packages/starter | [R1 external runtime and pure starter](PUBLIC-RELEASE-R1-CONSUMER-PROOF.md), [strict binding repair](PUBLIC-RELEASE-R1-BINDING-TYPES.md) | Proof uses local tarball overrides/scripts disabled; fresh coherent seven-package graph, lifecycle, registry/version and full-CMS install remain open |
| Backend declarations | [Strict declaration diagnosis](PUBLIC-RELEASE-R1-DECLARATION-DIAGNOSIS.md) and [repair candidate](PUBLIC-RELEASE-R1-UPSTREAM-TYPE-REPAIR-PROPOSAL.md) | Copied dependency candidate is not adopted distributable acceptance. Workspace check passing does not close external declaration failures |
| Response conformance | [SDK delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md): dated257 conforms/77 verified refusals, zero unreachable across334 operations | Historical nine-unreachable report is superseded, not a current blocker; fresh clean-checkout verification required |
| Behavior integrity | [Isolation diagnosis](PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md), [repair plan](PUBLIC-RELEASE-R2-BEHAVIOR-REPAIR-PLAN.md) | Shared fixtures/order dependence and false-success evidence require repair; unchanged ledger must not be regenerated to hide failure |
| Transport/security | [Bounded SDK HTTP repair](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md), [D1 numeric count repair](PUBLIC-RELEASE-R2-D1-COUNT-DELIVERY.md) | [Neon candidate](PUBLIC-RELEASE-R2-NEON-PACKAGE-EVIDENCE.md) is not an adopted production fix; remaining wrappers, native/operator boundaries and actual host DNS/egress acceptance remain open |
| Translation | [Current HTTP delivery](../plans/frontbase-translation-http-20261017.md): shared existing PostgREST client, real HTTPS transaction/lease/rollback evidence, isolated package proof | Older direct-PG bridge claims are superseded. Selected datasource UI, AI orchestration and visual localized publication are absent; seven-package release gate not rerun |
| Self-host/operations | [Docker guide](../guides/self-host-docker.md), [deploy guide](../guides/console-and-deploy.md), [pilot delivery](../plans/frontbase-live-list-deployment-review-20261015.md) | Repository tooling and pilot deployment do not prove independent clean install, full workflow, upgrade, backup/restore or all host support |
| Public claims | README already names Developer Preview and defers full scaffolding/general parity | Absolute no-code/one-artifact/offline/exact-WYSIWYG and every-nav-area end-to-end statements need a claim-by-claim evidence review; no automatic clearance from common renderer code |

## Ordered executable backlog

These tasks define evidence required for release; they are not publication/deployment authorization or permission to restart parked pilot work.

| Order | Work and dependency | Completion evidence |
|---|---|---|
| 1 / P0 | Establish a reviewable source baseline and ownership; reconcile this R0 with current HTTP handoff | Review/stage only owned changes, preserve concurrent diffs, identify immutable source/artifact identities and current claims. Do not mass-clean the dirty worktree |
| 2 / P0 | R1 distributable public type/dependency remedy; after1 | Adopt an evidence-supported remedy for backend declarations, licensing and maintenance; repack all seven candidates, strict external types/runtime/public exports and independent pure starter pass without source/workspace links. Retain failures and lifecycle/registry boundaries |
| 3 / P0 | R2 behavior measurement and complete security transport acceptance; may diagnose alongside2 | Isolated334-operation forward/reverse/seeded order evidence, positive/counterfactual assertions, reviewed ledger differences, fault gates; safe production Neon decision, remaining wrapper inventory and intended-host egress tests. No weakened denominator, no global per-request SDK mutation |
| 4 / P0 | R1/R2 clean-checkout cumulative matrix; after2–3 | pnpm -r check/build, package tests, mutation/conformance/behavior/no-leak/auth/isolation/SSRF, actual credential-gated tests for claimed providers. Distinguish explicit skips from passes |
| 5 / P0 | R1 full CMS clean-room adoption and R2 operations; after4 | Independent Cloudflare-first setup→admin→data/storage→edit→publish→automation; custody, migration/upgrade, exact restore and rollback. Verify Node/Docker separately before supporting those paths; Vercel/Deno remain bounded to proven evidence |
| 6 / P0 | R3 documentation and release operations; after accepted scope and evidence | Claim/evidence matrix, supported versions/hosts, quick start through troubleshooting, security reporting/contribution/changelog, registry ownership, license notices, version/tag/publish and rollback rehearsal, independent adopter RC sign-off |
| 7 / gated | R4 explicit owner-authorized distribution; after1–6 | Publish only approved artifacts/versions; announce Developer Preview limitations and support boundary; retain rollback and feedback ownership |
| Separate product track | Native translation and parked pilot work | Datasource selection→AI budget/provider/jobs→visual language refinement→localized publish/SEO/RTL and per-site translated-slug comparison. These features must not be advertised as delivered before acceptance; parked pilot tasks need owner resumption |

**Decision:** R0 refresh complete; retain Developer Preview preparation. No-go for release publication/GA or general portability claims until gates above close. The next executable release task is source/evidence baseline review, followed by the existing distributable backend-type remedy. This report makes no new package, dependency or rollout decision.

## Verification and handoff

Fresh: Git status/HEAD/branch/local-tag inventory; ten top-level manifest classification; source inspection of scaffold placeholders, shared PostgREST transport and translation exports; four workflow filenames; root support-file existence; dated evidence and retained machine-result reconciliation. README, strategy, readiness, decisions, milestones and audit are reconciled with this report.

No code was changed during this audit. Workspace check/build/tests, full tarball suite, real deployment, credential checks and clean-room recovery were not rerun. HTTP delivery results are explicitly retained evidence from the preceding implementation, not new R0 executions. Final checks: 414 local Markdown references resolve, code fences/UTF-8 pass, five sanitized evidence JSON files parse and pass a bounded credential-pattern check, and scoped git diff --check exits0 (existing CRLF normalization warnings only). This refresh owns eleven Markdown records (two new, nine updated) and five new sanitized JSON receipts; inherited source/build diffs remain untouched. All edits remain uncommitted; unfamiliar staged/unstaged changes are preserved. Open failures and unverified gates above remain open.
