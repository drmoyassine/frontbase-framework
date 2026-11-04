# State discovery and direct OAuth popup — November 4, 2026

## Reproduced cause

Owner's failing Service URL is `https://frontbase-studygram-selfhost.4ky7uo.easypanel.host/`. This service is native PostgreSQL/PostgREST, not the retired full Supabase stack. Its current Compose configuration exposes only `translations`. The wizard's SQL discovery RPC defaults to `public.execute_query`; PostgREST rejects that profile before SQL runs. The installer converts the upstream 406 (`PGRST106`) to its own 502 (`state_profile_unavailable`). No schema enumeration ran on that request.

An authenticated read-only comparison through the actual discovery handler reproduced:

| Endpoint | Upstream | Wizard handler | Result |
| --- | --- | --- | --- |
| `frontbase-studygram-selfhost.4ky7uo.easypanel.host` | 406 / PGRST106 | 502 / state_profile_unavailable | Public SQL helper profile unavailable |
| `frontbase-studygram-state.4ky7uo.easypanel.host` | 200 | 200 | Empty usable schema list; valid before first Create |

Each probe made one HTTPS call using that endpoint's own JWT, without DDL or record changes. Temporary local credential input was removed afterward. The dedicated state credential is EasyPanel `frontbase / studygram-state` → `STATE_ACCESS_TOKEN`; it is different from the translations credential. Never send either value in chat or commit it.

The separate state endpoint uses database `frontbase_state`, NOINHERIT login `fb_state_auth` and runtime role `fb_state_runtime`. The original translations API uses database `frontbase`. Schemas in one database are not discoverable by connecting to the other. The earlier repair qualified the dedicated endpoint but did not turn the translations endpoint into a state installer. This explains repeated failure when the original URL is reused; it is not a new database outage.

## Discovery behavior

Discovery queries all non-system schemas visible to the supplied credential in the endpoint's database. It is not restricted to Frontbase-prefixed schema names. Eligible selections follow the existing state identifier contract; public/system namespaces cannot be application-state targets. Existing populated schemas are not overwritten by selecting them.

The repair removes the silent 100-item response truncation, retains the explicit 1,000-row safety refusal and corrects SQL system-prefix matching. Backend/UI regressions cover non-Frontbase names and a single-request 180-schema inventory. Endpoint guidance now distinguishes a translations-only API from a state-capable API and its separate credential. No redirect to a sibling endpoint or credential forwarding is introduced.

Owner was asked whether state should remain in the separate database or use the existing `frontbase` database. No database relocation, SQL-helper grant expansion, API schema-exposure change or translations mutation is authorized by this diagnostic finding alone. Keep the existing server configuration until that choice is resolved.

## OAuth popup

The relay previously required an intermediate Continue button. The shared connection script now automatically starts the same proof-bound POST and navigates the already-open popup to the provider. It retains the displayed challenge header, provider/session/receiver checks, CSRF, PKCE and single-use handoff. Provider consent is unchanged. The fallback button is for a manual retry after a failure; there is no automatic retry loop and duplicate clicks cannot dispatch while a request is pending.

Behavioral tests run the served browser script against the real relay handler: correct displayed challenge navigates once without a click; the replaced-page challenge remains refused before provider navigation. Live verification and final security results are recorded below when complete.

## One activation action

The hosted CF/Vercel form now exposes one primary Activate Frontbase action. It runs complete binding validation and the existing server Review, checks the local revision again, then sends the existing Apply ticket and credentials once. Deploy now and the separate visible Review button are removed from this surface. A validation failure permits corrections; a submitted, failed or uncertain Apply cannot be repeated by clicking again. Status reconciliation and polling retain their existing guards. Navigation controls are separate from provisioning.

Tests cover invalid optional bindings, rejected server review, edits during review, successful activation and lost Apply response. The Chrome fixture exercises the real host/cookie/assets/review handlers on both hosts and intercepts only the final Apply response; separate hosted lifecycle and eight fault gates exercise actual server-side Apply with simulated upstream providers. This is not a new fresh cloud installation proof.

Qualification: workspace check/build, 32 bindings UI cases, schema-discovery checks and all four discovery faults, the complete OAuth relay chain (12 receiver, 26 relay and 15 native-Vercel faults), one-action/polling/renewal/native-activation checks and the hosted lifecycle/eight host faults passed. The production relay upgrade is version `6c476da8-acb8-40b4-b188-2106781fe36a`; public connect.js readback confirms auto-start, receiver proof and duplicate-dispatch guard, with unchanged CSP and health 200. No new provider consent was granted during verification. The browser connector exposed no open setup tab, so no fresh live consent click is claimed.

The existing `drmoyassine/frontbase-study-in-usa` native Git copy matched the pre-repair framework content in all affected runtime files. Its scoped normal Git upgrade `ce1dd18` completed successfully through Workers Builds. Bindings, databases and setup capabilities were not replaced.

The reported blocked handwriting-font requests are not referenced by the callback source. Its document and callback script succeeded in the supplied screenshot; relay-finish was pending. The font errors alone do not establish an OAuth failure or justify relaxing the callback CSP. Their originating extension/injected styling cannot be established from that screenshot alone.

Current installation status readback: administrator setup is already closed (`needsSetup=false`, `setupEnabled=false`); bootstrap assets return 410. Do not reset or reopen it to manufacture a fresh wizard proof. The one-button UI is qualified by the two host browser fixtures and becomes visible on new installations.
