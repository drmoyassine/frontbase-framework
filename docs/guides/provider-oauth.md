# Provider OAuth connections

The shared hosted wizard and installed Connected Accounts support direct Cloudflare OAuth and Vercel Integration authorization, or an explicitly configured optional callback relay. Fresh native Cloudflare and Vercel deployments have passed with the isolated relay, including real consent, activation, publication and upgrades. The main README buttons still use the earlier defaults; the isolated relay is not a general public service. See the [live acceptance evidence](../plans/provider-oauth-relay-20261027.md).

## Configure the OAuth client

Set `FRONTBASE_PUBLIC_ORIGIN` to the exact installation origin. Register its callback with the provider and configure the application server:

| Variable | Purpose |
| --- | --- |
| `FRONTBASE_CLOUDFLARE_OAUTH_CLIENT_ID` | Registered Cloudflare client ID |
| `FRONTBASE_CLOUDFLARE_OAUTH_SCOPES` | Space-separated registered scopes |
| `FRONTBASE_CLOUDFLARE_OAUTH_CLIENT_SECRET` | Optional confidential-client secret; omit for a public PKCE client |
| `FRONTBASE_VERCEL_OAUTH_CLIENT_ID` | Vercel Integration client ID |
| `FRONTBASE_VERCEL_OAUTH_CLIENT_SECRET` | Integration server secret |
| `FRONTBASE_VERCEL_OAUTH_INTEGRATION_SLUG` | Registered integration slug |
| `FRONTBASE_VERCEL_OAUTH_TEAM_SLUG` | Optional owner/allowed team slug for a private Integration dashboard entry |

Callbacks are `/api/provider-oauth/cloudflare/callback` and `/api/provider-oauth/vercel/callback` on that exact origin. Credentials and private client secrets are runtime server configuration, never browser configuration or Git content. Vercel identity-only sign-in is not a deployment management connection. Its Integration needs the team/project/environment/deployment permissions appropriate to the operations performed; a successful account read alone does not certify every provisioning permission. Cloudflare scopes must include account discovery and the selected resource operations. Operator registrations and provider consent are not implied by configuring an ID.

Cloudflare registration and protocol: https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/ and https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/ . Vercel integration protocol: https://vercel.com/docs/integrations/create-integration/vercel-api-integrations and https://vercel.com/docs/integrations/create-integration/submit-integration .

## Connection behavior

The shared Bindings form shows one Cloudflare connection control when an active Cloudflare resource is selected, including D1/Vectorize HTTP adapters on other hosts. Removing the last such binding removes the control. A Vercel Marketplace selection similarly requires Vercel. Management authorization for the deployment host is a separate prerequisite of hosted activation, even when all selected runtime services use other providers.

The installed app connects through Settings → Connected Accounts → Connect Provider. Unconfigured OAuth clients preserve the existing manual provider connection flow. Authorization returns through a minimal callback document and a same-origin POST so existing Strict session cookies can be used. Only authorization codes visit the browser; access and refresh tokens are exchanged server-side. The server rechecks the initiating administrator, tenant, cookie, request origin, expiry and single-use transaction before exchanging a code. Cloudflare uses S256 PKCE. A failed exchange requires reconnecting; callbacks are not replayed.

Setup connections use a durable encrypted vault: Cloudflare's fixed coordinator, create-only encrypted Vercel environment records, or a private Docker volume. Activation re-encrypts the handoff with the application's session key and imports accounts once into the existing tenant-scoped Connected Accounts vault. An import marker prevents a subsequent restart from restoring an account the administrator deleted. Reserved binding references are resolved privately by the server and checked against the authorized account and expiry. Tokens never enter the binding manifest or browser credential snapshot. Settings selected before connection are restored from a nonsecret session manifest; manually entered keys must be re-entered after navigation.

Native D1/KV bindings keep working without a management connection. HTTP adapters using a connected account require valid authorization. Expiry is exposed as reconnect-required; automatic refresh is not claimed. Deleting a connection removes its active application reference; provider revocation is required to invalidate grants retained in historical deployments or encrypted setup handoff copies. No remote integration uninstall is performed implicitly.

## Optional private relay

The owner-approved isolated relay is implemented in [examples/oauth-relay](../../examples/oauth-relay/README.md). It retains registered client secrets on the relay server and hands an expiring encrypted grant to a specifically admitted installation through a receiver-bound, one-use server exchange. The installed app and hosted CF/Vercel/Docker wizard reuse the same owner checks and encrypted provider stores. Direct per-origin clients remain available without a relay.

Set `FRONTBASE_OAUTH_RELAY_URL` to the relay's exact HTTPS origin and `FRONTBASE_OAUTH_RELAY_TARGET` to `{"origin":"https://your-installation.example","host":"cloudflare","purpose":"connect"}` (host may instead be `vercel` or `docker`). The relay operator must explicitly enroll that origin. These values are trusted server configuration, never browser input. A configured relay selects the relay protocol; without it, the direct-client path remains unchanged. Cloudflare receivers require `global_fetch_strictly_public` when fetching a relay Worker. The managed CF configuration generator includes it; custom/native configurations must preserve it explicitly. See [Cloudflare fetch guidance](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

Private Vercel Integrations expose an owner/allowed-team dashboard entry while the external marketplace page returns 404. The optional team slug selects that dashboard entry, but its popup return is unverified. The owner explicitly approved Unlisted visibility for the isolated test registration: it is hidden from search/browse, but direct-link visitors can request installation. The external-install route later became available and real consent, encrypted handoff and provider testing passed for the approved test projects. No callback-state checks were relaxed. A visibility change requires the operator's deliberate approval; it is not an automatic workaround.

Relay tickets last at most two minutes, pending records at most ten minutes, and consumed credential rows are deleted atomically. The receiving server independently checks its authenticated owner, original cookie, tenant, subject, origin, target and expiry before storing a grant. SQL limits, a bounded keyed-IP rate window and scheduled cleanup constrain the isolated example. Active-row deletion does not erase provider/hosting database backups. The relay's privacy/license notices describe the isolated service; they do not promise a public hosted service or override Apache-2.0/provider terms.

## Remaining native entry work

The main README buttons still point to the earlier setup snapshot. A separate native snapshot has passed fresh Cloudflare and Vercel button → consent → bindings → activation → administrator → publication and Git-upgrade checks with the isolated relay. Zero-state entries verify the Worker or ready Vercel project/deployment/alias through that relay. Native ticket redemption reserves a create-only account/project/production claim before establishing the owner capability. Claims require operator inspection and explicit reset for uncertain recovery.

The isolated relay is restricted to its configured Cloudflare account, Vercel team and enrolled reconnect origins. It cannot safely be promoted for arbitrary customers by changing button links alone. Production needs independent cross-account ownership and reconnect proof, public provider registrations, operational and privacy controls, and fresh multi-account security and deployment evidence. Docker's setup/publication/restart path has been tested; a real Docker OAuth consent flow has not. See [the production readiness assessment](../plans/provider-oauth-production-readiness-20261027.md).
