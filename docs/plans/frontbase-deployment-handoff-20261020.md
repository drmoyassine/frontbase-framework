# Reviewed deployment handoff — 2026-10-20

Status: bounded local setup→new Cloudflare Worker/new D1 execution verified. Continues [P1/P2](frontbase-deployment-profiles-20261020.md) after `7b0a7d1`; implementation `9a365ca`, generated synchronization `b0c622a`; this is not complete editable-profile, deployment-button, reuse/redeploy or host-parity acceptance. No Study in USA staging change.

## Implemented path and reuse

```sh
pnpm -r build
pnpm run deploy:setup -- --target cloudflare --environment preview --deploy --app-name my-new-frontbase --account-id YOUR_CLOUDFLARE_ACCOUNT_ID
```

Wrangler login is required. Open the private loopback link, review the exact account/Worker/D1 names, disable unavailable optional bindings, validate, then choose **Deploy reviewed bindings**. Without `--deploy`, the setup remains configuration-only. Vercel setup remains configuration-only; execution there is refused until its integration is accepted.

The bridge calls the existing compiler `deployCommand`, `workerExists` and D1 provisioner through an injected Wrangler runner. It does not duplicate the compiler's provisioning/setup-secret/deploy lifecycle. It generates a temporary app-scoped Wrangler config, copies a reviewed build snapshot and never edits the committed configuration containing older cloud IDs. The temporary config has only the selected account, native D1, static assets and required runtime module configuration; Hyperdrive and shared deployment IDs are absent.

Initial execution supports a new named Worker and a new D1 named `<worker>-db`, with optional roles disabled. A per-executor capability descriptor filters provider/resource-action dropdowns in execution mode. Generic configuration-only mode retains its broader compatible-adapter list; this bounded executor is not provider lock-in. Server-side execution policy independently refuses unsupported bindings or resource names even if a client bypasses the form.

## Execution controls

- Context fixes account, Worker, environment and the artifact fingerprint before review. The digest covers Worker/runtime module and staged assets; both source and copied snapshot are checked before provider writes.
- Exact origin/session and current random review identity are required. Editing invalidates the prior review. The private handoff is consumed before dispatch, and one local session permits only one attempt, including an uncertain failure. Concurrent deployment or preparation is refused once dispatch begins.
- Existing Worker/database and unknown existence results are refused. The compiler's failed-create lookup fallback is fenced so a create collision cannot silently adopt existing data. Mutation commands are restricted to the selected stage/account/name.
- Secrets use the existing compiler stdin path; no secret values are placed in command arguments, journal, source config or normal API responses. The private administrator setup link is delivered only to the local terminal/callback, not the normal browser deployment response.
- Response/reload state contains a public URL/status and the executed nonsecret choices. It cannot recover credentials or re-enable a completed attempt.
- Failure preserves resources and a nonsecret temporary receipt. Closing the page, stopping the process or local session expiry cannot guarantee rollback/cancellation of an already dispatched provider operation. Inspect the receipt before recovery; automatic retry/resume is not implemented.

This does not certify a cross-process/account-wide deployment lock or Cloudflare compare-and-swap behavior. Concurrent operators targeting the same name and partial-install recovery need the later provisioning identity/resume work. No automatic deletion of resources is performed.

## Actual disposable Cloudflare delivery

Account selected explicitly: `680ebc4bf03302798e6c0d870c08ed8d`. New resources:

- Worker `frontbase-bindings-test-20261020` at `https://frontbase-bindings-test-20261020.studygram-inc.workers.dev`.
- D1 `frontbase-bindings-test-20261020-db`.

The real loopback API claimed a session, validated a D1-only review and invoked the real compiler/Wrangler executor. Local claim/review/deploy return200; repeated dispatch returns409. Actual provider command trace shows absent Worker/D1 preflight, successful new D1 creation, three successful secret uploads and successful Worker deployment. No existing service, custom domain, paid-plan activation, translation destination or Study in USA staging was changed.

| Remote check | Result |
|---|---|
| Fresh setup status | 200, needsSetup=true |
| Anonymous pages / unclaimed initialization | 401 / 403 |
| Generated setup claim / first administrator | 200 / 200 |
| Repeated initialization | 410 |
| Sign-in / authenticated pages | 200 / 200 |
| Page creation / publication / public page | 201 / 200 / 200 |
| Another first-install attempt against existing Worker | Refused |
| Published page and authenticated state after refusal | Both retained,200 |

Only freshly generated credentials for this disposable deployment were used. Raw provider trace, new setup capability and disposable test credentials are private task artifacts outside Git. An unnecessary attempt to read an older private claim artifact was blocked by automatic review; source inspection supplied the request contract instead. No blocked credential was accessed.

Resources and nonsecret temporary receipts remain identifiable for later cleanup. No claim of zero metered usage is made. Reuse, redeployment, migration, native cache/storage and actual host deployment buttons were not accepted by this flow.

## Verification

- Full workspace build and type checks pass; existing no-leak and backend response conformance pass (257 conforming operations,77 verified refusals, zero violations/unreachable). Logs: `profile-handoff-build.log`, `profile-handoff-check.log`, `profile-handoff-conformance.log` in private task evidence.
- Existing bootstrap transport/isolation/concurrency/expiry suite and eight faults pass. New execution review/origin/expiry/private-response/one-attempt tests pass.
- The real compiler with fake Wrangler verifies isolated config, exact mutation target, existing/unknown resource refusal, failed-create collision refusal, unsupported adapter refusal, artifact change refusal and stdin-only secrets with no stage persistence.
- Ten additional execution faults are detected; transformed unmodified server/executor baselines first pass, avoiding false positives from test-module rewriting. Production source is unchanged by fault injection.
- Native browser verification uses a clearly labelled simulated callback, separately from the real deployment above: supported provider/action filtering, validation enabling deploy, locked fields after execution and preserved choices/status after reload pass. Screenshot `profile-handoff-ui-simulated.png` is UI evidence, not a provider receipt.
- Repeated full builds again differ by four strict directives in the tracked CMS artifact; removing those directives produces identical bytes. The generated artifact is synchronized, but byte-for-byte build reproducibility remains a release observation, not a claim closed by this slice.

No runtime package/backend/worker source changes were required; only local setup tooling, tests, generated synchronization and documentation are owned here. Broader release and paused CF-22 gates are unchanged.

## Next executable work

1. Wire existing native KV cache and native R2 storage contracts/provisioning, then verify them on the disposable target before enabling defaults.
2. Add durable resource identities and reviewed reuse/redeploy/resume with state preservation and controlled migration. Do not reinterpret an existing-resource refusal as permission to replace it.
3. Unify post-deploy configuration with the shared form model and prove the actual native deployment-button sequence.
4. Complete real Vercel state integration and the same journey when its Marketplace setup is available. Deno remains deferred.
