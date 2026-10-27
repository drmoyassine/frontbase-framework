# Optional private OAuth relay

This is a separately deployed, operator-managed callback service. Direct per-origin OAuth clients remain supported without it. The included recipient policy is for an explicitly configured account/team and enrolled installations, not an unrestricted public authorization service.

From the repository root, build the workspace dependencies and run:

```sh
pnpm test:provider-oauth-relay
node scripts/build-oauth-relay.mjs
```

Copy `wrangler.example.json` to a private deployment configuration, set its exact account, origin and newly provisioned dedicated D1 ID, and replace the recipient policy placeholders. Never point this binding at an application's database. Register the exact `/api/provider-oauth/cloudflare/callback` or `/api/provider-oauth/vercel/callback` on the relay origin. Configure client IDs/scopes/Integration slug as server variables; put confidential client secrets and a random 32-byte-or-longer `FRONTBASE_RELAY_SECRET` in Worker secrets. Do not store secrets in the example or Git. Deploy with explicit IDs and `--experimental-auto-create=false`.

An enrolled installation sets `FRONTBASE_OAUTH_RELAY_URL` to the relay HTTPS origin and `FRONTBASE_OAUTH_RELAY_TARGET` to an exact JSON object such as `{"origin":"https://app.example.com","host":"docker","purpose":"connect"}`. Its existing administrator/bootstrap-owner authorization remains mandatory. Cloudflare receivers need the `global_fetch_strictly_public` compatibility flag when the relay is another Worker; generated managed CF configurations include it. Vercel and Docker use their existing HTTP transport.

The relay exchanges codes through the existing provider protocol. Encrypted pending records expire within ten minutes. An encrypted ticket binds the receiving origin and S256 receiver proof, expires within two minutes, and is atomically deleted when redeemed. Both issuance and redemption run recipient/ownership checks. Access and refresh credentials travel only in the server-to-server response and the installation's encrypted vault. Cookies are HttpOnly/Secure, callback pages restore same-origin owner sessions, and responses disable caching/referrers/framing. The deployed example bounds SQL rows and request rates, disables application observability logs, and purges expired rows on requests and each minute. Database backups/Time Travel have independent retention; deleting an active row is not a backup-erasure claim.

`/privacy` describes these test-service mechanics; `/terms` references the existing Apache-2.0 software license. A production operator must review its own service notices, registered permissions, backup retention and provider obligations before offering a public relay. Expired/revoked grants require reconnecting; automatic refresh and remote integration uninstall are not implemented.

Native first-install ticket redemption also reserves a durable, create-only account/project/production claim before releasing the grant to the verified receiver's internal establish hook. This nonsecret ledger retains installation, origin and receiver-proof metadata after credential cleanup. A new alias or build cannot become a second owner. Do not erase a claim merely to retry: inspect the provider for possibly committed resources and obtain explicit reset authorization first. An explicit native deployment snapshot has passed fresh Cloudflare and Vercel button and upgrade acceptance with the isolated relay. The main README buttons and a multi-tenant public relay remain separate work; see [the production readiness assessment](../../docs/plans/provider-oauth-production-readiness-20261027.md).
