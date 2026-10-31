# Native provider connections — October 31, 2026

Owner scope: promote the verified Cloudflare credential handoff, make Vercel retain its initial Deploy Button integration authorization, verify Connect Supabase, and merge verified repairs into main. This is bounded onboarding acceptance, not Frontbase GA, general provider parity or an independent-account certification.

## Latest checkpoint — source promoted, fresh browser completion open

Main `1ea8d226` now includes the locally qualified stale-native-page repair `033f496b`; remote ancestry, exact source and README source-contract verification pass. Cloudflare's later no-coordinator repair is also merged and natively qualified; see its [separate final receipt](cloudflare-metadata-bootstrap-20261031.md). Existing connected-account and publication results below retain their recorded revisions.

The subsequent actual standard-Chrome README run completed the Vercel integration popup/return and both native Git/handoff builds without a CLI upload. It exposed a stale native page during authorized runtime replacement, repaired by bounded read-only routing through the existing protected owner session. The previous popup visibility limitation is historical, not the current unresolved diagnosis. Fresh repaired activation, administrator creation, publication and uninterrupted browser/upgrade evidence remain open in the [current browser checklist](vercel-native-browser-acceptance-20261031.md#next-run-checklist). A diagnostic refresh and local mutation success do not close that gate.

## Delivered protocol

Cloudflare retains the selected persistent build API token as a runtime secret and imports it once into encrypted Connected Accounts. The private deployment-owner capability remains required; a public Worker address proves no ownership. For additional OAuth providers, a separate private receiver verifier stays in the installation. The optional relay reads only its public fingerprint from the canonical managed runtime and makes a bounded, create-only receiver registration. It never receives the CF build API token. Recognized older build-token installs receive receiver configuration on upgrade without replacing their resources, credentials, session or existing receiver settings.

Vercel's native button requests the existing Frontbase integration during initial project creation. Build OIDC remains identity metadata, never management authorization. A distinct callback exchanges the integration-bound code server-side, verifies team/configuration and binds the grant to an encrypted, HttpOnly, ten-minute continuation. Already-installed configurations without a code use a separate state-bound external authorization. No indefinite central grant cache is introduced. Project permissions are checked before completion; excluded projects receive a Manage Access/Continue step and are never silently authorized by Frontbase.

A same-origin completion POST verifies the fresh project, READY production deployment, exact canonical alias and zero-state runtime before consuming the continuation, reserving the existing durable create-only project claim and invoking the existing native installation hook. Grants become encrypted runtime secrets, then encrypted Connected Accounts after activation. Repeat receipt reads do not repeat writes; an unknown write result stays fenced. Installed-app reconnect continues to require its existing authenticated protocol.

## Actual failure and repairs

The owner's native project `frontbase-integration-2x61031b` imported and built successfully, but completion failed because Vercel's v13 deployment response supplies `ownerId`, not necessarily `teamId`. The verifier now accepts the actual `ownerId` shape and the legacy `teamId` shape while retaining exact owner/project/production/alias checks. A wrong-owner mutation is detected. That older test remains unclaimed; no reset, adoption or provider-write replay was attempted.

Vercel also returns a team/configuration-specific integration-installed continuation. Validation now supports that exact route as well as its project-creation routes, with the OAuth-verified team slug and integration configuration bound. Completion supports both deployment-url and deploymentUrl query spellings. Query-free refresh derives only the public canonical alias from the verified project or receipt; no owner capability or grant enters HTML/status responses. Fixed refusal codes explain missing identity, expired continuation, permissions, code exchange, freshness and deployment mismatch without reflecting provider bodies.

A separate activation readiness defect surfaced: the page discarded its URL fragment and waited only three minutes for the provider rebuild. It now keeps the capability in page memory, uses bounded requests and a ten-minute deadline, offers readiness-only retry without redeployment, and stops uncertain initialization with a direct setup link. It does not persist the capability in browser storage or repeat native provisioning.

Production relay version: `dd59f696-eaee-4db5-9bcc-db2b221dd160` (Vercel verifier, refresh and fixed diagnostics). Registered client secrets stayed provider-side. No new scopes, integration registration, source-database changes or paid plans were introduced.

## Live evidence

| Surface | Exact result |
| --- | --- |
| Native CF `frontbase-native-handoff-261031` | Existing D1 `61405998-3d19-43e5-98c9-0790c9b29d56`, KV `07cc89a1b85f4f7e8978b889c4242b1d`, session, closed setup and published page preserved. Four receiver entries added as provider secrets; existing secret identities unchanged. |
| Supabase on that CF fixture | Actual consent, encrypted retention, UI Test connection and read-only project discovery PASS (two projects). Exactly one encrypted CF and one encrypted Supabase provider row. No schemas/source records changed. |
| Fresh Vercel `frontbase-integration-261031c` | Native initial integration callback and encrypted continuation PASS; corrected owner-bound finish invokes native claim and retains the grant. Test project `prj_5k6Qdcl4hXXxM2doYpEbz1GDVJPE`, installation `2d2c1eef-a5d2-4b44-808e-80ad8f853387`. |
| Vercel activation | Approved empty $0 Turso resource `store_6Sa1RX9zVpVWErnU` (`fb-native-oauth-261031b`) reused for c production. Standard protected owner setup/review/apply PASS; app reaches fresh administrator setup. |
| Vercel application | Synthetic test administrator and login 200; fixture creation 201, publication 200 and public page 200. Anonymous pages API 401, repeat setup 410. Exactly one encrypted Vercel provider row. Installed-account API retest and UI Test connection PASS; browser shows Connected / Encrypted / Connection verified. |
| Upgrade | PASS: main merge `2b7b0725`, deployment `dpl_6xaB4eYMNicCZo6Dp12tfdZRweDo` READY with matching provider gitCommitSha. Existing session, page, public delivery, closed setup and encrypted Vercel account preserved; provider retest PASS. The earlier Codex-authored upgrade was blocked by Vercel’s Hobby author policy and left the working app intact. Merging through the authenticated GitHub owner resolved it; attribution and policy were not altered. |

**Native browser boundary:** the owner proved a real native import/build on `frontbase-integration-2x61031b`. The automation browser does not expose Vercel's integration popup/opener return; c required a CLI source upload after its genuine native integration callback. The completion and activation handoff were not replaced with CLI credential injection. The three-minute activation timeout required retrieving only c's bootstrap owner capability privately and invoking that same app's standard protected claim API; no management grant was read. Thus corrected initial-authorization retention and the application lifecycle are live-qualified, but a fresh uninterrupted native popup → build → activation run in a standard browser is still a distinct UI regression check. Do not describe c as an uninterrupted one-click run.

The temporary public-metadata popup experiment was retired because it did not repair the provider return. No speculative Vercel postMessage/opener emulation or permission widening remains. The older test projects and their data were not deleted. Private operator files contain credentials/owner links and remain ignored outside Git.

## Verification

- Required final `pnpm -r check` and `pnpm -r build`: PASS including the readiness repair.
- `test:provider-oauth-relay`: PASS, including SQLite conformance, 12 receiver faults, 25 existing relay faults, 15 Vercel faults, relay bundle and production-mode checks.
- `test:provider-oauth`: PASS with its existing mutation gates.
- Final native handoff/claim, six build-token faults, manifest, readiness and hosted handoff tests: PASS.
- Native activation behavioral tests: PASS for build longer than three minutes, ten-minute deadline, bounded requests, missing capability, readiness-only retry and initialization refusal without replay.
- Five hosted activation faults and native button contract: PASS. Actual remote main-source preflight PASS (`source: main`, no failures), including the initial Vercel integration and CF credential handoff.

## Remaining boundaries

1. Engineering delivery, main merge/push, exact-source upgrade and remote README preflight are complete. Protocol repair `92520541`, bounded readiness repair `b6a0bfdb`, acceptance docs `cfc5c31c`, authenticated-owner merge `2b7b0725`. Private diagnostic tail stopped. No uncommitted implementation is intentionally left.
2. Uninterrupted repaired Vercel onboarding remains open under the latest checkpoint above. Real standard-Chrome popup/return and Git builds now have evidence; the stale-page repair needs a fresh automatic wizard return followed by UI activation/publication and upgrade. Do not replay a claimed/uncertain operation or relabel the older CLI-assisted c run as clean native proof.
3. Independent customer accounts, general relay refresh/rotation/recovery operations, real Docker OAuth consent, paid/optional provider breadth and public package/release gates remain separate. Existing local/direct-client self-hosting stays available without the hosted relay.
