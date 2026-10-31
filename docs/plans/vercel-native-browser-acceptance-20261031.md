# Native Vercel browser acceptance — October 31, 2026

Owner scope: verify the main README button in standard Chrome, repair actual failures, then commit, push and merge verified fixes. No CLI deployment, source upload, environment injection or claim recovery may substitute for the native flow. Preserve existing installations, the completed Cloudflare repair and generated host artifacts.

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

`examples/cf-full/api/cms.mjs` remains an unstaged generated build artifact, as it was before this repair. It is excluded from the commit. No provider registrations, source records, production services or release scope changed. Broader Developer Preview gates remain open.
