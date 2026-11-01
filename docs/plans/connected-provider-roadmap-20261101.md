# Connected-provider roadmap — 2026-11-01

Status: researched proposal and owner-action register. This document does not claim implementation of the proposed integrations, authorize provider registration/consent, or add them all to the first public release. The owner requested this reconciliation after the [binding delivery and live follow-up](binding-provider-discovery-20261101.md). The [existing deployment capability catalogue](frontbase-deployment-profiles-20261020.md#capability-catalogue) remains the complete logical binding surface; this plan orders provider-specific follow-up.

## Immediate external dependency: Upstash

- [ ] **Owner: contact `partnerships@upstash.com`** to request Frontbase partner OAuth registration for Redis and QStash. Status: not contacted by this agent; client not obtained; production Connect Upstash remains inactive.
- [ ] Register `https://oauth.frontbase.dev/api/provider-oauth/upstash/callback`; confirm client authentication, PKCE, scopes, audience and Developer API-key exchange with Upstash.
- [ ] Configure the supplied client ID/secret on `frontbase-oauth-production`, deploy, and check that relay health advertises Upstash.
- [ ] Complete real consent, Redis round trip, signed QStash delivery and revoked/insufficient-grant acceptance on disposable installations.

The exact variables, proposed registration request and activation steps are maintained once in [Activate Connect Upstash](../guides/deployment-binding-providers.md#activate-connect-upstash). Manual Redis/QStash credentials remain supported. Source: [Upstash partnership procedure](https://upstash.com/docs/redis/help/integration). No email, registration or permission change is performed by this documentation task.

## Turso: provider capability versus Frontbase wiring

**A browser authorization route exists at Turso, but Frontbase does not yet provide a complete hosted Connect Turso → fetch/create → Apply experience.** Turso documents OAuth 2.1 for its hosted MCP service, with browser approval and scoped management access. This establishes a promising integration route, not proof that Frontbase's current generic OAuth relay can use its tokens against arbitrary REST endpoints. Confirm supported client discovery/registration, PKCE, audience, refresh and revocation contracts before implementation. Source: [Turso hosted MCP](https://docs.turso.tech/integrations/mcp).

Repository evidence:

- `packages/console/src/components/dashboard/settings/shared/connect-dialog/useConnectProvider.ts`: Turso's current account dialog imports a manually supplied database URL/token. This is not platform OAuth.
- `packages/backend/src/compat/routes/edge-providers/strategies/resources/turso.ts`: management-token inventory and database creation already exist. Creation selects the first organization and `default` group; per-organization list failures can yield partial results. Reuse/refactor this strategy before exposing wizard creation. Do not route the secret-bearing imported-database cache to a browser dropdown.
- `packages/backend/src/provider-oauth-config.ts` and `packages/console/src/components/deployment/provider-connect.ts`: shared provider connection wiring does not include Turso.
- `scripts/deployment-setup/vercel.mjs`: existing Marketplace reuse is limited to a database already attached to the selected Vercel project. It does not authorize a Turso account or establish hosted creation support. `examples/cf-full/src/hosted-cloud.ts` does not enable `turso-marketplace` in hosted Apply.

Proposed flow: **Connect Turso → choose organization/group → choose compatible database or Create new → Review → Apply**. Use the existing encrypted Connected Accounts, shared resource picker, guarded HTTP strategy and durable activation journal. Resolve a database-scoped runtime credential only for the selected database; keep management authorization separate. Turso distinguishes scoped Platform API tokens from SQL-engine tokens: [management authentication](https://docs.turso.tech/api-reference/authentication), [database token permissions](https://docs.turso.tech/sdk/authorization/tokens).

Creation needs an explicit group and engine-compatible choice, quota/plan validation and actionable partial-list failures. Current Turso and libSQL use different client paths; preserve the existing HTTP libSQL adapter unless the new engine passes its SQL, migration, transaction and vector contracts. No filesystem replica or TCP fallback: [Turso runtime/engine choices](https://docs.turso.tech/integrations/vercel). Never silently migrate an existing state database, reuse a populated database without ownership checks, or revoke unrelated runtime tokens on disconnect.

## Resources available for further adapters

These are **candidates**, not working dropdown options. Existing provider consent may lack the required permissions. Runtime credentials, product enablement, domain readiness and billing remain separate from management sign-in.

| Provider | Already wired in the current binding work | Recommended expansion | Conditions and Frontbase use |
| --- | --- | --- | --- |
| Cloudflare | D1, KV, R2, Queues and Vectorize discovery; host/runtime support varies by adapter and the delivery receipt | Email Sending/Routing; Workers AI and AI Gateway; Cron; later Workflows, Durable Objects, Analytics Engine and Turnstile/rate limiting | Email for notifications/inbound Actions; AI for generation/embeddings; schedules for existing jobs; durable coordination/realtime behind existing contracts. Native bindings require CF lowering. Cross-host use requires an actual HTTP adapter. |
| Vercel | Project/deployment authorization and initial credential handoff; external HTTP state/cache/storage/queue/vector adapters | Private Blob; Queues; Cron; AI Gateway; later Workflow, Runtime Cache and Global Config | Blob for file storage; queues/schedules deliver existing jobs; AI for models/embeddings. Runtime Cache is ephemeral, not durable state/accounting. Global Config is configuration, not a general database. Marketplace resources require their own installation/terms and credential resolution. |
| Supabase | Project/schema selection and HTTP/PostgREST state/content; private Storage discovery/materialization | pgvector; Queues; Cron; later Realtime, application-user Auth, Edge Functions and diagnostics | Vector search, HTTP queue RPCs, scheduled jobs and live application data. Extension/RPC permissions and RLS require explicit qualification. Application-user Auth must not replace installation-owner setup. Current Auth read permission does not authorize provider configuration. |

Provider contracts: [Cloudflare binding catalogue](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Email Service](https://developers.cloudflare.com/email-service/), [Workflows](https://developers.cloudflare.com/workflows/); [Vercel Blob](https://vercel.com/docs/vercel-blob), [Queues](https://vercel.com/docs/queues), [AI Gateway](https://vercel.com/docs/ai-gateway), [Runtime Cache](https://vercel.com/docs/caching/runtime-cache), [Marketplace storage](https://vercel.com/docs/marketplace-storage); [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector), [Queues API](https://supabase.com/docs/guides/queues/api), [Cron](https://supabase.com/docs/guides/cron), [OAuth scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes).

Cloudflare arbitrary-recipient email requires Workers Paid; sending only to verified account destinations has different eligibility. Domain setup and explicit plan choice are prerequisites, not silent free-profile defaults. Vercel's team/project/deployment grant does not confer a third-party account grant or unrestricted Marketplace/billing access. Supabase is not a Redis-compatible cache. Existing Supabase server keys may have project-wide authority even when application operations use installation/tenant namespaces.

## Ordered execution backlog

1. **Finish acceptance of delivered bindings.** Preserve the [open fresh optional-binding Apply/cross-host byte matrix](binding-provider-discovery-20261101.md#live-follow-up-and-repairs--november-1); execute Upstash consent/delivery after partner registration. Keep [secure setup renewal](hosted-setup-access-renewal-20261031.md) and uninterrupted fresh public-main Vercel acceptance in their existing release queues.
2. **Turso feasibility, then shared Connect/resource picker.** First produce the supported OAuth/audience/engine contract. Then refactor organization/group selection and list failures, connect the existing HTTP adapter through Review → Apply, and test create/reuse, refresh/revoke, quota errors and recovery on both hosts. If generic client onboarding is unsupported, record the provider dependency; do not disguise manual token import as OAuth.
3. **Fill existing logical binding roles.** Prioritize Vercel private Blob and Supabase pgvector, followed by Supabase Queues/Cron and Vercel Queues. Reuse storage/vector/queue contracts. Provider retry delivery must preserve Frontbase job identity, tenant checks and idempotency; no second workflow truth store. Qualify current provider limits/release status when implementing.
4. **Email, AI and scheduling.** Start with opt-in Cloudflare email plus domain/recipient readiness; evaluate Workers AI/AI Gateway and Vercel AI Gateway using existing AI/text/embedding seams. Embedding model/dimension must match the selected vector index. Schedulers invoke the existing job API rather than inventing another executor.
5. **Advanced capabilities after demand/evidence.** Durable coordination, provider workflows, Realtime/application-user Auth, diagnostics, abuse controls and configuration delivery need separate bounded designs. Reuse core contracts; preserve the six-package architecture and accepted translation exception. Deno remains deferred.

This is a recommended sequence, not approval to start all five workstreams or widen first-edition scope. The [public-release strategy](../history/PUBLIC-RELEASE-STRATEGY.md) still controls the release label/gates; CF-22 stays historical/superseded.

## Shared UX and acceptance requirements

- Show Connect only after selecting a provider that needs an unavailable grant. Reuse a sufficient retained grant; show reconnect/permission guidance for an insufficient one. Do not request every possible service scope on initial connection.
- One resource picker per selected binding, with search, refresh, and separate Use existing / Create new actions. Show account/project/group context and availability; hide unrelated service controls behind progressive disclosure.
- Discovery and Review are read-only. Apply alone provisions after a validated immutable plan, with durable ownership/journal/recovery checks. Unknown create/write outcomes remain fenced; no automatic replay or migration.
- Runtime keys stay server-side, encrypted and separate from management grants. Saved drafts/exports contain references. Preserve manual adapters, installed configuration and exact-target reconnect semantics; capability discovery must not broaden authorization.
- Accept each adapter only after real resource discovery, create/reuse, runtime bytes/jobs/queries, reload/upgrade persistence, denied/revoked grants, quota failure, tenant isolation, no-leak and relevant fault/mutation gates. Verify the shared UI in English/Arabic on desktop/mobile and classify assisted recovery separately from uninterrupted native acceptance.

Documentation checkpoint: source and official contracts reviewed; no code/cloud/resource changes. Optional features above remain proposed until separately implemented and qualified.
