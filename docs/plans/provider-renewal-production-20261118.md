# Installed provider authorization renewal — 2026-11-18

Owner scope: deploy Supabase management renewal, verify renewal without replacing existing accounts, and qualify the other supported provider policies. No account deletion, settings reset, publication update or HTML caching. The owner separately approved enabling Cloudflare refresh grants; its seven resource permissions remain unchanged.

## Production evidence

The production relay and Study-in-USA runtime were upgraded with the existing 14 relay bindings and 15 application bindings retained, including their secret bindings. Rollback references before this task: relay `945f882d-39bf-4489-b533-54a9130e5a2f`, application `abe2f417-584d-4399-90e2-c9cc5a7ab0fa`.

Final versions: relay `fce23c8e-6c14-46ea-bc4b-3c9b9a310e42`; Study-in-USA `e8f3c76f-f5d2-4739-b351-4532109076f5`, each at 100% traffic. The intermediate real-renewal proof ran on `e5939094-0755-4209-9c03-8b604d96c74a`; the final application keeps the same renewal path. After explicit registration approval, the relay scope variable gained only `offline_access`; the seven existing resource scopes and other settings were retained.

Real Supabase renewal passed at `2026-11-17T21:35:44Z` (November 18 in Kuwait). The existing account `982eebcc-8f37-4af5-8733-98f34535fc07` remained in place. Its expiry moved from `2026-11-18T16:03:57.275Z` to `2026-11-18T21:35:44.341Z`. Both the renewal request and subsequent normal management requests returned Studygram DB as ACTIVE_HEALTHY. No provider reconnect or new consent was used. The encrypted grant persisted and remained usable after a fresh app login.

**Evidence boundary:** the real production access token had not expired when tested. This is a real early renewal, not a witnessed natural-expiry run. Separate installed-app tests start with expired grants, run the same exchange and persistence path, restart the application and verify management reads. Do not relabel those simulated provider responses as live expiry evidence. A naturally expired production management request remains an observation to collect after the new expiry.

English and Arabic homepage/explore responses remained byte-identical to the baseline, HTTP 200 and `Cache-Control: no-store`, with publication `aa0a3c6d36d7adf541d2968303377844128bd964e00a90e7c8b55c96fcbe2de6`. Existing console Data Inspector and Studygram DB records remained accessible. This rollout does not close the separate performance/soak gate.

Private operator receipts are under `study-in-usa-ops/oauth-production-261118`: configuration/version snapshots, `real-renewal.json`, `management-live.json`, public before/after hashes and deployment logs. Credentials are excluded from this repository.

## Shared policy

| Provider / credential | Policy | Qualification |
| --- | --- | --- |
| Supabase OAuth | Renew 30 seconds before expiry on management use; rotate access and refresh token in the same encrypted account. Retry one read-only discovery after a 401. | Expired-token/restart/concurrency tests; real production early rotation and management reads passed. Natural-expiry observation pending. |
| Cloudflare OAuth | Refresh-token exchange through the same receiver-authenticated relay or an operator-owned client. | Expired-grant rotation and persistence tested. Production client originally had only Authorization Code enabled. The owner approved adding Refresh Token; saved and verified in Cloudflare, which added `offline_access` alongside the same seven resource scopes. The relay requests that scope. No existing grant was deleted or reauthorized. A real refresh-capable grant still needs separate live qualification. |
| Vercel integration, short-lived | Mint a new installation token using client credentials and the verified installation ID. A relay-encrypted proof binds that installation/team to the exact receiver origin and host. | Protocol, installation/team mismatch, receiver/proof admission, expiry, concurrency and persistence tests passed. No new real Vercel grant was requested in this task. |
| Vercel integration, legacy long-lived | Keep working without unnecessary exchanges. Do not enable the provider's irreversible legacy-token expiration switch. | Passthrough tested. Old expiring records without a verified installation identity/proof need a new authorized handoff; never infer one from caller input. |
| Upstash partner OAuth | Exchange the initial OAuth token for the durable Developer API key; use the encrypted email/key for management. Do not refresh the discarded bootstrap token. | Existing partner-protocol and durable-key tests passed. Live partner OAuth remains dependent on Upstash registration/partnership, which is not configured on production. |
| Manual provider API keys | Retain their provider-defined lifetime. Renewal cannot manufacture a replacement for an expired/revoked API key. | Existing manual credential paths preserved. |
| Google Sheets Apps Script / Vercel identity sign-in | No installed management OAuth token to renew: retain the existing Apps Script connection policy; identity-only recovery consumes its identity proof. | Separate from provider-management grants. |

Revoked grants and revoked installations cannot be silently restored by renewal. They require explicit reconnection. Renewal never broadens scopes or grants a different account/project access.

## Implementation and safeguards

`provider-management-renewal.ts` centralizes installed-account renewal, replacing the Supabase-only implementation through a compatibility wrapper. A durable encrypted compare-and-swap lease selects one exchange across concurrent workers. Persisted replacement uses tenant, account, provider and the exact inspected encrypted configuration; concurrent owner edits/project-key enrichment are preserved. No mutation is automatically replayed after authentication failure.

The relay exposes server-to-server renewal only to a previously enrolled receiver with its existing registration secret. Browser Origin/Cookie submissions are refused. Vercel additionally needs the sealed authorization-derived installation proof; a public installation ID alone is insufficient. Client secrets remain on the relay. The existing authenticated account retest accepts `renew_authorization: true` for an owner to exercise this path before expiry; it accepts no replacement credential, recipient or installation ID.

The app artifact was built from a separate archive of `3f93bb60` plus the scoped renewal changes. The relay preserves the already-deployed bounded native-Vercel continuation cookie fix from the pre-existing working tree; those unrelated source/test diffs remain separate from this task's commit. Do not claim the dirty shared checkout was the deployment source or that the unrelated residue was merged by this task.

## Verification

- Workspace `pnpm -r check` and `pnpm -r build` passed; the isolated artifact also built successfully on Node 22. Worker gzip approximately 842 KB, within the Workers Free upload budget.
- Installed Supabase expired-token, simultaneous renewal, encrypted readback, restart, direct-client, explicit early-renewal and cross-tenant refusal tests passed.
- Shared provider renewal tests passed: Cloudflare rotation, Vercel installation/team constraints, sealed receiver proof, server-only renewal admission, no unexpected exchanges for legacy Vercel/durable Upstash, and preserved account configuration.
- OAuth protocol/security suite passed, including 16 OAuth mutations, 12 receiver mutations, 26 relay mutations and 16 native Vercel mutations. Account-refresh persistence/CAS mutations passed. Supabase, Cloudflare provider, binding-resource, relay production-mode and authentication guards passed.
- Existing production Supabase account and project discovery passed before rollout, after real rotation, and after a fresh login. Existing grants/settings were not deleted or replaced.

## Remaining qualification

1. Qualify a real refresh-capable Cloudflare grant under the now-enabled registration and configured `offline_access`. Existing non-refreshable grants cannot be retrofitted silently; the registration change preserves them.
2. Record a naturally expired production Supabase management request after its new expiry, distinguishing it from the real early-renewal and expired-fixture proofs above.
3. Qualify a real short-lived Vercel installation grant when a separately authorized test recipient is available. Keep the Upstash partnership/registration task open.

These are provider-specific qualifications, not permission to delete accounts, reset settings or declare all live-provider acceptance complete.
