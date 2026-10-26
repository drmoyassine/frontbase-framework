# Shared hosted bootstrap — implementation plan

Owner-approved scope: deploy a resource-free setup application on Cloudflare, Vercel or Docker, then use the shared Frontbase Bindings UI before creating an administrator and installing a site template. Existing installed applications must retain their boot path. No hosted control plane or Docker socket.

## Ordered implementation and acceptance

1. Shared installation contract: explicit bootstrap mode, immutable deployment identity and selected-host capability constraints; review binds the complete manifest and secret references to one installation.
2. Independent bootstrap authorization: expiring deployment-owner capability, same-origin protected requests, no anonymous takeover, no application DB dependency. Never reactivate bootstrap merely because the DB is unavailable.
3. Shared browser form: reuse bindings-form, adapter metadata and validation; progressive owner, connections, review and progress screens. Secrets remain server-side/in transport only and never enter receipts.
4. Host persistence/execution: CF settings/secrets and binding provisioning; Vercel scoped environment update plus new deployment; Docker atomic private configuration on a mounted volume. Do not emulate cloud persistence with process memory or ephemeral files.
5. Durable operation ownership: compare-and-swap claim before any mutation, persisted checkpoints, explicit reconciliation after uncertain outcomes. No automatic retry of an uncertain write. A host without this capability must refuse execution.
6. Activate only after all configuration checks pass; initialize the selected application state, use existing first-admin setup, disable the bootstrap capability. State migration for installed apps is excluded.
7. Host tests: zero-state boot, unauthenticated refusal, malformed/changed review, concurrent installers, provider failures, process restart, secret projection, native resource reuse, configuration activation and credential retention.
8. Isolated live CF/Vercel and local Docker acceptance; native buttons switch only after exact-source proofs. Existing buttons/local wizard remain available meanwhile.
9. Separate site-template installer follows deployment acceptance; reuse artifact/preflight/page-change/publication rather than direct state copying.

## Platform evidence

Cloudflare documents Worker script/version settings updates and native bindings: https://developers.cloudflare.com/api/typescript/resources/workers/subresources/scripts/subresources/script_and_version_settings/ . Vercel environment changes apply to subsequent deployments: https://vercel.com/docs/environment-variables . Neither is an application database or an assumed compare-and-swap operation journal. Provisioning permissions and durable ownership must be explicit in each executor.

## Status

Implementation in progress. No hosted bootstrap deployment or native-button replacement is accepted yet. First milestone is the reusable installation state contract and its refusal/reconciliation tests.

## First implementation checkpoint

Shared deployment manifests now recognize Docker for existing HTTP adapters. The new edge-core transaction contract binds reviews to deployment identity, requires atomic journal claims before executor writes, records uncertain outcomes and reconciles only matching operation/configuration plus healthy/disabled-bootstrap proof. The backend hosted API reuses those manifests and transactions with HTTPS origin checks, bounded JSON bodies, an expiring owner capability, HttpOnly/Secure/SameSite cookies scoped to the installation, and active-install refusal. No application database is imported or initialized by this API. The Docker journal uses a private mounted-directory contract, atomic replacement and a fail-closed cross-process filesystem lock; the local synthetic test covers restart and competing claims, not an actual Docker container.

Verification: workspace check/build PASS; final backend export build and workspace check PASS; transaction behavior and 11 injected faults PASS; hosted API behavior and seven injected faults PASS; existing deployment contracts and five faults PASS; persistent journal tests PASS outside the Windows sandbox (sandbox atomic rename EPERM retained as environment evidence); existing selfhost-reset suite PASS. No hosted route is mounted on current production entries; no native button is changed and no live resources or settings changed in this checkpoint. Generated cms.mjs remains excluded.

Still open: storage-independent host entry mounting and browser assets, Cloudflare/Vercel durable coordination and provider executors, Docker configuration activation/restart, and live acceptance. The abstract journal contract is not proof that provider environment APIs implement CAS. Select/establish the host journal before enabling writes; do not substitute process memory in serverless hosts. Existing user sessions and state must remain outside bootstrap. Next executable task is Docker host integration against the persistent journal, followed by the explicit Cloudflare/Vercel persistence/provisioning boundary and the common browser form. This checkpoint is foundational implementation, not a usable hosted installer.

## Docker host integration checkpoint — 2026-10-26

Implemented the opt-in Node/Docker entry, preserving ordinary startup through the existing factory. The hosted form uses the existing Bindings component and shared adapter metadata; Docker now has a local SQLite default plus HTTP alternatives. Owner authentication precedes review/apply; selected environment values are privately persisted, the same CMS engine initializes state, and the existing administrator form receives the setup capability. Existing state and configured environment admission are refused. Configured restarts cannot reopen setup, even when the database fails. The operation journal and exclusive private runtime file survive process/container restarts. A partial runtime file fails closed rather than replacing an installation.

Evidence:
- Full workspace check/build PASS; final check and rebuilt actual Node artifact PASS.
- Shared bootstrap behavior, 11 transaction faults and seven authorization faults PASS.
- Docker host behavior including failed initialization/uncertain reconciliation and five host faults PASS.
- Actual bundled Node hosted journey PASS: zero-state boot, assets, adapters, claim/review/apply, existing setup, restart and closed installer.
- Existing actual Node login/create/publish/frontend edit/restart/session suite PASS.
- Linux Docker full source image build PASS; final Node artifact layered into that image after the last admission guard change. Actual non-root Linux container activation/restart/0600 permissions PASS; disposable test container and volume removed. This is not a final-source clean-room release certificate.
- Existing 16 deployment contracts, environment lowering and native button contracts PASS.

No Cloudflare/Vercel settings, native buttons or Study-in-USA staging were changed. Generated cms.mjs remains excluded. The Docker private volume is credential-bearing; the journal and public responses contain no provider credential values.

Remaining ordered work: (1) establish durable cloud operation ownership before provider changes, using a selected-state/provider-specific coordinator rather than process memory; (2) implement and test CF binding/secrets activation and Vercel environment/redeployment executors; (3) actual HTTPS browser setup plus live HTTP-provider acceptance; (4) isolated native entry replacement acceptance; (5) separate full site-template installer. The overall hosted-bootstrap task stays IN PROGRESS. Docker evidence must not be used to claim the cloud-hosted pipeline is complete.

## Cloud coordination checkpoint — 2026-10-26

Added an edge-infra SQL journal through the existing DbRunner contract, exported as @frontbase/edge-infra/bootstrap-journal. Explicit admission refuses existing application tables before creating its singleton ownership table. Updates use one conditional SQL UPDATE ... RETURNING, binding owner and revision; no affected-row-count assumption or process-memory lock. A lost write response remains applying/uncertain and cannot trigger a second provider dispatch. Receipts accept only the bootstrap record fields and validated manifest; provider tokens never enter this table.

Tests pass against actual SQLite with independent connections and restart, concurrent apply attempts (one dispatch), foreign ownership, occupied database admission, stale revisions, lost commit responses, unknown receipt fields and the existing D1 binding runner with a local SQL-backed fixture. Four injected faults are detected. Full workspace check/build PASS; final edge-infra rebuild and journal gates PASS. The D1 fixture is not a live Cloudflare acceptance test. No provider changes were made.

Important correction to the initial selected-state idea: selecting a different application database in a second setup session would create a second lock. Therefore the cloud host must establish one fixed coordinator identity for the deployment, independently of subsequent binding choices, before using this journal. The journal deliberately does not claim to solve that provider-level anchor. Do not mount an arbitrary user-selected database as the sole global deployment lock.

Next executable work: establish and verify that fixed provider-side anchor, then mount the owner-authorized hosted API with its journal and implement scoped activation/redeployment. Provider API success alone is not healthy runtime proof. Existing native buttons remain unchanged. Overall task remains IN PROGRESS, with no cloud-hosted installation acceptance yet.
## Cloud hosted activation acceptance — 2026-10-26

This section supersedes the earlier foundation checkpoints. Cloudflare and Vercel hosted runtime activation are implemented and live-verified on isolated installations. Native-button replacement and a full site-template installer are separate remaining delivery tasks; no default-branch, registry or Study-in-USA production release is claimed.

- Cloudflare: `frontbase-hosted-cf-261026`, installation `4950c93f-03f5-40a2-bda5-fa4e2a3f0db3`. Started without application bindings. Owner-authorized initialization created fixed D1 coordinator `bb033b93-a12e-4691-a70f-3847304f6ca1`; the default reuses it as application state, with a separate journal binding. Actual review/apply created KV and activated the original Worker while retaining assets. Runtime health completed its receipt to `active` without replay. User created the administrator; browser created/saved/published `/hosted-cloudflare-acceptance`.
- Vercel: `frontbase-hosted-vercel-261026`, project `prj_Igx2a2kZjjIWq5hjF3ApIOc6CFKw`, new $0 Starter Turso `frontbase-hosted-261026`. Actual environment create-only collision probe returned one 201 and one 400 `ENV_CONFLICT`, establishing the append-only revision claim used by the provider journal. Actual review/apply injected the chosen HTTP state configuration and redeployed the current artifact. Runtime completed the uncertain receipt to `active`. User created the administrator; browser created/saved/published `/hosted-vercel-acceptance`.
- Both public pages return 200 with expected content. Both administrator accounts and browser sessions survived an artifact update. Both setup status endpoints report no setup needed; bootstrap configuration returns 410. No existing site data was copied into either installation.
- Temporary Cloudflare account-scoped and Vercel project-scoped provisioning tokens were specifically approved. Cloudflare activation drops its owner/provider secrets from current bindings. Vercel's temporary owner/provider environment secrets were removed after active receipt verification; its final deployment omits them. Owner confirmed both temporary tokens deleted after acceptance. Post-cleanup public content, administrator lock and closed-bootstrap checks pass on both hosts. Old provider deployment versions can retain historical encrypted settings; token revocation invalidates that access.

Live repairs: Workers fetch does not accept redirect mode `error`, so bounded provider fetches use `manual` and reject non-success responses. Fresh D1 contains `_cf_KV`; admission excludes exactly the known Cloudflare system tables, preserving foreign application-table refusal. Vercel environment creation reports 201 and `ENV_CONFLICT`, with response shapes covered. Asynchronous activation finishes its journal from the healthy installed runtime. Administrator setup now captures a late hash claim, scrubs it, shares the exchange promise and exposes no manual-token field; email remains visible and password confirmation/reveal remain available.

Verification: full `pnpm -r check` and `pnpm -r build` PASS; setup form and real setup-claim module PASS; cloud host normal/pending/concurrent activation cases PASS; four cloud host fault injections PASS; existing bootstrap transaction eleven faults and hosted authorization seven faults PASS; SQL journal real SQLite/concurrency tests and four faults PASS. Final focused checks are recorded at closeout. Generated `api/cms.mjs` remains excluded from source commits, as required by the standing repository rule.

Supported boundary: shared bindings and existing HTTP adapters are reused; this pass live-proves CF D1/KV and Vercel Turso. Optional S3/vector/queue adapters are not newly live-qualified here. The cloud host currently needs operator-provided deployment identity, scoped provisioning credential and expiring owner capability; it is not a new OAuth launcher. See the operator guide for configuration. Existing local wizard/native buttons are unchanged.


## Direct OAuth continuation — 2026-10-27

[Direct OAuth qualification and remaining native gaps](provider-oauth-20261027.md) supersedes the operator-only connection discussion where explicitly configured clients are available. Both existing cloud acceptance apps are upgraded and current UI/public/session preservation passes. Fresh Docker setup/publication/restart passes. Native-button OAuth first install remains incomplete; no relay is implemented or deployed.
