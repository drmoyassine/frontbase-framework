# Draft notices for the Frontbase OAuth relay

The owner approved these operator-facing texts on 2026-10-27. They are published at https://oauth.frontbase.dev/privacy and https://oauth.frontbase.dev/terms; they are not represented as legal advice.

## Privacy

Frontbase's OAuth relay helps a Frontbase installation connect to Cloudflare or Vercel. Contact: noreply@frontbase.dev.

When you connect, the relay processes the provider authorization code, selected account or team and project identifiers, the requested permissions, and the resulting provider credentials. It exchanges credentials on the server and sends them to the selected installation over an encrypted connection. Temporary relay records are encrypted and expire within ten minutes; handoff tickets expire within two minutes and successful redemption deletes the active ticket. Expired active records are removed by request and scheduled cleanup. Hosting-provider backups and Time Travel have separate retention, and deleting an active record does not erase those backups.

To prevent a second owner from claiming the same native installation, the relay retains a nonsecret record containing the provider project identity, installation identifier, recipient origin and a digest of the receiver proof. The relay uses a short-lived secure HttpOnly cookie and a keyed hash of the request IP for rate limiting. Cloudflare and the selected authorization provider may independently process request metadata under their own policies.

The selected Frontbase installation retains its provider connection in its encrypted Connected Accounts store. Disconnecting it in Frontbase does not automatically revoke the provider authorization or erase historical backups; revoke authorization at the provider to invalidate the grant. The relay does not request your Frontbase password. Contact us about the service or its records at the address above.

## Terms

The Frontbase framework software is available under the Apache License 2.0: https://github.com/drmoyassine/frontbase-framework/blob/main/LICENSE. Cloudflare, Vercel and any other connected providers have their own terms and permissions. Only connect installations, projects and accounts you are authorized to manage. This relay is operated as part of the Frontbase deployment experience; no paid plan or service-level commitment is represented by this notice. Contact: noreply@frontbase.dev.
