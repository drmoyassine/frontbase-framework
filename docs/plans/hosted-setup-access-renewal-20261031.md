# Hosted setup access renewal — October 31, 2026

Status (2026-11-01): **IMPLEMENTED; SOURCE QUALIFIED; VERCEL LIVE RENEWAL PASS; CF POSITIVE RENEWAL OPEN**. Owner now authorizes executing the renewal and CF/Vercel fresh-install acceptance, leaving consent/password-dependent steps until the end. The original baseline and intended requirements below are retained as history. Do not equate the implementation/security tests with completed live renewal. See [current acceptance receipt](onboarding-final-acceptance-20261101.md).

## November 1 provider-contract amendment and live result

This checkpoint supersedes the Vercel fresh-management-grant requirement below. The real external Integration install UI disables an already-installed team, and Marketplace SSO rejected this external configuration. The owner separately approved identity-only Sign in with Vercel. Implemented `f43323ef` verifies a fresh OIDC subject and currently confirmed OWNER membership of the exact team through the retained integration's existing Team Read permission, then exact project/origin/native-root proof before writing an access generation. PKCE, fixed RS256/JWKS issuer/audience/nonce/time verification, expiring one-use tickets and existing receiver/cookie/CSRF guards remain mandatory. Identity tokens never become deployment credentials. No viewer/member promotion; incomplete/over-100 member directories refuse. CF still requires a fresh management grant for its write.

The operator registers the exact `<relay-origin>/setup-owner/vercel/callback` and sets `FRONTBASE_VERCEL_OWNER_CLIENT_ID` server-side. The current production registration uses `openid` only, public-client PKCE and no client secret. Confidential registrations may configure `FRONTBASE_VERCEL_OWNER_CLIENT_SECRET` in server secrets; never put it in Git or client configuration. The wizard advertises renewal only when the relay's bounded `/setup-owner/vercel/status` reports availability.

Production relay version `945e82ab-ec39-47ff-b1c5-99204667aa64` is deployed. The owner consented to the identity-only login, and real renewal returned `frontbase-accept-vercel-261101a` to its existing owned Bindings wizard with claims/roots/grants preserved. Its later normal cookie expiry occurred before Apply; this is not fresh activation proof. CF positive pre-install renewal and remaining live invalidation/negative cases stay open. [Current receipts and exact continuation](onboarding-final-acceptance-20261101.md) are authoritative; source tests alone do not close those gates.

## November 1 implementation

The stable native root continues to encrypt grants/journal state and derive runtime keys. Renewable one-hour capabilities and fifteen-minute cookies carry a separate generation. Encrypted, context-bound, create-only numbered records in the existing vault invalidate all earlier links/cookies without rotating that root. Simultaneous writes have one winner; uncertain/lost writes do not repeat. Renewal is capped at 24 generations and retains existing relay abuse controls.

The shared native-cloud wizard offers **Renew setup access** only when its host advertises support. Fresh provider OAuth uses the existing enrolled receiver, PKCE/ticket/cookie protocol and exact configured target. Ownership checks bind account/team, Worker/project, canonical origin, installation identity and native claim/root. Crucially the access-record write uses the visitor's fresh grant, not the app's retained management grant: read-only viewers cannot inherit provisioning authority. No new provider scope or parallel credential vault is introduced.

Only empty/reviewed operations qualify; applying, uncertain and active installations refuse renewal. CF uses its immutable metadata primitive and guards phase within the append; Vercel uses a unique integration-owned environment-variable create, with phase reinspection before/after. Neither path invokes native claim, resource creation, Apply or deployment activation. Old legacy-D1 and Docker setup paths are preserved but do not advertise this native-cloud renewal. A provider failure or raced state stops without replay.

The UI distinguishes access expiry, missing session, network failure and unexpected responses, preserves its form while displaying recovery, and carries only nonsecret selection references through OAuth. Private capabilities remain fragments, removed promptly; credentials never enter the saved draft. Recovery/ordinary connection cookies are distinct and clear each other's stale browser flow.

Qualification: workspace check/build and client no-leak passed; existing hosted-bootstrap, native-cloud and OAuth relay/receiver functional/mutation gates passed. `pnpm test:setup-renewal` adds expired/current/previous capabilities and cookies, encrypted/context-bound storage, simultaneous/lost writes, fresh provider edit authority, exact owner/alias/claim checks, held/installed refusal, nonsecret UI drafts and eleven behavioral mutations. Exact live gaps and later receipts belong in the linked acceptance record.

## Baseline before the November 1 implementation (historical)

- The native claim creates a private deployment-owner capability with a one-hour lifetime (`examples/cf-full/src/native-claim.ts`).
- Redeeming it creates an origin/context-bound Secure, HttpOnly, SameSite=Strict bootstrap cookie for at most fifteen minutes, bounded by the capability expiry (`packages/backend/src/hosted-bootstrap.ts`). The session is not sliding on ordinary reads.
- The hosted client removes the capability fragment from the address bar. A subsequently copied address is not the complete original private link. Reopening the original link can restore an expired browser session only while that capability remains valid and setup is still eligible.
- The hosted client's opening catch currently shows “Open the private setup link provided by your deployment. If it has expired, ask the deployment owner to renew it.” for different failures. That text alone does not establish expiry: missing authorization, refusals, network failure or an invalid response can lead to it (`scripts/deployment-setup/hosted-app.js`).
- There is no complete supported renewal flow for this native hosted bindings wizard. The managed Vercel `--setup-link` option concerns first-administrator setup; `deploy:recover` concerns existing administrator password recovery. Neither is this missing bindings-wizard renewal operation.
- The bootstrap owner secret currently signs the owner cookie and is also used in bootstrap encryption/key derivation. Changing it manually is not a safe renewal recipe: encrypted grants/journal state and derived runtime credentials must remain readable and consistent.

## Intended owner experience

Show **Renew setup access** when authorization is missing or expired, with distinct explanations for expired browser session, expired owner link, denied ownership, temporary unavailability and an already installed application. A configured installation should direct the user to administrator login/recovery, not reopen first-install provisioning. Preserve any in-memory form entries while recovery is attempted; do not persist credentials to browser storage.

Renewal uses the existing provider authorization and exact-target ownership verification patterns. Authenticate through the relevant provider and prove management access to the existing account/team, project/Worker, canonical origin and installation identity. A grant already present in the app does not prove that the visitor owns it. The public application URL alone is never sufficient. Do not require the user to create/paste management tokens or expose a manual setup-token field.

After proof, inspect the existing durable operation before issuing access. Renew the access capability, not the installation, provider grant or provisioning operation. A reviewed operation can resume under its existing rules; applying/uncertain states remain fenced and expose only the existing supported status/reconciliation path. Installed state refuses bootstrap renewal. Recovery must not call the initial create-only native claim again.

## Security and persistence contract

1. Bind a short-lived, unguessable recovery transaction to provider, target, canonical origin and installation. Reuse server-side state/PKCE/CSRF and verified callback/receiver controls. Reject cross-account, wrong-project, wrong-origin, tampered or stale transactions. Never accept a caller-supplied arbitrary callback/receiver URL.
2. Separate renewable access credentials/session generation from stable vault/journal encryption material. Preserve existing metadata, selected resources, encrypted Connected Accounts, operation identity and stable derived keys. If an adapter migration is necessary, define and test it before writing; do not rotate the current root secret blindly.
3. Use the existing durable provider journal/metadata atomic primitives to issue a new capability generation and invalidate earlier links/sessions. Competing renewals must not create multiple valid generations. Unknown/lost write outcomes require inspection/reconciliation and must not trigger another provisioning or claim write.
4. Keep secret capabilities out of public metadata, provider/referrer logs, query strings, analytics, status bodies, screenshots and Git. Deliver only to the verified owner through the established private fragment/cookie pattern; strip the fragment promptly and use no-store/no-referrer. No management credentials enter the browser handoff.
5. Add bounded rate/abuse controls and token-safe audit events. Public responses must not disclose tenant/account inventories, secret values or provider error bodies. Use actionable fixed error codes and messages; distinguish expiry, ownership refusal, installed-state refusal, held operation and transport/service failures instead of `http_403` or a generic expiry diagnosis.
6. Preserve zero-resource pre-Apply behavior. Renewal must not allocate a coordinator D1, new application bindings or another deployment installation. Retain legacy D1-journal compatibility and the independent local/direct self-hosted path.

## Implementation and acceptance order

1. Define the recovery state machine and reusable backend contract, including generation invalidation and provider-specific atomic updates. Reuse the existing OAuth receiver, exact-target verifier, owner session and journal interfaces; avoid a parallel authentication/provisioning system.
2. Implement server-side verification/issuance, then the clean hosted-wizard recovery control and specific error mapping. Do not advertise the control as functional until its backend is ready.
3. Add functional and existing-style mutation/conformance gates: missing/expired session; valid/expired/previous-generation owner link; attacker with only the URL; wrong account/project/origin; replay; simultaneous renewals; lost writes; denied/expired provider grant; active/uncertain operation; installed state; no-leak; no resource/claim/provisioning replay. Verify drafts and encrypted state survive.
4. Verify a disposable native CF metadata installation and native Vercel installation through real provider/browser renewal, including expiry, old-session invalidation and post-renewal resume. Where the same wizard is advertised for Docker, qualify its actual owner proof separately; do not imply native-cloud provider consent certifies Docker.
5. Run required workspace check/build and affected security/mutation suites. Record exact source, operation/resource identities and live results. Then execute the separate fresh uninterrupted main-README Vercel acceptance journey, including publication and normal Git upgrade.

Exit: a deployment owner can regain setup access through a documented supported flow without secret pasting, bespoke recovery routes, state reset, grant loss or repeated provisioning. Anonymous visitors and previous capabilities remain refused. This closes a recovery defect, not the broader Developer Preview distribution or independent-account service qualification gates.

## Original recording evidence (historical)

This is a documentation-only record based on inspection of the three source files above and the managed command boundaries. No application tests, provider changes, setup renewal, deployment or token rotation were performed for this record. Implementation and live evidence remain open. Preserve the unrelated generated `examples/cf-full/api/cms.mjs` diff.

Current next task: complete real provider-consent renewal on disposable native CF/Vercel apps, then fresh optional-binding Apply and uninterrupted README-to-publication/upgrade acceptance. Keep assisted and uninterrupted evidence separate. The [current acceptance receipt](onboarding-final-acceptance-20261101.md), [overall plan](frontbase-public-release-finalization-20261024.md#current-checkpoint--2026-10-31) and [Vercel acceptance checklist](vercel-native-browser-acceptance-20261031.md#next-run-checklist) track these gates.
