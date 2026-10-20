# Configurable deployment profiles — 2026-10-20

Status: P0/P1 implementation in progress. Shared data contracts and local host corrections are verified; a disposable Cloudflare D1 install passes setup, publication and redeployment. A local pre-deployment Bindings review now runs without a database; a bounded new Worker/new D1 execution now passes on Cloudflare. Generic adapter provisioning, reuse/redeploy, shared post-deploy integration and live Vercel acceptance remain open. See the [implementation receipt](frontbase-deployment-profiles-p0-p1-20261020.md). Priority: Cloudflare Workers first, Vercel second. Deno remains documented/deferred; do not remove existing support or imply fresh acceptance.

## Accepted experience

Choose a deployment target → open Bindings with recommended defaults → keep or replace each provider using compatible-adapter dropdowns → select/create a resource and enter required credentials → validate and review provisioning → deploy → complete secure first-admin setup.

Profiles are versioned starting configurations, not provider lock-in. Users can select any implemented adapter compatible with the target runtime and required capability. Unimplemented candidates must not appear as working options. Optional capabilities can be disabled; required ones must have valid configurations. Explicit selections survive profile updates and redeployments. Replacing a state database is a migration, not a dropdown side effect.

The setup screen must run before the application database exists and without a mandatory hosted Frontbase control plane. Reuse the existing Bindings forms and validation logic as shared presentational/schema modules; do not depend on an authenticated console API or read provider secrets into a normal browser-visible configuration response. A deployable static/local setup frontend can submit credentials to an authenticated ephemeral setup backend or local CLI process; the exact host/button bootstrap mechanism is an implementation decision to prove in P1. Never introduce a publicly accessible provisioning proxy.

Host-specific button constraints must be respected: reuse host-native resource/integration selection where available and supply a Frontbase setup step where needed. Do not describe a post-boot page as pre-deployment setup, or boot on an ephemeral database merely to show that page. Native and CLI flows must consume the same validated plan even if their visual steps differ.

## Reuse and current evidence

- [README deployment paths](../../README.md): three buttons and per-host scripts exist. Fresh live CF/Vercel deployment acceptance has not been established in this planning session.
- `examples/cf-full/src/state-db.ts`: shared state resolver; D1 native, D1 REST, remote libSQL and host-specific existing PostgreSQL path. Managed PostgreSQL availability alone does not make it an accepted state binding.
- `packages/backend/src/compat/system-services.ts`: existing default registry > environment > fallback resolution for cache/queue/vector. Preserve user-default precedence and expand the shared path rather than adding a competing resolver.
- `packages/edge-infra/src/index.ts`: existing provider, cache, queue/workflow, storage, vector, vault and executor contracts. Reuse canonical core contracts; native host adapters belong in existing package responsibilities.
- Existing Edge Resources/Bindings/reconfigure UI, Connected Accounts, guarded external HTTP and secure credential resolvers are the integration points.
- `scripts/deploy.mjs`, `scripts/deploy-vercel.mjs`, `scripts/deploy-deno.mjs`, `scripts/verify-host-artifact.mjs` and current host smoke/config tests provide build/setup/artifact seams to extend.

Source findings to reproduce: public Wrangler configuration includes deployment-specific D1/Hyperdrive IDs and declares no KV/R2/Vectorize defaults; Vercel/Deno require external state configuration; Vercel intentionally uses Node after a recorded Edge hang; both external-host deploy scripts generate SETUP_EXPIRES_AT but omit it from their upload allowlist; Deno uses deployctl/older APIs and discovery assumes has_kv=true. These are inspected-code findings, not a complete live failure diagnosis.

## Capability catalogue

This is the intended full logical surface. Existing contracts may combine some roles; split only where differing semantics require it. Availability, adapter implementation, provisioning and verified operation must be tracked separately.

| Role | CF mapping | Vercel mapping | Deno reference, deferred |
|---|---|---|---|
| State database | D1 | Existing Turso HTTP initially; other relational adapter only after acceptance | Existing remote SQL; attached PostgreSQL needs supported adapter |
| Content datasources | D1 and existing connectors | Existing/Marketplace connectors | Existing/attached connectors |
| Application KV/cache | Workers KV | HTTP Redis/Upstash integration | Attached Deno KV, adapter required |
| HTTP response cache | Workers Cache API/CDN | CDN cache | CDN cache |
| Object storage | R2 native binding, adapter required | Blob native product, adapter required; supported HTTP storage override | S3-compatible HTTP |
| Vector index | Vectorize | Implemented compatible HTTP vector adapter; integration candidates require validation | Compatible external adapter |
| Queue delivery | Queues + dead-letter handling, adapter required | Native Queues Beta candidate or existing QStash | External queue; current Deploy has no native queue |
| Durable execution | Workflows adapter to existing Frontbase execution contract | Workflows candidate adapter | Existing engine and supported delivery |
| Scheduled triggers | Cron Triggers | Cron Jobs | Deno.cron |
| Coordination/realtime state | Durable Objects when semantics require | Transactional store/external coordinator | Verified KV atomic/store operations |
| Outbound email | Email Service binding, conditional readiness | Existing/external HTTP email adapter | External HTTP email |
| Inbound email | Email Routing/Email Worker → existing channel intake | Authenticated provider webhook | Authenticated provider webhook |
| Text generation | Workers AI candidate + configured providers | AI Gateway/configured providers | Configured HTTP providers |
| Embeddings | Workers AI candidate + configured providers | Gateway/configured providers | Configured HTTP providers |
| AI gateway | CF AI Gateway, optional | Vercel AI Gateway, optional | External gateway, optional |
| Secrets injection | Worker secrets; optional Secrets Store | Sensitive environment configuration | Environment/secrets |
| Abuse throttling | Rate Limiting binding | Platform/app controls with verified semantics | Supported app adapter |
| Bot verification | Turnstile, optional | BotID candidate or compatible provider | Compatible provider |
| Logs/traces/metrics | Workers observability; optional Analytics Engine events | Vercel Observability | Native observability |
| Static assets | Workers Static Assets | Static/CDN delivery | Asset delivery |
| Internal services | Service bindings or authenticated HTTP | Authenticated HTTP | Authenticated HTTP |

App Users auth/session/permission contracts remain Frontbase concerns, not replacements by platform access controls. Translation destination is a datasource selection, optionally separate, not another database product hardwired into deployment. Native resource bindings are allowed; portable external transport stays HTTP, without adding TCP-only dependencies to portable profiles.

Cache is not a lock or accounting database. Queue delivery is not the workflow engine. Vectors do not generate embeddings. Provider/host workflow integration must preserve existing execution identity, recovery, isolation and observable history; do not run a second independent workflow truth store.

## Profile and binding contracts

Define target/runtime, profile ID/version and per-role recommendations, required/optional status, compatible adapter IDs, capability constraints, provisioning choices and activation prerequisites. A binding instance records explicit provider/resource references, validated nonsecret configuration, secret references, application/project/environment scope and origin (recommended/user override). Credential values are never serialized into source manifests, URLs, logs or normal console responses.

Use explicit readiness states: disabled, needs setup, validating, ready, degraded or unsupported. Separately record provenance (native binding, managed integration or external service), adapter maturity and verification evidence. A discovered resource or rendered card is not proof of operation.

Resolution: explicit supported user override > saved deployment binding > selected versioned profile recommendation. Reconcile with existing adopted-default > env resolution without changing current projects implicitly. Profile recommendations alone cannot override a saved explicit choice. Upgrades show a reviewed diff, not silently reprovision resources. Production/preview receive isolated resource namespaces and credentials by default.

Provisioning plans contain create/reuse/connect/disable operations, dependencies, target environment, least-privilege requirements, eligibility/cost notices and safe resumable identifiers. Validate before mutation; retry idempotently and preserve existing resources on failure. Never auto-delete shared or preexisting resources as rollback. State migration requires backup, verification, explicit switching and a predecessor; cache/index rebuilding has distinct semantics.

## Cloudflare recommendation

Core: D1, Static Assets, Workers KV, response caching and observability. Recommend R2 uploads, Queues, recovery Cron and abuse throttling, subject to adapter readiness/account eligibility. Offer Vectorize, AI/embeddings, Workflows, Durable Objects, email, Turnstile and Analytics Engine when their feature/setup is selected. Native resources should be provisioned/reused directly rather than requiring broad management API keys in the application runtime.

Email Service is the recommended CF outbound adapter after domain readiness, not silently enabled arbitrary delivery. Configure verified domain/From/Reply-To, sender/recipient restrictions, current account allowance, delivery events and suppressions. Reuse one delivery adapter for workflow mail, invitations, notifications and supported password-reset paths. Keep existing alternate providers selectable. Inbound routing is separate; do not modify MX/DNS or existing mail routing without exact reviewed authorization.

## Delivery milestones

| Phase | Work | Exit evidence |
|---|---|---|
| P0 — in progress | Isolated clean-checkout CF/Vercel audit; classify existing contracts/adapters/provisioners, buttons and host failures | Capability/evidence ledger; reproducible local and credential-gated failures; no inferred live pass |
| P1 — partial | Shared typed profile, binding, provisioning and secure bootstrap contracts; determine viable native-button sequence | Compatible-adapter filtering, required-field validation, stable overrides and no-database setup proof; no secret leaks or mandatory hosted control plane |
| P2 | Implement CF defaults and native adapters/provisioning; remove deployment IDs from reusable self-host template while retaining existing cloud config safely | Fresh-account/project setup→admin→publish, upload/cache/selected queue/vector/email checks, restart/redeploy persistence and account-eligibility outcomes |
| P3 | Repair Vercel Node path, required state integration, assets/routes, setup expiry and lifecycle-safe background work; integrate supported selected adapters | Same functional journey on actual Vercel; preview/production isolation, cold starts, runtime limits and durable recovery |
| P4 | Shared pre-deploy and post-deploy Bindings UI, tests and explicit resource-change lifecycle | Both paths resolve the same configuration; dropdowns show implemented compatible providers; native/resource and external credential fields behave correctly |
| P5 | Fresh button/CLI acceptance, clean-install docs, upgrades and release-claim reconciliation | Exact source/artifact/config/resource receipts; restore/rollback, security/conformance gates; README states measured target support |
| Deferred | Deno migration to current platform and profile acceptance | Preserve existing boundary; no effort priority or parity claim implied |

P0/P1 start before broad adapters. P4 form/schema extraction may occur earlier when necessary for secure bootstrap; retain end-to-end vertical delivery rather than building a UI after incompatible scripts. Add no package simply to house profiles; choose existing package ownership from dependency evidence.

## Verification and parallel ownership

Use an isolated worktree/branch for implementation and disposable CF/Vercel resources; do not use Study in USA staging. The dispatched translation agent owns its 1–14 stream and production/staging acceptance. Avoid its translation/backend/editor files where possible; coordinate shared `worker.ts`, backend composition, package exports and roadmap edits through durable claims before touching them. No message to another chat is implied by this plan.

Run `pnpm -r check`, `pnpm -r build`, appropriate existing host/artifact/setup and security/mutation/conformance/no-leak gates after code changes. Verify setup expiry, secret persistence across cold starts, invalid/partial configuration, same-tenant resource isolation, concurrency, idempotent provisioning and no write replay. Credential-gated host operations must be labelled unrun until actually exercised; fake adapters/local builds do not certify deployment buttons.

Record per-role four states independently: product available, adapter implemented, provisioning implemented, end-to-end verified. Do not promise unlimited free operation; validate current eligibility and present nonsecret cost/limits information before resource activation. Existing release gates, one-engine architecture, accepted package boundary and paused CF-22 remain unchanged.

## Primary research references

Checked 2026-10-20; revalidate account eligibility, limits, API/tool versions and beta status during implementation.

- [CF automatic provisioning](https://developers.cloudflare.com/workers/platform/deploy-buttons/), [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [rate limiting semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- [CF Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/), [pricing/recipient restrictions](https://developers.cloudflare.com/email-service/platform/pricing/). Sending is Beta; arbitrary recipients require Workers Paid; verified destinations are supported free; onboarding requires Cloudflare DNS.
- [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage), [button integrations](https://vercel.com/docs/deploy-button/integrations), [Queues Beta](https://vercel.com/docs/queues), [Workflows](https://vercel.com/docs/workflows).
- [Current Deno capabilities](https://docs.deno.com/deploy/), [databases](https://docs.deno.com/deploy/reference/databases/), [CLI](https://docs.deno.com/runtime/reference/cli/deploy/), [Classic sunset](https://docs.deno.com/deploy/classic/kv_on_deploy/).

## Original planning verification

This change is documentation-only. Local link and whitespace checks are the appropriate fresh checks; workspace builds/tests, real host deployments, DNS changes, email sends, resource provisioning and spend are not run or claimed by this receipt. Next executable task is P0 in an isolated worktree, followed by P1 bootstrap/profile contracts.

## Implementation checkpoint — 2026-10-20

The [P0/P1 receipt](frontbase-deployment-profiles-p0-p1-20261020.md) records exact verified boundaries and next tasks. Cloudflare CLI login and disposable D1 setup/publication/redeploy are verified. Vercel local Node export/routing/lifecycle checks pass; the isolated free Turso database is not provisioned because Marketplace terms acceptance is still required. No existing Vercel project or Study in USA staging was changed. Profile contracts are data-only and do not yet drive either deploy script. Native KV recommendations remain blocked until runtime wiring exists; selecting a disabled optional binding permits a D1-only plan. P1/P2/P3 and button acceptance are not complete.

## P1 local setup review — implemented, bounded verification

[Bootstrap receipt](frontbase-deployment-bootstrap-20261020.md): a loopback-only ephemeral setup launcher uses the existing shared profile/adapter contract, one-time claim and HttpOnly session, strict host/origin checks, bounded JSON and private in-memory one-shot credentials. Browser review validates a D1-only choice without a database or resource operation. This closes the local transport/review slice only: automatic provisioning, shared post-deploy form integration and native deploy-button bootstrap remain open.

## P1 reviewed execution — bounded CF first-install verified

[Execution receipt](frontbase-deployment-handoff-20261020.md): explicit account/new Worker/new D1 context, artifact snapshot, current-review/one-attempt handoff and existing compiler reuse now pass actual disposable CF setup→admin→page publication. Native browser UI filtering/locking/reload is verified separately with a simulated callback. Optional native bindings, durable reuse/redeploy/resume, post-deploy form and actual host button integration remain open.


## Later native KV checkpoint — 2026-10-20

[Native KV delivery](frontbase-deployment-native-kv-20261020.md) supersedes earlier D1-only/cache-unavailable statements for the bounded new Worker/D1/KV path. The actual disposable install, native cache card and real app cache write pass; existing registry/HTTP overrides and tenant isolation remain. R2, durable reuse/redeploy/resume and complete button/form acceptance remain next; earlier historical receipts do not imply those gates passed.
