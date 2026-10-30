# Deployment Wizard: State-DB Provider Split + Multi-Step Redesign

Owner-directed 2026-10-31 ("Analyze everything I said and make a plan"). Status: **plan — no implementation until the owner approves it.** Branch `reconcile/public-baseline-20261028` (main is merge-gated; every delivery reaches the deploy buttons only through an owner-approved fast-forward).

## Requirements (owner's words, normative)

- **R1 — Provider split.** The state-database picker offers two Postgres entries: **Supabase** and **Self-hosted Postgres**. They are separate providers, not one adapter with 8 fields.
- **R2 — Supabase is OAuth-only.** Only the **Connect Supabase** button; no credential fields. After authentication: a dropdown of the account's **projects**, then a dropdown of that project's **schemas** — pick an existing schema or **Create new** and type the name.
- **R3 — Reuse the console flow.** Same flow as console → Edge Resources → State DB → Connect Supabase (`EdgeDatabaseDialog` + `AccountResourcePicker` over `/api/edge-databases/discover-schemas` / `create-schema`). It should be reused, not reinvented.
- **R4 — Self-hosted Postgres goes through PostgREST.** Selecting it shows exactly two fields: **Service URL** and **service role key** (bearer token).
- **R5 — Multi-step wizard.** The bootstrap wizard stops rendering all bindings in one long form. Steps: 1) State Database 2) File Storage 3) Application Cache 4) Queue Delivery 5) Vector Database 6) Email Delivery. One-line description under each title. Steps 2–6 are optional and skippable; **deploy is possible at any point once step 1 is configured**.
- **R6 — Console visual language.** The wizard uses the console's colors and UI patterns.
- **R7 — Official provider buttons.** Connect Cloudflare / Connect Supabase / Connect Vercel use the providers' original brand buttons.

## Verified existing surfaces being reused (read 2026-10-31)

- **Supabase OAuth is complete end-to-end:** `packages/backend/src/provider-oauth.ts` (start/finish, PKCE S256, projects-list account verification), `provider-oauth-refresh.ts` (rotating refresh, refresh-before-use wired into bootstrap consumers), revoke-on-disconnect, relay admission (connect purpose), relay client + `/connect` page, `/api/provider-oauth/status`. Production relay already serves the supabase widening (version `2335f072`).
- **Console reference flow (R3):** `packages/console/src/components/dashboard/settings/shared/EdgeDatabaseDialog.tsx` + `AccountResourcePicker.tsx` — provider buttons → connected-account resource pick → schema `<select>` listing `frontbase_edge%` schemas plus "+ Create New Schema" with a `frontbase_edge_` suffix input. Backed by `packages/backend/src/compat/routes/edge-databases.ts`: `discover-schemas` (Management API `POST /v1/projects/{ref}/database/query`, `information_schema.schemata LIKE 'frontbase_edge%'` + `has_role`) and `create-schema` (schema + scoped role + grants DDL, returns minted credentials).
- **Wizard provisioning already shipped (phase 4 of the 2026-10-29 plan):** `scripts/deployment-setup/supabase-state-provision.mjs` create/reuse wired into the Cloudflare executor and docker host; per-run password mint; transformed profile lowering; edge-core `configKeysByMode` per-mode fields.
- **Shared form:** `packages/console/src/components/deployment/bindings-form.ts` (`mountBindingsForm`) serves all four surfaces — native wizard (`native-app.js`), hosted wizard (`hosted-app.js`), local managed wizard (`app.js`), console `DeploymentBindingsDialog.tsx`. Provider-connection rows with `onConnect` exist; `d1-http` already demonstrates the grant-reference pattern (`binding.secretRefs.token='oauth/cloudflare/token'` when the provider is connected) — the exact pattern Supabase will mirror.
- **Console tokens (R6):** `packages/console/src/index.css` `:root` HSL variables (`--primary 222.2 47.4% 11.2%`, `--radius 0.5rem`, border/muted/ring set) + shadcn card/button/badge/input patterns; dark theme under `.dark`.

## Design decisions (veto anything)

- **D1 — Inventory.** `supabase-postgres` (label **Supabase**) and a new `postgrest-http` (label **Self-hosted Postgres (PostgREST)**). Wire-transport parts (host/port/database/role name/role password) leave the operator-facing form entirely; validation keeps accepting stored wire profiles for back-compat (existing manifests keep applying). D1/KV/R2/etc. adapters unchanged.
- **D2 — Supabase card.** OAuth-only per R2. The Resource-action select disappears: choosing an existing schema sets mode `reuse`, choosing "+ Create new schema" sets mode `create` with the suffix. `secretRefs.token` is set to the grant reference `oauth/supabase/token` automatically when connected (mirrors `d1-http`). No PAT field in the wizard — the PAT stays the documented CLI/headless fallback (`docs/guides/supabase-setup.md`), unchanged.
- **D3 — Apply-time creation.** The wizard never creates the schema during setup (the console's `create-schema` fires immediately; the wizard's no-pre-consent-mutation fence is preserved). The suffix is captured in the plan; the phase-4 executor provisions schema + role + password at apply, exactly as today.
- **D4 — Discovery endpoints.** New shared, read-only backend module (e.g. `packages/backend/src/provider-oauth-resources.ts`) mounted by hosted-bootstrap **and** native-cloud under `/frontbase-bootstrap/api/...`: `supabase/projects` (stored grant → `GET /v1/projects`, bounded ≤50) and `supabase/schemas` (`{projectRef}` → the same Management-API SQL as console `discover-schemas`). Actor-scoped by the same `authorize()` as provider-oauth, same-origin POST, bounded responses, the token never crosses to the browser.
- **D5 — Apply-side grant resolution.** `provider-oauth-bindings.ts` (today cloudflare-only) learns `oauth/supabase/token`: the executor resolves the stored grant (refresh-before-use already exists), the provisioner consumes the access token, the operator token still never reaches the lowered runtime. PAT secret-refs remain valid for the CLI path.
- **D6 — Multi-step inside the shared form.** Implemented in `mountBindingsForm` so all four surfaces stay one source of truth (the console dialog inherits the steps — consistent, and it is the same component today). Roles with zero compatible adapters for the target are omitted honestly (e.g. Email Delivery on docker/vercel). "Deploy now" appears once the State Database step holds a valid selection; steps 2–6 each offer Skip.
- **D7 — Look.** Port the console tokens into `style.css` + `bindings-form.css` (light + dark), cards/inputs/buttons mirroring the shadcn patterns; brand buttons carry inline official SVG logos (Cloudflare / Supabase / Vercel) in the connection rows.

## Phases

- **Phase A — edge-core inventory + validation.** Add `postgrest-http` (connect; config `url` + optional `schema`, secret `token` required). Rework `supabase-postgres` metadata to picker-driven keys (`projectRef`, `schema`) with no operator secret keys on the OAuth path. Tests: `packages/edge-core/test/deployment.mjs` + mutation gate.
- **Phase B — discovery endpoints.** Shared module D4, mounted on hosted-bootstrap and native-cloud (native currently 404s everything under `/api/` except provider-oauth). Read-only tests + no-leak gates (token/schema values never echoed; cross-actor refused).
- **Phase C — form redesign.** Multi-step scaffold (titles + one-line descriptions + Skip + Deploy-now gating), Supabase OAuth picker flow (projects → schemas → create-new suffix), PostgREST two-field card, brand buttons in connection rows. `native-index.html`/`hosted-index.html` step chrome updated; `native-app.js`/`hosted-app.js`/`app.js` unchanged where possible. Console `bindings-form.test.ts` + `test-deployment-bindings` updated.
- **Phase D — restyle.** Console tokens into the wizard stylesheets; brand button styles; dark mode.
- **Phase E — apply wiring.** `provider-oauth-bindings` supabase resolution; executor + docker-host suites extended (grant-resolved provisioning happy path, expired-token refresh path, PAT path unchanged).
- **Phase F — surface gates + docs + governance.** `native-cloud.ts` allow-list + `hosted-cloud.ts` allow-list **and preflight** (fixes the recorded hosted-bootstrap supabase gap); `examples/cf-full/test/native-cloud.mjs` cases. Docs: `supabase-setup.md` wizard section rewritten to the new flow, `provider-oauth.md` unchanged unless scope findings, README sentence if needed. `DECISIONS.md` entry (provider split + OAuth-only wizard + apply-time creation fence). Audit evidence per phase with exact results.

## Honest scope notes

- **Vercel native stays supabase-free** (its deploy executor has no provisioning route — unchanged boundary). `postgrest-http` exposure on the vercel native wizard is decided in Phase F by its capability map (connect-only lowering exists on every target, so it likely ships there).
- **Supabase OAuth scopes** are fixed at the owner's app registration; projects listing is already proven by the OAuth account-verification call, and the schemas query uses the same Management API — if the consent screen shows missing scopes, the owner updates the app registration once (recorded at the consent round).
- The **consent round** (phase 6 of the 2026-10-29 plan: fresh relay-enrolled deploy → Connect Cloudflare → Connect Supabase, capturing the consent screen) is unchanged and should ride the first post-redesign button deploy.
- Steps 2–6 keep today's adapters; no new cache/queue/vector/storage provider work is in scope.

## Verification plan

Per phase: the named suites + mutation gates + `pnpm -r check`; Phases C/D additionally `pnpm -C packages/console check`, `test:deployment-bindings`, `node scripts/test-deployment-setup.mjs`, `node examples/cf-full/test/native-cloud.mjs`, `test:hosted-bootstrap`; Phase E the executor + docker-host + provision mutation chains. Every delivery lands with exact results recorded in the audit, then owner-approved fast-forward to `main`, then a fresh button deploy shows the new wizard.

## Owner actions after delivery

1. Approve this plan (or amend D1–D7).
2. After implementation + merge: one fresh button deploy (fresh worker name to avoid a claim conflict), Connect Cloudflare at bootstrap (relay enrollment), Connect Supabase — capture the consent screen (scope evidence) and confirm the trimmed flow.
