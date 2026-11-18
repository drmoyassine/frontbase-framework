# Administrator account and security rollout

## What is implemented

- My account lets a local owner, master admin or team admin change their own password. The account lookup uses the signed-in identity and tenant. The new password and session revocation commit together on state adapters with atomic writes. Sign in again after the change.
- Email changes require the current password and a single-use code sent to the new address. The code expires after 15 minutes. After confirmation, Frontbase keeps the account ID and role, revokes existing sessions and attempts to notify the old address. The built-in flow is for Frontbase-managed credentials. Accounts managed by an external identity provider use its account settings.
- The Security panel shows headers observed on an uncached request for the console and marks the existing WAF, bot and IP-blocklist preferences as saved configuration. Cloudflare Access and zone WAF, Vercel Firewall and Deployment Protection, and Docker ingress controls are configured at those hosts.
- Passkeys are optional for self-hosted admins on the fixed HTTPS origin in FRONTBASE_PUBLIC_ORIGIN. A passkey is enrolled after current-password verification. Owners can enroll a second key, remove a key, and still sign in with their password. The browser challenge expires after five minutes and is consumed once. The configured origin must match the real console origin.

## Release order

1. Configure Resend for Study-in-USA using RESEND_API_KEY and RESEND_FROM. The sender must be verified by Resend. Use myassine@studygram.me as the test inbox. Confirm message delivery and a complete recovery with a disposable admin before changing an existing account.
2. Validate the Security view and passkeys on the actual CF, Vercel and Docker runtimes. Separately qualify the live host firewall controls before describing them as installed. A passkey enrolled for a preview hostname does not qualify the production hostname.
3. After account and sign-in verification, roll out the persistent Edit site switch and bidirectional site/console navigation. Verify Arabic and English on phone and desktop.

Magic links need verified mail delivery and single-use sign-in token handling. Authenticator-app codes need a shared enforcement point for all password login routes plus recovery codes. They are separate follow-ups. Retain the existing password login and recovery until end-to-end passkey recovery is verified.

## Verification

Local SQLite tests cover same-origin credential changes, existing session rejection, current-password verification, isolated email confirmation, and challenge reuse rejection. Chrome with virtual authenticators covers enrolling two passkeys, signing in, rejecting a replay, removing a passkey, and signing back in with a password. The live Worker was checked for mail bindings. Neither the key nor sender is configured. No production account was modified.
