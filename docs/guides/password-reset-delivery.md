# Password reset on a self-hosted Frontbase instance

Reset mail is optional. To enable it on the full-CMS Cloudflare, Node/Docker or
Vercel host, configure runtime secrets/settings:

- `RESEND_API_KEY`: an existing authorized Resend account key.
- `RESEND_FROM`: a sender accepted by that account, preferably a verified domain.
- `FRONTBASE_PUBLIC_ORIGIN`: the instance's canonical HTTPS origin, for example
  `https://builder.example.com`. Do not include credentials, a path, query or fragment.

Self-hosted links use `/frontbase-admin/reset-password`; Frontbase Cloud retains
its own `/admin/reset-password` link. The link origin comes from operator
configuration, never the inbound Host or forwarded headers. Both key and explicit
origin are needed to enable self-host delivery. No mail provider is provisioned
and no operator key is copied into public settings.

Forgot-password responses remain non-enumerating when the address is unknown or
delivery fails. Tokens are stored only as hashes, expire, are single-use and
invalidate existing sessions after a successful password change. A provider
acceptance response does not prove inbox delivery. Before relying on reset for
an installation, send a reset to an owned test address, verify receipt/link
origin and complete a test reset. Keep the password and raw token out of logs
and evidence files. Do not change a real user's password for an acceptance test.

Backups and their matching encryption/session keys need separate operator custody.
A code rollback does not restore a password or undo token consumption. Use the
documented state recovery procedure for actual recovery and retain a second
authorized administrator while validating optional mail configuration.
