# Frontbase Developer Preview: current release plan

Reconciled 2026-10-24 against committed source and dated acceptance receipts. This is the current execution order; it supersedes the ordering in the [2026-10-22 plan](frontbase-public-release-finalization-20261022.md), while preserving that plan as history. The accepted edition remains **Frontbase Framework Developer Preview**, not GA. No new release scope or publication authorization is created here.

## Delivered and accepted

The latest accepted staging source includes the visual-binding delivery, the four canvas/Layers repairs and the owner-approved layout shortcuts. Regular merge `313d387` integrated `20eef2f`; deployed artifact `fc6ae02`, receipt checkpoint `bbdddca`, on `codex/integrated-finalization-20261022`. Staging image `sha256:8d1a9632ab79043b5f99080aaddffb1d5cfc34946b925b98dae84d1f34b2f88a` succeeded at 2026-10-24 03:10:37 UTC. [Latest authoring receipt](visual-layout-repair-20261024.md), [original binding receipt](../reports/visual-data-binding-20261024.json), [binding guide](../guides/visual-data-binding.md).

- Visible nested drop boundaries and container targets, including repeated instances; canonical two-way canvas/property text editing with live drafts, Escape and empty-text handling.
- Row/Column spacing/alignment controls reach the shared renderer; true desktop/tablet/mobile preview widths, Layers nesting/outdenting and guarded movement with undo/redo are verified.
- **Wrap in Row / Wrap in Column is now merged and deployed**, not an optional unmerged backlog item. Native staging verifies bound-heading preservation, wrapper selection/expansion and atomic Undo. Six focused shortcut tests and recursive check/build pass. Temporary tests were discarded; no owner page was saved or published.

- A single **Bind → Table / Saved View** drilldown across Repeaters, Tables, Grids, bound Cards, KPI Cards, Charts and InfoLists. Saved views supply their own table/schema/filters; physical source is read-only detail. Empty saved-view menus are disabled. Write Forms retain explicit writable table targets.
- Ordinary, visually composable Repeater items, with a normal Card as the new-item starting point. Existing items retain their design. Text, images, links and other children can be selected and configured rather than being a fixed card field form.
- Full inspected field and relationship discovery through existing adapters, shared @ inputs and mapping controls. Mapping updates the property actually rendered, including canonical Text content and legacy text compatibility.
- Bounded selected relationship reads and exact reviewed public-field admission; discovery does not grant public access. Existing source filters, tenant isolation and Block Version inheritance remain enforced.
- Canvas targets refresh after asynchronous record hydration and resource loads. Native acceptance proves actual nested Text insertion, @ selection of institution type, related-city mapping and matching editor/rendered values.
- Required workspace check/build, 47 focused console tests, related-field/public-admission tests and native PostgREST/schema tests pass. English/Arabic homes and four Explore routes pass with source/copy/navigation preserved and anonymous private APIs refused. All temporary authoring tests were discarded without saving the owner's draft or datasource records.

Retained engineering acceptance also includes frontend multilingual text editing, workflow test/run/history/version wiring, Neon API/guarded transport/affected-row repairs, Request preservation and host egress guards, truthful refusal of unsupported engine operations, isolated 334-operation diagnostics, seven strict external archive consumers/starter, actual CF/Vercel installation/upgrade and D1/Turso recovery. See the [repair receipt](../reports/frontbase-repair-finalization-20261023.json), [behavior qualification](behavior-measurement-repair-20261023.md), [deployment matrix](../guides/deployment-support-matrix.md) and [acceptance closeout](frontbase-acceptance-closeout-20261022.md). These receipts retain their original revisions; they are not fresh full-matrix passes for every later change.

The staging PostgREST hold is closed. Security reporting is enabled, and SECURITY.md, CONTRIBUTING.md and CHANGELOG.md exist. Their former absence, the old behavior-ledger mismatch and the already-adopted Neon repair are not current implementation blockers.

## Actual remaining release gates, in execution order

| Order | Remaining work | Concrete exit |
|---|---|---|
| 1 | **Integrate and freeze one release candidate.** Reconcile the intended release branch with other streams; review the inclusion list and generated artifacts. | An immutable candidate manifest names source, console/hydration/host artifacts, seven library archives and runtime/tool versions. No uncommitted or private developer state is required. The working primary checkout has unrelated edits and must not be cleaned or treated as that manifest. |
| 2 | **Qualify that exact candidate together.** Latest authoring tests and older package/host receipts currently refer to different checkpoints. | Clean frozen install; required checks/build; supported functional, console, security, mutation, conformance and behavior gates; seven-package strict consumer/starter proof. Run changed-surface gates on the candidate and retain unchanged dated evidence explicitly. No missing gate may be replaced by a percentage or a green build. Scope the console typecheck honestly; do not call historical diagnostics outside the scoped check a full-console pass. |
| 3 | **Certify the public installation and upgrade path.** Branch fixtures and repaired native deployments are not proof of the exact public entry point. | Actual README CF/Vercel flows and documented Node/Docker installation use the chosen public source/version from a clean environment. First admin → datasource/binding → representative storage/workflow → edit/save/preview/publish → anonymous/private checks → upgrade/recovery succeeds without source surgery or undocumented local assets. Reuse existing fixture evidence; rerun affected paths rather than restarting all deployment work. |
| 4 | **Close the remaining live-provider/recovery support decisions.** Code-level repairs are not real-provider or inbox receipts. | Certify actual Neon and any optional cache/queue/S3/provider combination advertised as supported, using existing adapters; otherwise mark that combination explicitly experimental/unsupported and keep capability refusals truthful. For advertised password-reset mail, prove receipt at an owned mailbox, correct origin, expiry, single use and session invalidation on a disposable account. Never treat provider acceptance as inbox delivery. |
| 5 | **Finish clean-room documentation and distribution mechanics.** Documents exist, but the complete adopter journey and immutable distribution are unaccepted. | A clean-room adopter follows only public docs through first publication and upgrade/recovery. Support matrix, secrets, migrations, limitations, troubleshooting and contribution/security paths match the candidate. Verify npm namespace ownership, exact coordinated preview versions/ranges, licenses/notices, package provenance, release automation, dry runs and partial-publication/tag/deprecation recovery. |
| 6 | **Publish and verify the Developer Preview.** This is the release action after the above evidence. | Exact approved versions, registry archives, tag/repository release and changelog agree. A fresh external consumer installs the published versions and completes the supported journey. Record archive hashes, support ownership and residual issues. No GA or production WordPress cutover is implied. |

Work on documentation, package inventory and support choices can proceed alongside candidate preparation. Final certification must name the same candidate. A documentation-only update does not require another application deployment.

### Current observations and support boundaries

- Read-only Git discovery on 2026-10-24 reports default `main` at `44423df49b849813338d55709ddcb4c73a2ecb79`. This review does not establish its ancestry or certify it for the latest integrated delivery. Public/default-ref certification remains open; a difference in ref names is not itself proof of a missing feature.
- The [registry inventory](../reports/frontbase-registry-inventory-20261023.json) has `namespaceOwnershipVerified: false` and `registryPublication: false`. Its package 404s do not prove ownership or universal absence. Refresh authenticated inventory before selecting/publishing immutable versions.
- Local archives already prove strict NodeNext/Bundler consumption and an independent starter. They do not prove installation from published versions. Use the existing release packer and consumer-proof tooling, including the adopted licensed backend declaration remedy.
- Current native qualification is Node 22. Windows Node 24 native-SQLite stress remains failed/unaccepted; this is a runtime support restriction, not a mandate to block a properly scoped Node 22 preview. Runtime claims must match that boundary.
- CF is the leading edge target; Vercel evidence is for Node Functions, not Vercel Edge. Defaults are editable suggestions. Native CF mail/queues/vector provisioning is not delivered merely because it appears in a resource inventory. External optional providers do not become certified through dropdown availability.
- Bare PostgREST without the required aggregation capability refuses saved-view chart aggregation. Composite relationship keys/excess fanout have explicit refusal/omission boundaries. These limits must stay visible in release documentation; they are not silently promised features.

## Separate defects, evidence gaps and optional work

| Classification | Current fact | Release treatment |
|---|---|---|
| Engineering debt | Full standalone console TypeScript has historical failures outside the required scoped checks. | Inventory the exact errors on the frozen candidate. Fix errors affecting supported shipped behavior or safety. Record any accepted build-tool/type-only residue explicitly; never claim a full-console pass. Current workspace check is green but narrower. |
| UX limitation | Committed layout changes replace the full preview document and refresh live records. | Document current latency. Incremental preview rendering is an improvement, not an automatic Developer Preview blocker unless the final journey demonstrates lost edits or unusable behavior. |
| Evidence gap | Latest UI receipts and broad security/package/host receipts name different revisions. | Run a risk-based cumulative candidate matrix; do not reopen each delivered feature or falsely label dated receipts as fresh. |
| Support decision | Neon real-provider, optional external cache/queue/S3 and actual reset inbox delivery lack complete receipts in the reviewed evidence. | Test combinations promised in the edition. Explicitly exclude unverified optional combinations instead of making every adapter a release requirement. Required recovery for the advertised auth path must work. |
| Distribution gap | Registry ownership/publication and exact public-default-source install remain unaccepted. | Resolve before announcing installable versioned availability. Local tarballs and staging alone do not close it. |

No new reproducible runtime defect is established by this documentation review. That is not a claim of zero defects: final-candidate qualification and the type-error triage above remain open. No new live provider, registry or default-branch inspection was performed; earlier inventory observations retain their dates.

## Not blockers for this edition

CF-22/product-equivalence work is retired. Complete Study in USA record translations, other WordPress sites, production website cutover, Deno/Vercel Edge parity, every optional provider, booking/payments and a hosted SaaS launch are outside this release's critical path. This does not excuse a security defect or false success in an enabled supported capability.

## Next executable task

Prepare the release integration/candidate manifest first. Reconcile branches and public source refs without overwriting another session; identify the exact checks and live proofs affected by the latest backend/console changes. Then execute the clean candidate matrix and public-source adopter journey. Do not reopen closed Neon/behavior/workflow/PostgREST repairs without a new reproducible failure. No new product feature is required merely to advance this release plan.
