# Cloudflare native build credential handoff — 2026-10-31

Status: COMPLETE for the owner-account Cloudflare handoff request. Local qualification, fresh live CLI deployment and fresh native-button Git import/build/activation/publication/Git upgrade PASS. Runtime implementation is `79937749`; native snapshot `e159589d` retains that code. Work is isolated on `codex/cloudflare-native-credential-handoff-20261031`, based on reviewed `3cef245f`. Default-source merge/promotion, independent-account qualification and general public-release gates are separate.

Reuse the existing native claim hook, encrypted bootstrap grant, durable D1 coordinator, hosted wizard owner capability, activation journal and one-time Connected Accounts import. The build credential remains server-side and travels only through provider secret bindings. A deployment-owner setup link still gates the public installer; possession of a public Worker URL is never ownership. Existing OAuth, Vercel and activated-install upgrade paths remain compatible.

Verify required account/Workers/D1/KV access before provisioning. Document the initial build-token permissions and explicitly diagnose absent permissions; a token cannot widen its own privileges. Optional-resource permissions are selected according to the services enabled. Reuse existing conformance and mutation checks, add meaningful handoff/security faults, run workspace check/build and a fresh live installation through activation/account import/publication/persistence. Do not claim live acceptance from fixtures. Preserve other worktrees and the untracked operator relay config.

## Delivered behavior

- `deploy-native-cloudflare.mjs` checks for a persistent build API token and required account/Workers/D1/KV read access before deploying the initial installer. Permission errors are fixed messages; provider bodies and credentials are not reflected. Read probes do not prove edit rights. The provider independently checks each subsequent write.
- The existing native claim hook accepts a server-only build owner capability, rechecks exact Worker/account/installation identity, creates the unique fixed D1 coordinator and writes the provider credential only as a Worker secret. The bootstrap grant is encrypted with the private owner key. Competing or uncertain creations are not retried or adopted.
- The private setup link opens the existing hosted wizard already connected to Cloudflare. The public URL has no setup authority. `--setup-link-file PATH` uses create-only private-file output for CLI automation. The manual setup-token input is removed from the shared hosted page.
- Activation preserves the existing journal/CAS flow, re-encrypts the connection with the app session key and uses the established one-time Connected Accounts importer. Optional server-probed Vectorize capability propagates through status and encrypted account metadata; only matching grants resolve that binding. Baseline OAuth without Vectorize capability retains its former separate-token path.
- Existing Vercel/OAuth and activated-native-upgrade behavior is retained. A build-token installation does not falsely claim OAuth receiver enrollment; account credential replacement uses existing Connected Accounts management.
- Initial scopes still belong to Cloudflare's native build-token selection. Generated build tokens inspected in the owner's account on October 31 already included D1 and Vectorize. The absent runtime handoff is a separate defect; missing scopes must not be presumed. Frontbase cannot silently grant privileges or customize that provider-owned token form. Select a suitably scoped token during step 1; the deployer diagnoses missing access before provisioning.

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

## Live acceptance — October 31, 10:03–10:07 UTC

The owner signed in and approved creating temporary `frontbase-handoff-261031`, limited to Studygram Inc., Account Settings Read and Workers Scripts/D1/KV/Vectorize Edit, expiring November 1 at 13:00 Kuwait time. Its value was saved privately and never printed or committed. The same persistent API-token path is used by the native deployer; no short-lived CLI OAuth token was relabeled or copied into the app. The existing CLI OAuth login cannot manage API tokens (read-only HTTP403/9109); this did not block the approved browser-created test token.

| Live check | Result |
| --- | --- |
| Fresh `deploy-native-cloudflare.mjs --config .frontbase/native-live.json --setup-link-file …` | PASS; isolated Worker `frontbase-handoff-261031`, installation `f3c9dddc-4449-4060-82d2-82cb20a050a5`. Private owner link written to an ignored file. |
| Actual browser owner-link/wizard | PASS; Cloudflare already connected, D1 resources listed and the new setup DB selected. No second OAuth or token entry. |
| Standard configuration/review/apply API | PASS; review200, apply200/uncertain, then runtime healthy without replay. One initial readiness request returned500 during propagation; subsequent status200, protected setup and publication passed. |
| First administrator and login through normal protected APIs | PASS200/200; synthetic test credentials saved privately. |
| Create/publish/public delivery | PASS201/200/200; `/native-handoff-acceptance` renders the expected heading in the browser. |
| Anonymous admin API / second setup | PASS401/410. |
| Connected Accounts import/provider test | PASS; exactly one encrypted imported Cloudflare connection, `reconnectRequired:false`, optional Vectorize capability retained. Installed `/api/edge-providers/retest/:id` returns200/success. No provider token in public page or account-status responses. No actual Vectorize index use is claimed. |
| Native redeployment of the same source | PASS; session/page/public delivery200, bootstrap configuration410, one retained connection. Exact D1/KV and secret-binding names preserved. |

State D1 `22b3e10c-6d2b-4741-9b23-59883c9d1995` (`fb-setup-f3c9dddc-4449-4060-82d2-82cb20a050a5`); KV `10ef108ae8a04147878a7bf53a0f3766` (`frontbase-handoff-261031-cache`). Final upgrade deployment `dc080771-9617-407e-8ef3-4c1ae5dc1036`, version `a33281a7-2b3b-42fe-af86-14447c12563a`. Worker artifact SHA256 `2a23a180699ea7cce3f1fa69eea91eb35e9c10ff4e0ab74e6f06f06d86f406b5`; generated CMS artifact `58643c3aef4a0b2a7917c545721cbd1e4c02989b18ea6e712ce0823f476b93d4`. Operator scripts, cookies, synthetic credentials and private owner link remain ignored under `.frontbase/`. Existing Study-in-USA deployments and production relay were not modified.

## Exact native-button acceptance — October 31, 10:20–10:31 UTC

The owner approved the provider's broader generated build token and the native deployment was submitted. Cloudflare imported `drmoyassine/frontbase-native-handoff-261031` and completed actual `pnpm run build` / `pnpm run deploy` with no build variables or bootstrap/relay prompts. Its own private owner link opened the browser wizard with Cloudflare already connected and D1 discovery populated. No second OAuth consent or manual token entry occurred. The generated token remains in Cloudflare Builds and this test app's provider secrets/encrypted Connected Accounts; its value was neither read from the dashboard nor printed/committed.

Source provenance: immutable tag `frontbase-handoff-native-20261031b`, snapshot `e159589d` from receipt checkpoint `98bc8921`, imported Git commit `623fcbd4357f7fe631162e8a40e0bfb6f848b424`. The existing snapshot generator removes four upstream workflows only from the deployment copy and changes README button refs; source CI remains intact. Blob comparisons against the imported commit confirm all application code and build scripts match. Cloudflare rewrites only the root package/Worker name and omits three dotenv examples. The provider build used Node24.22.1/pnpm10.15.1 and succeeded with the existing package Node22 engine warning; local qualification used Node22.23.4. No Node24 runtime support claim is inferred from a successful Worker build.

| Native live check | Result |
| --- | --- |
| Native Git import/build | PASS; build `80c971ad-65d0-438d-b211-d3244b5bd434`, 1m31s. |
| Build-issued owner link/browser wizard | PASS; existing Cloudflare account inherited, new setup D1 selected, no second Connect step. |
| Review/activation/readiness | PASS200/200, initial activation uncertain then readiness200 without replay. |
| Protected first administrator/login | PASS200/200 through standard APIs; synthetic credentials private. Existing-account browser sign-in also reaches Dashboard. |
| Page creation/publication | PASS201/200; `/native-button-handoff-acceptance` anonymous200 and browser-rendered expected heading. |
| Anonymous admin API/second setup | PASS401/410. |
| Account import/provider test | Exactly one retained Cloudflare connection, no reconnect required, Vectorize capability metadata retained; installed provider test200/success before and after Git upgrade. Browser Settings → Connected Accounts shows Connected/Encrypted; Test connection displays Connection verified. No actual Vectorize index operation is claimed. |
| Actual Git-triggered upgrade | PASS; README-only test commit `0a1471a89ca220d7a88ef5c9d478d18dd759fa72`, build `bc0a01ea-95dd-40ac-afaf-8aabf0fcac4b`, 1m37s. Native deployer reports existing installation preserved. |
| Post-Git-upgrade persistence | Original API session/page/public delivery200, bootstrap410, one connection, exact D1/KV and secret-binding names unchanged. |

Native identities: installation `8d916153-7c55-4fc5-81e1-26e32bfa77ee`; D1 `61405998-3d19-43e5-98c9-0790c9b29d56` (`fb-setup-8d916153-7c55-4fc5-81e1-26e32bfa77ee`); KV `07cc89a1b85f4f7e8978b889c4242b1d` (`frontbase-native-handoff-261031-cache`). Final Git-upgrade deployment `3ab4e787-623c-426e-8cc9-ff361568527b`, version `347330c3-da45-4450-a7f0-f8c4e5d67af4`.

Cloudflare's Retry control did not show a new job; qualification therefore used the ordinary Git push path instead of inferring success. A stale dashboard token list briefly labeled the new build token unavailable; a full reload resolved the label, and the actual Git build succeeded. These observations do not imply a credential was recreated or permissions broadened again. Earlier unused tag `frontbase-handoff-native-20261031` omitted the workflow inventory and was superseded before any deployment; no tag was rewritten. The native picker excludes the custom token used by the first CLI fixture. Cloudflare's [build-token registration API](https://developers.cloudflare.com/api/resources/workers_builds/subresources/tokens/methods/create/) could register it with Workers CI Write, but the available CLI login lacks that registry permission (read-only403/10000), so the separately approved generated token was used.

The requested bounded handoff and fresh native acceptance are closed. The candidate branch is pushed; framework `main`, existing Study-in-USA deployments and the production OAuth relay remain untouched. Merging/promoting the candidate to default button source requires its normal integration review; independent-account/provider coverage and public-release qualification remain governed by their existing plan.
