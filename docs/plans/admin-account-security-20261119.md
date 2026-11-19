# Administrator account and security rollout

## What is implemented

- My account lets a local owner, master admin or team admin change their own password. The account lookup uses the signed-in identity and tenant. The new password and session revocation commit together on state adapters with atomic writes. Sign in again after the change.
- Email changes require the current password and a single-use code sent to the new address. The code expires after 15 minutes. After confirmation, Frontbase keeps the account ID and role, revokes existing sessions and attempts to notify the old address. The built-in flow is for Frontbase-managed credentials. Accounts managed by an external identity provider use its account settings.
- The Security panel shows headers observed on an uncached request for the console and marks the existing WAF, bot and IP-blocklist preferences as saved configuration. Cloudflare Access and zone WAF, Vercel Firewall and Deployment Protection, and Docker ingress controls are configured at those hosts.
- Passkeys are optional for self-hosted admins on the fixed HTTPS origin in FRONTBASE_PUBLIC_ORIGIN. A passkey is enrolled after current-password verification. Owners can enroll a second key, remove a key, and still sign in with their password. The browser challenge expires after five minutes and is consumed once. The configured origin must match the real console origin.

## Release order

1. Configure an authorized Cloudflare Email Service sender for Study-in-USA, or configure Resend or a custom API when unrestricted delivery is needed on Workers Free. Use myassine@studygram.me as the test inbox. Confirm message delivery and a complete recovery with a disposable admin before changing an existing account.
2. Validate the Security view and passkeys on the actual CF, Vercel and Docker runtimes. Separately qualify the live host firewall controls before describing them as installed. A passkey enrolled for a preview hostname does not qualify the production hostname.
3. After account and sign-in verification, roll out the persistent Edit site switch and bidirectional site/console navigation. Verify Arabic and English on phone and desktop.

Magic links remain a separate follow-up that needs verified mail delivery and single-use sign-in tokens.


## Transactional mail configuration

Set `FRONTBASE_PUBLIC_ORIGIN` to the installation's exact HTTPS origin. Frontbase uses it to build account reset links. Configure one of the following transports for administrator password reset and email changes.

| Host | Preferred transport | Configuration |
| --- | --- | --- |
| Cloudflare Workers | Cloudflare Email Service | Add the `FRONTBASE_EMAIL` binding and set `FRONTBASE_MAIL_FROM` to an authorized sender address. |
| Vercel | Resend through Vercel Marketplace | Set `RESEND_API_KEY` and `RESEND_FROM`. The integration supplies the key. Use a sender on a verified domain. |
| Docker / Node | Resend or custom API | Set the corresponding environment variables in the deployment. |

On Workers, attach an Email Sending binding in the dashboard or add this to the deployment's Wrangler configuration. Restrict the binding to the installation's sender where supported.

```toml
[[send_email]]
name = "FRONTBASE_EMAIL"
```

Workers Free can send to addresses already verified as Cloudflare account destinations. Sending to arbitrary addresses, including an arbitrary new sign-in address, requires Workers Paid and an onboarded sender domain. A verified test inbox proves delivery to that inbox only. An existing Free deployment can use Resend or a custom API for unrestricted delivery while remaining on Workers Free. [Cloudflare Email Service](https://developers.cloudflare.com/email-service/) | [Binding configuration](https://developers.cloudflare.com/email-service/configuration/send-bindings/) | [Resend for Vercel](https://vercel.com/marketplace/resend)

An explicit custom API overrides either default. Set `FRONTBASE_MAIL_API_URL`, `FRONTBASE_MAIL_FROM`, and the deployment secret `FRONTBASE_MAIL_API_TOKEN`. The endpoint accepts a JSON `POST` with `from`, `to`, `subject`, `text`, and `html` strings and a bearer authorization header. The endpoint must use HTTPS and return a 2xx status on acceptance. Use an adapter endpoint if the mail vendor expects a different contract. Frontbase refuses redirects. An incomplete custom API configuration disables account delivery until corrected. A delivery failure never sends the same reset link or code to a different provider. Keep all mail API routing and credentials in deployment configuration.

## Administrator recovery setup

Fresh self-hosted installations with a configured HTTPS public origin require recovery setup at the first console sign-in. Binding provisioning remains in the existing deployment wizard. The temporary pre-enrollment session can read identity and complete recovery setup. All other authenticated console APIs and editor access are gated server-side. An installed mail adapter only makes mailbox confirmation available. The administrator must enter the code received in their current sign-in inbox to finish using email.

If mail is unavailable, scan the setup QR code with a time-based authenticator app. Open **Enter setup key manually** if scanning is unavailable. Save the eight single-use codes offline and enter a fresh six-digit code. Frontbase generates the QR code locally in the enrollment screen. Frontbase stores the authenticator key encrypted and the recovery codes as hashes. Enrollment invalidates earlier sessions. Password sign-in and sensitive account changes then require a fresh authenticator code. An existing, user-verified passkey remains a sign-in option.

To reset a forgotten password, open **Forgot password → Use a recovery code**. Enter one unused offline code and verify with an enrolled passkey or a fresh authenticator code. The passkey must verify the user on the installation origin and use a challenge issued for recovery. Frontbase consumes the recovery code, changes the password and invalidates existing sessions. Email reset is unavailable for authenticator-enrolled accounts. An email address change still requires receiving a code at the new inbox. Keep the authenticator and offline codes in separate places. Lost-factor operator recovery remains a follow-up. [NIST account recovery guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#account-recovery)

In **My account → Recovery codes**, generate a new set, save it offline, then confirm with your current password and a fresh authenticator code. Frontbase replaces the old set only after confirmation. Existing installations keep their sign-in and may enroll from **My account**. Cloud-managed identity retains its existing provider policy. The no-email flow requires an atomic state adapter. Cloudflare Workers and the shared Vercel and Node runtimes use the same policy.

## Verification

Local SQLite tests cover same-origin credential changes, existing session rejection, current-password verification, isolated email confirmation, and challenge reuse rejection. Chrome with virtual authenticators covers enrolling two passkeys, signing in, rejecting a replay, removing a passkey, and signing back in with a password. The live Worker was checked for mail bindings. Neither the key nor sender is configured. No production account was modified.

## Study-in-USA rollout

The code build from commit `2e75f421` is at 100% on Workers version `e8e66351-6c23-44a1-b91a-c4743af590ec`. The staged preview and production both returned 200 for health and the English and Arabic homepages. Public HTML returned `Cache-Control: no-store`. The anonymous account endpoint returned 401. All 15 bindings matched the previous version, including the existing `studygram-state` binding. The established owner signed in and My account confirmed authenticator enrollment is available and optional.

Cloudflare accepted the registration of the requested Workers Free test inbox. Destination confirmation is still pending. The application has no production mail binding at this checkpoint. No plan upgrade was requested or performed.

For rollback, the preceding Worker version is `5812b1b7-82c0-4c7d-9ded-a831d7fa228b`. That binary predates MFA enforcement. After any production account enrolls, keep the administrator entry points restricted during a rollback that uses that binary.

The compatibility follow-up in `66d9a689` serves a successful unavailable status where an installation has no HTTPS MFA capability. It fixed the original GitHub dashboard acceptance failure and passed the same targeted Chromium test locally. The updated artifact is live at 100% on Worker version `07c34246-ed71-496d-bd7c-c4bf49519a46`. Production binding parity, owner sign-in, My account, unauthorized authentication, health, and both no-store homepages passed again.

A disposable live Worker and D1 verified first-run enrollment, password plus authenticator sign-in, password recovery, replay rejection, old-session invalidation, and sign-in with the new password. Cloudflare confirmed both disposable resources absent after cleanup. Two focused fault tests also proved that the local suite detects a missing authenticator check and a reusable recovery code.

### Workers Free email delivery test

Cloudflare verified the recipient after the owner confirmed its verification email. Version `af0d0912-48a6-47f9-8d88-3414591238a9` now serves all Study-in-USA traffic. It adds a native `FRONTBASE_EMAIL` binding limited to `myassine@studygram.me` and the sender `noreply@frontbase.dev`. All 15 existing bindings were preserved. Health, anonymous authentication rejection, both no-store homepages, and owner sign-in passed. The native adapter accepted one Frontbase verification message from the staged Worker. The owner account address remained unchanged and the temporary verification code was retired. Cloudflare recorded the matching outbound message as delivered at 11:20:51 a.m. Kuwait time on 2026-11-19. The event confirms acceptance by the recipient mail server.

GitHub run `44475618743` failed because the historical Pages upgrade test still expected migration 26 to be the last migration. Commit `593cb507` updates the fixture to check all current pending migrations. The focused test passed all 15 groups and [replacement run 44486770286](https://github.com/drmoyassine/frontbase-framework/actions/runs/44486770286) succeeded, including the full mutation gate.
