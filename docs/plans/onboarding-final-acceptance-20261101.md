# Native onboarding final acceptance — November 1, 2026

Owner scope: fresh optional-binding Review → Apply, secure setup access renewal, and fresh main-README deployments on **both Cloudflare and Vercel**. Work autonomously on engineering/verification; collect authorization-dependent steps at the end. Preserve Study-in-USA/source records, populated acceptance apps and the owner's unconfigured wizard. No new provider integration or public-release scope expansion.

## Current acceptance matrix

| Gate | Source/local status | Live status / remaining proof |
| --- | --- | --- |
| Fresh optional-binding Review → Apply | Existing provider/storage/queue runtime qualification and activation tests retained; no credential or journal relaxation | OPEN: disposable fresh deployments, verify Review creates nothing, Apply once, exact selected resources, administrator, storage bytes, queue delivery and vector reads/writes where a suitable grant exists. Earlier installed pickers/CLI runtime fixtures do not close this gate. |
| Secure native setup renewal | IMPLEMENTED and qualified; [design and invariants](hosted-setup-access-renewal-20261031.md#november-1-implementation) | OPEN: real provider consent on pre-install CF/Vercel fixtures, old-session/link invalidation, encrypted grant/journal preservation and resume. Installed apps must stay closed. No claim replay, secret extraction or bespoke recovery route counts as acceptance. |
| Fresh main README, CF and Vercel | Actual main button URLs inspected in standard Chrome; Vercel native form reached with isolated proposed name `frontbase-accept-vercel-261101a` | OPEN: final provider grants, native import/build/return, UI Apply, user-submitted administrator setup, publish/public response and ordinary Git upgrade. No CLI source upload or environment injection substitutes for this journey. |

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

1. Complete native project creation/provider access grants only for the prepared disposable test apps; use free eligible plans, accept no new paid upgrade. Record selected team/account, source/import SHA, build/deployment IDs and canonical origin.
2. Exercise **Renew setup access** after genuine private-link/session expiry on each new pre-install fixture. The fresh consent must be limited as the provider permits; test a denied/insufficient grant separately. Record generation invalidation without storing capability values in evidence.
3. In each owned wizard, choose empty disposable state plus eligible optional resources. Compare inventory before/after Review, then Apply once. Preserve operation identity; held/unknown outcomes only use supported status/reconciliation.
4. Have the owner enter/submit each administrator password in its actual form. Verify session after refresh, retained encrypted provider account and anonymous setup/admin refusal. New passwords cannot be submitted by browser automation.
5. Create/save/publish a Unicode fixture page through the UI, check anonymous bytes and upgrade through the connected Git repository. Verify state/resource IDs, session, publication and closed setup remain intact.
6. Complete storage upload/list/signed-download/bytes, queue signed/durable delivery and vector dimensionality/write/search/remove checks on the selected optional bindings. R2 S3 credentials are distinct from management OAuth; Upstash live acceptance remains dependent on partner registration. Missing grants remain explicit deltas, not passing evidence.

## Remaining release blockers

Within this task: the three live gates above remain open until their exact receipts pass. The source-level renewal defect is repaired; its live provider proof remains a separate blocker. Outside this task: Upstash partner registration and real consent/delivery; independent-account/production OAuth operations; package consumability/versioning/publication and remaining Developer Preview security/documentation/distribution gates in the [public-release strategy](../history/PUBLIC-RELEASE-STRATEGY.md). New Turso/other provider candidates remain [proposed roadmap](connected-provider-roadmap-20261101.md), not automatic release blockers. CF-22 stays historical/superseded.
