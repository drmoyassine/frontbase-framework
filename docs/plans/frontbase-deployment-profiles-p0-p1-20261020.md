# Deployment profile P0/P1 checkpoint — 2026-10-20

Status: partial implementation and bounded verification, not full deployment-profile acceptance. Isolated branch `codex/deployment-profiles`, source baseline `585944f`; initial contract/runtime correction commit `4daf147` and deployment-safety correction `c164780`. The [approved plan](frontbase-deployment-profiles-20261020.md) remains authoritative for P0–P5. No change to release scope, package architecture or paused CF-22.

## Implemented

- `@frontbase/edge-core/deployment`: strict versioned manifest, 21-role catalogue and six initial configurable roles; compatible implemented-adapter filtering, required state/field/secret-reference checks, saved-choice precedence, whole-binding overrides and state-migration detection. Endpoint validation rejects credential-bearing URLs. Rejected input values are omitted from validation output; credentials themselves do not belong in manifests. Existing runtime SSRF and credential controls remain authoritative.
- `pnpm deploy:plan`: credential-free default generation and validation through that shared contract. It does not provision, resolve secrets or deploy. An unwired recommendation is refused; Cloudflare KV is such a recommendation and must currently be disabled for a valid D1-only plan.
- Vercel Node artifact corrected to the Web handler `default.fetch` shape. The gate imports the built module, rejects legacy Node/Edge exports, verifies actual array routing and preserves staged console/asset and native-driver checks. The existing HTTP SigV4 storage adapter replaces an AWS-SDK route that was stubbed in the portable bundle.
- Vercel background dispatch uses official `@vercel/functions` lifecycle registration, with synchronous/asynchronous failure containment. Durable execution, recovery and host duration limits remain separate requirements.
- Both external-host deploy scripts now upload the generated `SETUP_EXPIRES_AT` through one shared explicit environment allowlist. Deno receives only this bounded correctness repair; platform modernization remains deferred.

The local pre-deployment review now consumes this contract through the [bootstrap slice](frontbase-deployment-bootstrap-20261020.md). A [bounded first-install bridge](frontbase-deployment-handoff-20261020.md) now consumes the private handoff through the existing compiler and is verified on a disposable CF Worker/D1. Generic deployment-script and post-deploy-dialog integration remains open. Adapter selection in the contract is not a promise of host-specific wiring, provisioning or end-to-end certification.

The next local safety correction now requires explicit Vercel first-install/redeploy intent and exact team/project metadata verification before environment writes. Redeploy preserves absent local session secrets without reading host values; explicit rotation requires its own flag. Initialization values are refused on redeploy. Environment writes use `--force --sensitive` without prior deletion. Focused policy and fake-CLI tests verify no writes on target mismatch, stdin-only values and stopping after the first failed update; no live environment mutation is claimed. The dispatch-only workflow uses the new flags and pinned CLI64.7.0, but was not run. Compiler host dispatch can pass intent/team through documented environment configuration; native flag/UI integration remains open.

Automatic approval review rejected an unnecessary existing-project environment JSON read because it could retrieve readable secrets. No values were obtained by that attempt; implementation continued using local CLI help/source and fixtures. No approval to read unrelated project secrets is needed for this path.

## Capability evidence ledger

The full host product mapping is in the approved plan. This ledger separates existing adapter routes from current deployment evidence.

| Role/group | Adapter/runtime evidence | Provisioning/profile evidence | Actual host evidence in this slice |
|---|---|---|---|
| State DB | Native CF D1 and existing HTTP libSQL/D1 resolver | CF test resources created with private Wrangler config; generic profile executor absent | Disposable CF D1 initialization, auth, page publish and redeploy persistence pass; Vercel live pending |
| Content datasource | Existing connectors retained | No new datasource provisioning | Not tested |
| App cache | Existing HTTP Upstash; native KV profile route intentionally unavailable | KV recommendation refused until wiring exists | Not tested |
| HTTP cache | Existing host/CDN behavior | No new policy installer | Not certified |
| Object storage | Existing fetch/WebCrypto SigV4 adapter; focused tests pass | Native R2/Vercel Blob selection/provisioning remains open | No real upload in this slice |
| Vectors | Existing HTTP Vectorize/libSQL routes | No new native provisioner/profile application | Not tested |
| Queue/durable execution/scheduler | Existing QStash and Frontbase recovery retained; Vercel lifecycle locally verified | Native queues/workflows and scheduler setup remain open | No live job/recovery certification |
| Coordination | Existing transactional engine semantics retained | No new Durable Objects/coordinator | Not tested |
| Email send/receive | CF outbound adapter not selectable; existing intake boundary retained | Domain/recipient/plan readiness and adapter remain open | No email or DNS change |
| AI/embeddings/gateway | Existing HTTP provider contracts retained | No new native default integration | No provider call |
| Secrets/assets/observability | Existing host injection and staged assets retained | Disposable CF secret upload and static-assets config exercised | CF API/public routes pass; native console browser and full asset interaction not claimed |
| Rate limit/bot verification/internal service | Existing boundaries retained | Native profile configuration remains open | Not certified |

## Verification

Fresh `pnpm install --frozen-lockfile --prefer-offline` passes. An initial pre-build `pnpm -r check` fails because sibling translation declarations are not built in the clean checkout; after the full build, `pnpm -r check` passes. This build-order issue remains a clean-install observation.

- `pnpm -r build`: pass; CF bundle approximately 621.5 KiB gzip and Vercel Node bundle 624.9 KiB gzip. No new provider-limit guarantee is inferred from these measurements.
- `pnpm -r check` after build: pass. Full build and workspace check were repeated successfully after the deployment-safety correction; private logs `deploy-profiles-build-policy.log` and `deploy-profiles-check-policy.log` retain the exact output.
- Deployment contract suite: 16 cases pass; five in-memory source mutation faults are detected.
- Artifact fixtures: current Node/array routing passes; eight intentionally broken handler/config/asset/bundle cases are refused; setup-expiry allowlist test passes.
- Profile CLI, lifecycle ordering/failure and deployment intent/target/secret-preservation tests pass. Five Vercel policy faults (implicit install, implicit rotation, wrong linked team, unverified writes and continuation after failure) are detected without modifying production source. Fake CLI checks verify ordering, sensitive stdin-only writes, no deletion and stopping on failure.
- Existing host smoke matrix and retained host-config checks pass on rebuilt artifacts. Existing storage SigV4 and edge-infra no-leak gates pass. The actual Vercel artifact import gate passes.
- Scoped whitespace check passes. No complete public-release gate closure or exhaustive whole-repository test pass is claimed.

Private raw logs, generated credentials and cookies remain outside the repository under the task evidence directory. Only sanitized status evidence is summarized here. Never commit those credentials or paste setup links into receipts.

## Disposable Cloudflare acceptance

Wrangler local auth verified for the owner's account. Dedicated Worker/D1 name `frontbase-deploy-test-20261020-585944f`; D1 id `fb1776d0-e720-4b4a-bc73-806882119bd6`. No shared configuration IDs, Hyperdrive, custom domains or Study in USA staging resources were used.

| Check | Result |
|---|---|
| Setup status / anonymous pages | 200 / 401 |
| Setup without claim | 403 |
| Temporary setup claim / first admin creation | 200 / 200 |
| Repeated initialization | 410 |
| Sign-in / authenticated pages | 200 / 200 |
| Page creation / publication / public page | 201 / 200 / 200 |
| Redeploy with retained variables | Success; same page identity, public page 200 and setup remains initialized |

These were actual HTTPS requests with generated disposable credentials, not fixtures. They prove a bounded CLI/API installation against a private test config, not the public deploy button or the planned Bindings UI. Resources remain identifiable for continuation/cleanup. No paid-plan activation occurred; no claim of zero metered usage is made.

## Vercel acceptance boundary

CLI authentication works in team `mohamads-projects-f742d79e`. Existing projects were read-only discovery targets and were not linked, modified or deployed. The integration slug is `tursocloud`, not `turso`; its supplied credentials will need explicit mapping to the existing `APP_DB_*` state contract.

The free isolated database request returned `integration_terms_acceptance_required`; read-only installation discovery returned no Turso installation, and a later retry still required the terms. The owner intends to accept the free-plan terms; completed acceptance has not yet been observed. No database or Vercel deployment is claimed. Do not substitute existing project data or silently choose a paid plan.

## Ordered executable backlog

1. Continue after verified local CF D1 first-install execution: wire native KV/R2, durable resource identity and safe reuse/redeploy/resume; share form state with post-deploy Bindings and prove actual native buttons. The first-install API receipt is not deployment-button acceptance.
2. Finish integration evidence for the locally tested Vercel target/environment and retained-secret policy: exercise exact CLI invocation against a disposable project, partial update failure, initialization refusal and retained-session redeploy. No live env/secret test is claimed yet.
3. Once Marketplace terms are complete, provision one isolated free state resource, explicitly verify project/team before writes, map credentials privately, and run setup→admin→publish→redeploy plus static assets and cold-start checks on actual Vercel. Never repeat provisioning after a partially successful response without resource discovery.
4. P2: remove deployment-specific IDs from reusable CF template safely; wire native KV/R2 first through existing contracts and resource provisioners, then selected queue/vector/email capabilities with explicit readiness and account-eligibility tests.
5. Finish shared pre-/post-deploy Bindings UX and override persistence. State changes need migration/backup semantics; profile updates cannot overwrite saved selections.
6. P5: exact public button and clean-checkout acceptance, upgrades/restore/security/conformance evidence, documentation and measured support claims. Deno stays deferred.

No new work in the dispatched translation stream or deployment to Study in USA staging is included.


## Later native KV checkpoint — 2026-10-20

[Native KV delivery](frontbase-deployment-native-kv-20261020.md) supersedes earlier D1-only/cache-unavailable statements for the bounded new Worker/D1/KV path. The actual disposable install, native cache card and real app cache write pass; existing registry/HTTP overrides and tenant isolation remain. R2, durable reuse/redeploy/resume and complete button/form acceptance remain next; earlier historical receipts do not imply those gates passed.
