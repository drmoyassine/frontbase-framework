# Cloudflare native build credential handoff — 2026-10-31

Status: IMPLEMENTED AND LOCALLY VERIFIED; fresh live acceptance is credential-blocked. Owner requests a single initial Cloudflare authorization, secure build-to-runtime credential handoff, an already-connected wizard, fresh live acceptance and commit/push. Work is isolated on `codex/cloudflare-native-credential-handoff-20261031`, based on reviewed `3cef245f`.

Reuse the existing native claim hook, encrypted bootstrap grant, durable D1 coordinator, hosted wizard owner capability, activation journal and one-time Connected Accounts import. The build credential remains server-side and travels only through provider secret bindings. A deployment-owner setup link still gates the public installer; possession of a public Worker URL is never ownership. Existing OAuth, Vercel and activated-install upgrade paths remain compatible.

Verify required account/Workers/D1/KV access before provisioning. Document the initial build-token permissions and explicitly diagnose absent permissions; a token cannot widen its own privileges. Optional-resource permissions are selected according to the services enabled. Reuse existing conformance and mutation checks, add meaningful handoff/security faults, run workspace check/build and a fresh live installation through activation/account import/publication/persistence. Do not claim live acceptance from fixtures. Preserve other worktrees and the untracked operator relay config.

## Delivered behavior

- `deploy-native-cloudflare.mjs` checks for a persistent build API token and required account/Workers/D1/KV read access before deploying the initial installer. Permission errors are fixed messages; provider bodies and credentials are not reflected. Read probes do not prove edit rights. The provider independently checks each subsequent write.
- The existing native claim hook accepts a server-only build owner capability, rechecks exact Worker/account/installation identity, creates the unique fixed D1 coordinator and writes the provider credential only as a Worker secret. The bootstrap grant is encrypted with the private owner key. Competing or uncertain creations are not retried or adopted.
- The private setup link opens the existing hosted wizard already connected to Cloudflare. The public URL has no setup authority. `--setup-link-file PATH` uses create-only private-file output for CLI automation. The manual setup-token input is removed from the shared hosted page.
- Activation preserves the existing journal/CAS flow, re-encrypts the connection with the app session key and uses the established one-time Connected Accounts importer. Optional server-probed Vectorize capability propagates through status and encrypted account metadata; only matching grants resolve that binding. Baseline OAuth without Vectorize capability retains its former separate-token path.
- Existing Vercel/OAuth and activated-native-upgrade behavior is retained. A build-token installation does not falsely claim OAuth receiver enrollment; account credential replacement uses existing Connected Accounts management.
- Initial scopes still belong to Cloudflare's native build-token selection. The documented defaults omit some permissions needed by this app; Frontbase cannot silently grant D1/Vectorize privileges or customize that provider-owned token form. Select the suitably scoped token during step 1; the deployer diagnoses missing access before provisioning.

## Verification — Node 22.23.4 / pnpm 10.15.1

| Check | Result |
| --- | --- |
| `pnpm -r build` | PASS; CF gzip 776.2 KiB, Vercel 1026.2 KiB, no prohibited client symbols. Existing chunk warnings retained. |
| `pnpm -r check` | PASS. |
| `pnpm run test:native-cloud-setup` | PASS; native claim/ownership/uncertainty, server-only secret handoff, hidden token entry and 6/6 handoff faults. |
| `node examples/cf-full/test/hosted-cloud.mjs` | PASS; seven real-SQLite/provider-fixture journeys, including the imported build-token grant, connected status, concurrent activation, encrypted runtime grant and closed installer. This is not live Cloudflare acceptance. |
| `node examples/cf-full/test/hosted-cloud-mutation.mjs` | PASS; 5/5 ownership, binding, completion, asset and receiver-secret faults. |
| `pnpm run test:provider-oauth` | PASS; account import/deletion/restart, tenant/CSRF/origin/encryption/expiry and 16/16 faults including Vectorize capability refusal. |
| `pnpm --filter @frontbase/console test:deployment-bindings` | PASS; 32/32 tests across three files, including no duplicate Connect/token field for retained grants. |
| `pnpm run test:hosted-bootstrap` | PASS on the initial handoff candidate; retained storage-independent owner gates, Docker/journal and SQL admission faults. Final capability changes are covered by the final cloud and OAuth runs above. |
| Native build metadata, hidden snapshot settings, native settings preservation and deployment-button suites | PASS; existing source refs/hidden fields and active D1/KV/secret identities retained. |
| Read-only live `--plan-only` with the available CLI login | Expected refusal: persistent API token required. No Worker, database or key was created. |

The first sandboxed build could not resolve the workspace because of filesystem restrictions; the reviewed unsandboxed Node 22 build passed. Node 26 was detected initially and was not used for acceptance. Locked dependency installation was repeated with required network permissions after the sandboxed download failed; no dependency or lockfile change was made.

## Live blocker and exact resumption

The existing Cloudflare CLI login is OAuth, with no API-token-management permission. A read-only request for token permission groups returns HTTP 403/code 9109. The Cloudflare browser session is signed out. The repository has no Cloudflare CI deployment secret. Do not copy the short-lived CLI OAuth access token under a false `api_token` label to bypass the new persistent-credential gate.

The owner has a pending sign-in request in the opened Cloudflare API Tokens tab. After sign-in, prepare a test-only persistent token limited to the intended account and Account Settings Read, Workers Scripts Edit, D1 Edit and Workers KV Storage Edit (optional Vectorize Read/Edit). Complete any required action-time approval at credential creation. Store its value privately and use it only in the isolated fresh installation; never put it in chat/Git or provider URLs. There were eight D1 databases at read-only inspection, so two slots were free; no fixture deletion is required from that inventory.

The proposed isolated Worker is `frontbase-handoff-261031`; it has not been created. In this worktree `.frontbase/native-live.json` contains the local nonsecret native test config, and the ignored `.frontbase/` directory is available for private receipts. Run the native deployer with the build token in its private process environment and `--setup-link-file` pointing to a new private file. Open the resulting owner link, confirm Cloudflare already connected without OAuth, review/activate D1/KV, create a test administrator through the permitted test channel, publish a fixture page, verify anonymous delivery/private denial/account import, then upgrade from the same native source and confirm retained identities/session/content. Record exact resource IDs, source/artifact identity, success/failure and any remaining gates. The existing Study-in-USA deployments and production relay were not modified.

Fresh native-button import, real build-token secret transfer, live administrator/publication/upgrade acceptance and end-to-end closure remain OPEN. This candidate must not be represented as live-verified or merged to the default button source on the strength of local fixtures.
