# Provider bindings in setup

The shared editor separates provider authorization from selected runtime resources. Discovery and Review are read-only. Apply owns resource creation and activation through the existing durable journal; an unknown outcome requires inspection, never another automatic create.

| Binding | Hosted Cloudflare | Hosted Vercel | Selection and credentials |
| --- | --- | --- | --- |
| State | D1 or existing HTTP adapters | Existing HTTP adapters | Supabase project/schema; connected CF account/D1; native D1 create/reuse. |
| Cache | Native KV or Upstash Redis | Upstash Redis | Connected CF namespace or Upstash database; manual Redis REST URL/token remains supported. |
| Storage | Native R2, R2 over S3 HTTPS, Supabase Storage, generic S3 | R2 over S3 HTTPS, Supabase Storage, generic S3 | Private Supabase bucket; CF bucket. R2 S3 mode still needs S3 access keys, which are distinct from the Cloudflare management grant. |
| Queue | Cloudflare Queues or QStash | QStash | Native queue create/reuse; QStash regional account. QStash endpoint, token and both signing keys stay together. |
| Vector | Vectorize or existing libSQL adapter | Same HTTP adapters | Connected Cloudflare account/index; legacy manual credentials remain supported. |

Availability is constrained by the executor. In particular Cloudflare's native Queue producer/consumer is supported by hosted Apply, not advertised by the local Wrangler executor. R2 discovery and native activation currently address the default jurisdiction. Generic S3 endpoints remain available for other operator-configured storage.

## Connections and resource lists

Cloudflare's native build handoff retains the authorized provider account. A sufficient existing grant is reused; a second connection is not requested merely to populate a dropdown. D1, KV, R2, Queue and Vectorize inventories use bounded, fixed-origin calls with an account-membership check. Pagination follows the provider's page/cursor format. A failed list shows a retry and permission guidance; it does not silently become an empty inventory.

Supabase Storage uses the existing Supabase connection, project discovery and REST storage adapter. Only private, supported bucket identifiers are offered. Apply resolves a server key privately through the Management API; it never puts that key in the browser or exported plan. Modern secret keys use `apikey` only; legacy JWT server keys retain their compatible headers. The server key can have project-wide authority. Installation/tenant path namespaces constrain application operations, not the provider key's underlying authority.

Upstash Redis and QStash use one Connect Upstash provider. The documented partner OAuth flow requires a registered client; the button is offered only when the operator has configured that client. Redis and regional QStash resources are discovered server-side. Runtime tokens/signing keys are materialized only for the selected resource during Apply. The OAuth identity grant is exchanged for a generated developer API key, its management access is verified, and the temporary identity/refresh tokens are discarded. Connected Accounts retains that developer authorization encrypted until revoked; disconnect/revoke the generated developer key in Upstash when retiring a connection. Native Upstash accounts are required by Upstash's Developer API; Marketplace-created accounts can have different management availability.

For self-hosted direct OAuth configure `FRONTBASE_UPSTASH_OAUTH_CLIENT_ID`, optional confidential `FRONTBASE_UPSTASH_OAUTH_CLIENT_SECRET`, and registered callback `<installation-origin>/api/provider-oauth/upstash/callback`. The default scopes are `openid email offline_access` with audience `upstash-api`. A relay operator instead configures these on its relay; Frontbase's production callback is `https://oauth.frontbase.dev/api/provider-oauth/upstash/callback`. This registration is pending; implementation/fixture acceptance is not a live Upstash acceptance claim.

## Safe reuse and file operations

Native R2 reuse refuses a bucket with r2.dev/custom public access. Native Queue reuse requires an unused queue and never replaces another application's consumers or producers. Name validation and reuse checks run during Review before a selected state database can be created. Apply rechecks the selected resources and preserves uncertain-write safeguards.

Native Queue events reach the same authenticated, tenant-scoped job receiver used by HTTP queues. Successful delivery is acknowledged; failures retry. Existing idempotency and execution-tenant checks remain in that receiver.

Supabase file operations reuse the existing Storage REST adapter. Deployment files occupy an installation/tenant prefix in the selected private bucket; physical bucket management is disabled. Object replacement and Supabase UUID listings are normalized for the shared file browser. Authenticated server uploads work. Direct Supabase upload grants are unavailable on this deployment binding because Supabase fixes their lifetime at two hours, exceeding the deployment's one-hour cap. Signed downloads remain capped at one hour. This restriction does not disable the normal file uploader.

## What survives a reload

Connected provider authorization is encrypted and retained on the installation. Apply securely stores the chosen runtime configuration on the target host. Manually entered credentials before Apply live only in browser memory and require re-entry after reload. Exported plans and saved wizard drafts contain references, not credentials. The old blanket statement that every credential disappears after reload no longer describes connected-account bindings.

## Verification and remaining provider actions

See [the delivery record](../plans/binding-provider-discovery-20261101.md) for exact checks and live limits. Production Upstash client registration/consent, any additional Cloudflare OAuth scopes, and fresh native acceptance of these new optional resources remain separate authorization-dependent steps. Existing provider registrations are not silently widened.

Primary provider contracts: [Upstash partnership OAuth](https://upstash.com/docs/redis/help/integration), [Developer API authentication](https://upstash.com/docs/devops/developer-api/authentication), [QStash regions](https://upstash.com/docs/qstash/howto/multi-region), [Supabase API-key headers](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase signed-upload lifetime](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [Cloudflare Queue inventory](https://developers.cloudflare.com/api/resources/queues/methods/list/), [R2 cursor pagination](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/).
