# Provider OAuth connections

The shared hosted wizard and installed Connected Accounts support direct Cloudflare OAuth and Vercel Integration authorization. This is an opt-in self-hosted client path. It does not yet replace the native deployment buttons or establish an anonymous first-install ownership claim.

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

Callbacks are `/api/provider-oauth/cloudflare/callback` and `/api/provider-oauth/vercel/callback` on that exact origin. Credentials and private client secrets are runtime server configuration, never browser configuration or Git content. Vercel identity-only sign-in is not a deployment management connection. Its Integration needs the team/project/environment/deployment permissions appropriate to the operations performed; a successful account read alone does not certify every provisioning permission. Cloudflare scopes must include account discovery and the selected resource operations. Operator registrations and provider consent are not implied by configuring an ID.

Cloudflare registration and protocol: https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/ and https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/ . Vercel integration protocol: https://vercel.com/docs/integrations/create-integration/vercel-api-integrations and https://vercel.com/docs/integrations/create-integration/submit-integration .

## Connection behavior

The shared Bindings form shows one Cloudflare connection control when an active Cloudflare resource is selected, including D1/Vectorize HTTP adapters on other hosts. Removing the last such binding removes the control. A Vercel Marketplace selection similarly requires Vercel. Management authorization for the deployment host is a separate prerequisite of hosted activation, even when all selected runtime services use other providers.

The installed app connects through Settings → Connected Accounts → Connect Provider. Unconfigured OAuth clients preserve the existing manual provider connection flow. Authorization returns through a minimal callback document and a same-origin POST so existing Strict session cookies can be used. Only authorization codes visit the browser; access and refresh tokens are exchanged server-side. The server rechecks the initiating administrator, tenant, cookie, request origin, expiry and single-use transaction before exchanging a code. Cloudflare uses S256 PKCE. A failed exchange requires reconnecting; callbacks are not replayed.

Setup connections use a durable encrypted vault: Cloudflare's fixed coordinator, create-only encrypted Vercel environment records, or a private Docker volume. Activation re-encrypts the handoff with the application's session key and imports accounts once into the existing tenant-scoped Connected Accounts vault. An import marker prevents a subsequent restart from restoring an account the administrator deleted. Reserved binding references are resolved privately by the server and checked against the authorized account and expiry. Tokens never enter the binding manifest or browser credential snapshot. Settings selected before connection are restored from a nonsecret session manifest; manually entered keys must be re-entered after navigation.

Native D1/KV bindings keep working without a management connection. HTTP adapters using a connected account require valid authorization. Expiry is exposed as reconnect-required; automatic refresh is not claimed. Deleting a connection removes its active application reference; provider revocation is required to invalidate grants retained in historical deployments or encrypted setup handoff copies. No remote integration uninstall is performed implicitly.

## Remaining native entry work

The existing native buttons remain unchanged. Arbitrary new deployment origins cannot simply be added to one provider callback registration dynamically. A shared callback relay would receive provider authorization before an encrypted one-use handoff, so it is an additional sensitive service. Automatic approval review rejected implementing that service without specific approval of its destination and credential-handling architecture. No relay is deployed or included here. Fully self-hosted per-origin OAuth clients remain supported.

Before replacing the buttons: register and authorize the provider applications; approve or select a callback/handoff design for arbitrary deployment origins; prove control of the exact CF Worker/Vercel project before minting the installation owner capability; preserve installed bindings on subsequent native builds; and run a fresh button → provider consent → bindings → activation → administrator → publication journey on each host. Do not substitute existing-app upgrade or mocked provider tests for that acceptance.
