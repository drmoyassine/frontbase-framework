# Native Vercel browser acceptance — October 31, 2026

Owner scope: verify the main README button in standard Chrome, repair actual failures, then commit, push and merge verified fixes. No CLI deployment, source upload, environment injection or claim recovery may substitute for the native flow. Preserve existing installations, the completed Cloudflare repair and generated host artifacts.

## Source promotion — complete

Repair commit `033f496b983ecd64a2aa4a93cfddeb2edc9ac716` is pushed on codex/vercel-native-acceptance-20261031 and merged normally into public main as `1ea8d2266e2528f0c7da35a2310c013f1b3338db`. Remote main ancestry and exact changed-file equality were verified after the merge. `verifyNativeSource` at that exact main SHA passed with zero failures. The existing README buttons continue to select main and the registered Frontbase integration; no provider registration or secret changed. This closes commit/push/merge, not fresh-live acceptance.

## Observed native run

The main README button created private Git copy `drmoyassine/frontbase-vercel-browser-261031`, initial commit `47d6058e43fc1fd1e5f8714bb95cd05d826ee9bc`. The real Chrome integration popup returned to Vercel, marked Frontbase added, and started native Git deployment `dpl_7DL8iRh9ZAVBxeApm5CApsrKQxR9`. Team `team_vifgJpaYqcuBJmIQuhAEn2m7`, project `prj_gLfcPwSyAMkXW60XnkIAQpVcXfzT`. The native completion page accepted Open setup and its ordinary provider API handoff created READY deployment `dpl_42wxVLvvD1r9A1tpsNHubwcFBpP9`. No CLI mutation was used.

## Actual failure and bounded fix

During that rollout, Chrome received the old native HTML. Its native-configuration/provider requests then hit the authorized hosted runtime, leaving the old client at “Setup is unavailable.” Anonymous probes showed the canonical root already serving hosted HTML with no-store/MISS, the old native-configuration route redirecting, and the protected hosted configuration refusing an anonymous session. A browser refresh displayed the proper hosted wizard with ownership still verified. This isolates the stale client during runtime replacement, rather than missing OAuth scopes or a failed ownership claim.

Repair only the client transition: a bounded, read-only same-origin configuration probe may recognize the existing server-authorized owner session and navigate to the hosted wizard. Never infer ownership from a cookie's presence, repeat consent/claims/initialization, expose a capability, or replay a held operation. Retain the current manifest draft. Require a valid successful configuration response and matching target/manifest, and bound repeated stale-page redirects.

## Implemented repair and verification

`scripts/deployment-setup/native-app.js` now probes the existing protected hosted configuration with a same-origin GET, no-store and a 15-second timeout. Only a successful JSON response with a supported target, matching manifest target and adapter inventory permits navigation to the hosted wizard. The same check handles a runtime replacement during native configuration/provider reads. A nonsecret query counter stops after three redirects. The binding draft stays intact; there are no ownership, consent, initialization or provisioning writes.

The regression failed against the original client before the patch. The repaired client passes initial-native, authorized-hosted, mid-request rollout, refused/mismatched session, bounded redirect, preserved-draft and uncertain-operation cases. The mutation harness detects all four faults: status refusal bypass, target mismatch bypass, redirect-bound removal and a GET-to-POST change. Original source is not mutated on disk.

Exact completed checks on October 31, 2026:

- `pnpm -r check` — PASS.
- `pnpm -r build` — PASS; existing chunk-size/dynamic-import warnings remain informational.
- `pnpm test:native-cloud-setup` — PASS, including the four new routing mutations, six build-handoff mutations and nine metadata mutations.
- `pnpm test:vercel-native-integration` — PASS, including fifteen integration mutations.
- `node scripts/test-native-activation.mjs` — PASS.
- `pnpm test:deployment-buttons` — PASS; the README continues to use the reviewed main source and native integration contract.
- `git diff --check` — PASS.

## Remaining browser acceptance and handoff

Windows browser automation forcibly stopped when it could not establish Chrome's current URL. No further app input or private setup recovery was attempted. The owner subsequently requested commit, push and merge of this qualified repair. That authorization does not make the live acceptance complete.

The diagnostic refresh above is not an uninterrupted final acceptance proof. The current test project has reached the owned hosted wizard, but no state database, administrator or published page was created in this run. Existing native/project claims are preserved; no reset or adoption is authorized by a failure. The repair itself has local regression/mutation qualification, not repaired fresh-live acceptance.

Next executable task: start from the updated main README in standard Chrome, complete the native integration/import/return without a manual refresh or CLI workaround, select a fresh empty disposable state database through the supported UI, Review → Apply, have the owner submit administrator credentials, then create/save/publish a fixture page and verify public delivery and the retained Vercel Connected Account. Record the exact source and deployment IDs. Do not reuse an already populated test database as first-install evidence. If a previous owner session has expired, use a fresh ordinary native flow rather than resetting or replaying its claim.

### Next-run checklist

Planning prerequisite added at owner request: implement and qualify [secure hosted setup renewal and distinct opening errors](hosted-setup-access-renewal-20261031.md) before closing onboarding. Its supported recovery drill is separate from the uninterrupted fresh-deployment proof below; do not replace that proof with bespoke recovery or silently restart an uncertain installation. This prerequisite is recorded, not yet implemented.

1. Open the actual main README in standard Chrome and capture its selected public source. Use an isolated disposable project; preserve the existing populated acceptance apps and the incomplete browser test's claimed state.
2. Complete the native initial integration for that project only. Record the private Git copy, imported commit, project/team, initial READY deployment and handoff READY deployment. A provider-generated clone commit may differ from the upstream SHA; record both identities rather than guessing equivalence.
3. Follow the native return into the owned hosted bindings wizard. Cloudflare/Vercel management authorization must already be retained as appropriate. Do not manually refresh to make the stale-page regression disappear; bounded automatic routing must work without repeating consent or the native claim.
4. Select an empty disposable HTTP state database through the supported UI. Reuse an existing resource only after establishing it is empty; no paid upgrade or credential transfer through chat. Optional services can remain disabled. Confirm Review makes no provisioning changes, then Apply once and retain its operation identity. Any uncertain operation stops for supported reconciliation, never blind retry.
5. Have the owner submit administrator credentials in the actual form, then leave the app signed in. Verify refresh preserves setup/session and repeat anonymous setup is closed after installation.
6. Through the installed UI, create and save a fixture page, publish it, and verify its anonymous public response. Check anonymous administrative access is refused. Confirm one encrypted Vercel Connected Account is retained and its supported Test connection succeeds.
7. Perform an ordinary reviewed Git upgrade through the connected repository/provider flow. Verify administrator session, page, database identity, configuration, encrypted account and closed setup survive. No CLI upload or environment/owner-token injection can count as this upgrade proof.
8. Record exact results and any genuine remaining failures in this receipt and the audit. Do not rerun unrelated provider suites or reopen the completed CF repair merely to refresh timestamps. Update the overall release checkpoint when this bounded gate closes.

Pass means one uninterrupted README → native integration/build → automatic wizard return → UI activation → administrator → publication journey, plus retained-state upgrade. This is owner-account onboarding evidence, not independent-customer or full public-release certification.

`examples/cf-full/api/cms.mjs` remains an unstaged generated build artifact, as it was before this repair. It is excluded from the commit. No provider registrations, source records, production services or release scope changed. Broader Developer Preview gates remain open.
