# Hosted Cloudflare and Vercel setup

The README buttons deploy the initial setup application without an application database. Cloudflare uses encrypted Worker metadata and secrets for setup; Vercel uses project environment metadata and secrets. New CF deployments do not create a coordinator D1.

## Administrator first

1. Open the private setup link provided by your deployment. It is required only to enroll the first administrator.
2. Enter your email, password and confirmation. Email is the current login identifier. The server uses the existing password hash; the plaintext password is not persisted.
3. Choose services. Wait for **Progress saved** before closing the page. Service choices, the selected section and manually entered service credentials are saved in the installation’s encrypted setup vault. The page warns before closing with an unsaved change and flushes pending progress when backgrounded.
4. Choose **Finish setup**. This still performs full Review of every enabled binding before the existing single-winner Apply operation. Resources are not provisioned while creating the administrator or saving a draft.
5. Sign in to Frontbase using the same administrator credentials when the site is ready.

## Leave and return

Return to `/frontbase-bootstrap/`. If the setup session has expired, sign in with the administrator email/password. This does not require the original private link or a second provider authorization. The server restores the saved configuration and section. Connected provider accounts remain in their existing encrypted vault.

If Finish setup was already submitted, returning setup checks the existing operation and application readiness. It does not call Apply again. An uncertain provider result remains held for inspection; signing in does not clear that safeguard. After completion, the setup landing redirects to normal Frontbase sign-in, while setup mutation endpoints remain closed.

If Finish is refused before setup starts, **Check installation status** restores the saved choices when Frontbase confirms that the same review never started. You can correct the choices and click Finish again.

Setup sign-in uses a 15-minute secure HttpOnly SameSite cookie scoped to the installation. Attempts are admitted through persistent provider metadata (ten per 15-minute window across instances). Failed credentials and cross-origin submissions never grant access. Provider errors fail closed.

## Credential lifecycle and compatibility

`FRONTBASE_PENDING_ADMINISTRATOR` holds the encrypted pending hash record. A separate `FRONTBASE_ADMINISTRATOR_HANDOFF`, encrypted for the final runtime, installs that same account through the existing first-administrator guard after database migrations. This separation keeps returning setup sign-in available while deployment is in progress. Existing users are never overwritten by an upgrade.

Healthy completion removes the pending administrator and handoff from current provider configuration and clears the encrypted draft. Immutable provider versions/deployments may retain historical encrypted values; current-variable removal is not historical erasure. Vercel removes variables from future deployments, not already running immutable deployments. Preserve `SESSION_SECRET`, application database credentials, installed manifest and selected resources during upgrades.

Legacy CF coordinator installations retain their former setup path; no automatic database reset, resource adoption or credential rotation occurs. Local CLI and Docker administrator setup are unchanged by this CF/Vercel increment.

## Verification boundary

The administrator-first/resume increment has local Chrome proofs against both real host handlers with simulated provider APIs, plus built-runtime account/login/upgrade tests. Fresh native Cloudflare and Vercel deployments also passed live enrollment, sign-in to restore the draft and one provisioning operation. [Live acceptance receipt](../plans/admin-first-live-acceptance-20261108.md). See the [current release plan](../plans/frontbase-public-release-finalization-20261024.md).
