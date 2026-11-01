# Native onboarding final acceptance — November 1, 2026

Owner scope: fresh optional-binding Review → Apply, secure setup access renewal, and fresh main-README deployments on **both Cloudflare and Vercel**. Work autonomously on engineering/verification; collect authorization-dependent steps at the end. Preserve Study-in-USA/source records, populated acceptance apps and the owner's unconfigured wizard. No new provider integration or public-release scope expansion.

## Current acceptance matrix

| Gate | Source/local status | Live status / remaining proof |
| --- | --- | --- |
| Fresh optional-binding Review → Apply | Existing provider/storage/queue runtime qualification and activation tests retained; no credential or journal relaxation | OPEN: disposable fresh deployments, verify Review creates nothing, Apply once, exact selected resources, administrator, storage bytes, queue delivery and vector reads/writes where a suitable grant exists. Earlier installed pickers/CLI runtime fixtures do not close this gate. |
| Secure native setup renewal | IMPLEMENTED and qualified; [design and invariants](hosted-setup-access-renewal-20261031.md#november-1-implementation) | OPEN: real provider consent on pre-install CF/Vercel fixtures, old-session/link invalidation, encrypted grant/journal preservation and resume. Installed apps must stay closed. No claim replay, secret extraction or bespoke recovery route counts as acceptance. |
| Fresh main README, CF and Vercel | Both native imports/builds PASS; Vercel normal completion → owned wizard PASS in standard Chrome, without CLI recovery | PARTIAL: fresh UI Apply, user-submitted administrator, public publication and upgrade remain OPEN. CF build-generated owner link is preserved; Windows browser safety stopped before opening it. No CLI source upload or environment injection substituted for the native journey. |

## Source changes and verification

- Backend `hosted-setup-access` separates access generation from stable encryption material using existing encrypted create-only vault primitives.
- Native host `setup-renewal-owner` verifies fresh provider management access to the exact target. The new access record must be written with that fresh grant; a retained token cannot promote a provider viewer to setup owner.
- Existing relay client gains a bounded renewal mode and separate encrypted browser transaction; exact receiver, origin, ticket and actor-generation checks remain enforced. Host phase checks prohibit pending/uncertain/installed renewal. CF phase admission is included in its metadata append.
- Hosted UI offers the control only on supported native-cloud hosts and preserves nonsecret selections. Error handling distinguishes expiry/session, transport and unexpected response. Legacy/Docker paths are not relabeled as qualified renewal.
- Required `pnpm -r check` and `pnpm -r build`: PASS. CF gzip 793.7 KB and Vercel gzip 1043.4 KB at the final candidate build, within existing budgets; client prohibited-symbol/no-leak check PASS. Final host receipt supersedes sizes if code changes.
- Existing `test:hosted-bootstrap`, `test:provider-oauth-relay`, `test:native-cloud-setup`: PASS, including their mutation/concurrency/receiver/no-replay gates.
- New access-generation tests, five access mutations, six provider-owner mutations, integrated Vercel renewal with fresh-write permission refusal, CF ownership checks, and hosted recovery UI: PASS. `test:deployment-buttons` and delayed activation handoff: PASS.

No real provider renewal, new resource activation, fresh administrator or public publication is inferred from these local transports. Generated `examples/cf-full/api/cms.mjs` remains excluded from source commits. Private credentials, setup links, logs and transient fixture scripts remain ignored under `.frontbase/`.

## Authorization-dependent actions and exact continuation

### Verified source and ordinary Git upgrade receipt

Repair source `75ab8b9b93339296bbd6cd516f139130d9311000` is committed and pushed by normal fast-forward to main and `codex/binding-provider-discovery-20261101`. Both existing disposable HTTP-state apps were upgraded through their connected Git repositories, not CLI source upload:

- CF clone commit `00c7b8448845fe552ecf819255d1588e585cb3b9`; successful Workers build `74e8c501-d544-47ae-a344-13cb453b84f0`; deployed version `be1fc52e-e230-4a11-885d-5e22a8ba4cd4`.
- Vercel clone commit `ff41cd5f24cf9b1868162766aaaebcac14375a8a`; READY production deployment `dpl_8wHJujDBz9YMA4DKiwHMRSMN7cCU`, canonical alias `frontbase-state-vercel-261101b.vercel.app` confirmed by CLI inspection and native Git check.
- Both saved acceptance pages return 200 and retain Arabic text. Anonymous administrative page APIs return 401; bootstrap configuration returns 410; administrator setup reports initialized/closed. Production relay health is 200 with CF/Vercel/Supabase; Upstash stays unconfigured. No source records, provider grants or binding configuration were changed by these upgrades. Authenticated session/account testing for the new fresh runs remains pending; public checks do not substitute for it.

### Fresh native deployment receipts

- **CF:** owner approved Deploy and reuse of `frontbase-native-handoff-261031 build token` for `frontbase-accept-cf-261101a`; the real Study-in-USA build credential was not used. Native public Git clone `8005a9813da37cbbbbd2535511e87f3ab0ae9974`, successful build `4a00f6b9-eee0-4c2f-bd2f-5debc733e7d2`, setup metadata version `93946348-99b7-4822-b656-6c0261a0b485`. Exact D1 IDs/count remain unchanged at nine before Apply; initial KV baseline is 25, not yet rechecked after native deployment. A setup-link read via the existing CLI was refused with provider 403; no wider credential was obtained. The dashboard's ordinary Download log succeeded, and its one exact-origin private link was preserved without displaying it. No D1/KV was provisioned by this build.
- **Vercel:** owner completed native Create/integration authorization for `frontbase-accept-vercel-261101a`. Native clone `9ffe85f81ac63684368a13f0b84d53ffef0e8e0e`; READY activation `dpl_FCHcKhhg7RcchVBwa5CimcqbRaDL`; stable alias `frontbase-accept-vercel-261101a.vercel.app`. Normal completion → Open setup → automatic activation wait → owned Bindings wizard worked without manual refresh, token injection or CLI source upload. Both clones' renewable-access source blob matches main `75ab8b9b` (`a2819b710809863e6c458e1602a9a85d995e7254`).
- **Real expiry encountered:** the Vercel owner cookie expired while Supabase consent was open. The owner approved the specific new-app Supabase grant for Studygram Inc.; Authorize was submitted, but the receiving callback refused after owner-session expiry. Do not claim the Supabase grant was retained in the app. Its public wizard then displayed the specific missing/expired-session message and **Renew setup access**. Renewal started through Connect Vercel → Continue to provider; issuance/old-generation invalidation are not live-proven yet. No state schema or application binding was applied, and no administrator was created.

### Browser safety stop and exact recovery

Windows computer use stopped this turn because it could not determine the active browser URL confidently when opening the dashboard-downloaded CF build log as a local file. No further UI actions were attempted after that stop. The native projects, claims, encrypted grants and deployment identities above remain intact. This is a browser-control blocker, not a provider-build failure or authority to reset an installation.

Resume on known HTTPS pages in standard Chrome. Open the CF build-provided private setup link for this same app (from its downloaded/dashboard log); never publish the link or read unrelated project credentials. The copy saved under ignored `.frontbase/accept-cf-261101a-owner-link.secret` is only that provided native output, not an injected replacement token. Continue Vercel's supported renewal at `/frontbase-bootstrap/`, inspecting the existing project's provider access without broadening it. Reconnect Supabase only after owner access is restored; consent approval for this exact recipient is recorded above. Preserve actual current phases; do not rerun native claims, create replacement deployments or substitute CLI source uploads.

### Remaining live sequence

1. Resume the existing two native deployments above; do not create replacements. Any genuinely new provider recipient/scope still needs its applicable confirmation. Use eligible free resources and accept no paid upgrade or new terms automatically.
2. Exercise **Renew setup access** after genuine private-link/session expiry on each new pre-install fixture. The fresh consent must be limited as the provider permits; test a denied/insufficient grant separately. Record generation invalidation without storing capability values in evidence.
3. In each owned wizard, choose empty disposable state plus eligible optional resources. Compare inventory before/after Review, then Apply once. Preserve operation identity; held/unknown outcomes only use supported status/reconciliation.
4. Have the owner enter/submit each administrator password in its actual form. Verify session after refresh, retained encrypted provider account and anonymous setup/admin refusal. New passwords cannot be submitted by browser automation.
5. Create/save/publish a Unicode fixture page through the UI, check anonymous bytes and upgrade through the connected Git repository. Verify state/resource IDs, session, publication and closed setup remain intact.
6. Complete storage upload/list/signed-download/bytes, queue signed/durable delivery and vector dimensionality/write/search/remove checks on the selected optional bindings. R2 S3 credentials are distinct from management OAuth; Upstash live acceptance remains dependent on partner registration. Missing grants remain explicit deltas, not passing evidence.

## Remaining release blockers

Within this task: the three live gates above remain open until their exact receipts pass. The source-level renewal defect is repaired; its live provider proof remains a separate blocker. Outside this task: Upstash partner registration and real consent/delivery; independent-account/production OAuth operations; package consumability/versioning/publication and remaining Developer Preview security/documentation/distribution gates in the [public-release strategy](../history/PUBLIC-RELEASE-STRATEGY.md). New Turso/other provider candidates remain [proposed roadmap](connected-provider-roadmap-20261101.md), not automatic release blockers. CF-22 stays historical/superseded.
