# Cloudflare real-install repair — 2026-10-27

Scope: frontbase-usa failed setup, private native repository investigation and hidden native defaults. No public release claim.

## Established live evidence

- Initial native claim exhausted the account D1 limit. Owner-authorized obsolete test D1 `492db01a-c241-4b12-a7b4-8f16ccfb1a0f` was deleted; only the empty failed frontbase-usa claim was recovered after verifying no setup database/runtime bindings existed.
- Owner repeated consent successfully. Installation `f29febb8-fb0e-47be-8b2a-2d71a1f2e1d6` now owns setup D1 `49665a3b-8306-46bf-8325-8490f9a12001`.
- Operation `3f8cab6a-3bb6-4fcd-bdc8-44c2d91e7e38` reached uncertain revision 2: its plan requested CREATE using the existing coordinator name. Live inspection confirms bootstrap=1, no runtime DB binding and no frontbase-usa-cache namespace. Recovery must be conditional on these facts and the exact journal operation; no automatic replay.
- GitHub Cloudflare Workers and Pages installation 159609040 has All repositories permission. Private-clone Connection blocked is not proven to be a repository-selection permission failure. Actual private clone remains unverified.

## Repairs

- Reject existing D1 names during read-only review; offer named D1 reuse choices. Keep the setup coordinator selected by default.
- Distinguish uncertain activation from a deployment still pending. Validate required form fields before review.
- Do not reuse the baseline D1/Workers/KV OAuth reference for Vectorize. Require its own appropriately scoped token and existing index until supported scope-aware authorization exists.
- Native database refusal uses a fixed safe error; no provider body or credential is reflected.
- Generated native snapshots omit the two public defaults from Wrangler vars. The deploy script restores identical values from marked snapshot settings; missing/malformed settings fail closed. Explicit configuration and active installs take precedence.

## Verification

PASS: workspace build; native-claim fault harness; hosted CF/Vercel activation; five hosted cloud mutations; 22 OAuth relay/retained-grant mutations; 13 shared binding form tests; hidden snapshot settings, native build metadata and deployment-button checks. Final workspace check in progress at this checkpoint.

Live repaired activation, generated source publication, private clone and browser form verification remain in progress. No completion claim until receipts are appended.

## Live delivery receipt

- Source repairs committed/pushed: `d0511dd` (validation, safe errors, resource choices, hidden defaults) and `f2a69ab` (delayed activation handoff and no-replay browser regression).
- README snapshot fast-forwarded without force to `adcc2ec047c866edb96d02dc62cbe6b84ef230d1`; published-source verifier PASS. Hidden-form native deployment proved with snapshot `80046f2` before the final handoff-only correction.
- Cloudflare form visibly omits both internal variables. Runtime defaults remain native + https://oauth.frontbase.dev.
- Private test `drmoyassine/frontbase-private-check-261027` is confirmed PRIVATE by GitHub API. Native Cloudflare build `ca63149a-40d1-4595-b68e-1cf4d71a9a6d` cloned/pushed/built/deployed successfully; its hosted setup and provider status both return 200. No repository permission change was made. The historical Connection blocked cause remains unproven; it did not recur after the owner's reauthentication.
- Exact failed journal operation recovered only after checking no application tables, runtime DB or cache existed. Ownership and grant preserved.
- Browser setup session expired. Owner explicitly approved a temporary, ten-minute, one-use, installation-bound recovery route. It restored setup handoff and was removed immediately; no recovery code is in source or final deployment. Final former route returns 404 without cookies; consumed local capability file removed.
- Live duplicate-name review now rejects the original erroneous CREATE plan before writes. Corrected reuse plan activated once: operation `5c2dac4d-3c60-46ec-9510-10225b99b284`, journal active revision 3, DB `49665a3b-8306-46bf-8325-8490f9a12001`, KV `eb3d886d33fd4cb0975b596ff46468ee`, bootstrap 0, health 200.
- Initial activation response was uncertain while the new runtime became healthy. Final UI preserves read-only readiness polling and administrator handoff without repeating apply; regression tests prove both ready and genuinely unconfirmed outcomes. This supersedes the initial early-stop behavior.
- Final frontbase-usa Worker version `62d9ec81-f778-4c9f-acd7-0288f383f024` contains committed code and retains all active D1/KV/session/authorization bindings.
- Browser shows secure setup link verified and the administrator email/password/confirmation form. Owner password submission is pending; no claim of administrator login or real-site template installation yet.

Final checks: workspace check/build PASS; final cf-full rebuild PASS; native setup suite and published-source verification PASS. Earlier hosted and OAuth mutation suites and shared form tests remain PASS. Unrelated pre-existing generated cms.mjs, finalization-plan changes, .agents and skills-lock files remain unstaged.

Remaining product deltas: Vectorize provisioning/broader OAuth scopes are not implemented by this repair; the existing-index adapter requires appropriate credentials. Long-idle hosted setup session recovery still needs a normal product flow. The operator recovery used here is not represented as such a feature.

## 2026-10-28 Kuwait time: administrator authorization expiry

Owner reported `http_403`. Live status at investigation: needsSetup=true, setupEnabled=false, setupExpired=true. Runtime administrator expiry was copied from the original provider-connection window; that window had elapsed during repairs. Error normalization presented a generic 403.

Repair `bfb35c5` gives each activation a fresh bounded one-hour administrator window, independent of the earlier owner/bootstrap deadline. The setup form checks status before submitting, presents actionable authorization/expiry errors and retains entered email/password/confirmation. Tests verify an almost-expired bootstrap still yields the full administrator window, and expired/refused submission never clears inputs or creates an account.

Live frontbase-usa setup expiry renewed for one hour without changing its token, account or resources. Previously approved temporary one-use recovery renewed the HttpOnly claim in a separate background tab, preserving the original entered form. Route removed immediately; final request returns 404/no cookie and local consumed capability file deleted.

Workspace check/build, hosted functional + five mutation tests, setup form, claim handoff, no-leak and mutation tests PASS. Final Worker `3dfdaaba-b775-4f2b-a106-e236007b9edf`; health 200, setupEnabled=true, setupExpired=false, updated setup SPA verified. Native snapshot `ec46a354d981ae3c16d2454c6c989791e2205b51` published and source verifier PASS. Administrator password submission remains the owner's pending handoff; no signed-in verification claim.


## 2026-10-28: refresh-safe setup authorization

Source `14d2749` committed/pushed. Status now returns only a boolean derived from the existing signed HttpOnly setup cookie with no-store; the setup page checks that status when no fragment remains. No capability is persisted in browser storage. Missing/tampered cookies and initialized installations remain unauthorized. Existing POST authorization is unchanged.

Workspace check/build PASS; backend setup, admin claim/form/no-leak tests and admin-console mutation PASS. Full backend mutation suite was not rerun for this read-only status change. Native source `1b618c7bc10cced6e564b84c2d7dab8318272258` published and deployment-button source verifier PASS.

Live Worker `aa2e69ed-146d-4618-820e-350eec36e9d3`; unauthenticated status false/no-store and health 200 verified. Browser claim had expired during investigation; previously approved installation-specific one-use recovery refreshed it without altering resources or the configured setup expiry. Recovery route removed and verified 404/no Set-Cookie; local consumed link deleted. Reloading the clean /setup#/setup URL now visibly retains Secure setup link verified and administrator form. Owner must submit the new password; no administrator-created claim. Unrelated pre-existing files remain unstaged.


## 2026-10-28: actionable setup errors

Source b2cc313 pushed; native snapshot ab0d255dcf291a6623c89c96127469812150602c verified; Worker 988134d6-d505-4148-8744-42750373561d deployed. Setup client recognizes error/detail codes and explains expired/invalid authorization, disabled setup, existing administrator, validation, database, HTTP, network and malformed responses without raw server details. Claim errors render outside the gated form; successful reauthorization clears stale errors.

Workspace check/build PASS; final admin check PASS after typed lookup correction. API/form/claim/no-leak and admin mutation tests PASS. A live synthetic invalid claim in a separate tab displayed the clear invalid-session message, not http_403; test tab closed. Live SPA and health200 verified. This covers first-run setup, not all broader product error surfaces. Administrator creation awaits owner password entry/submission. Unrelated work remains unstaged.


2026-10-28 owner retry: configured setup deadline had expired. Confirmed uninitialized state, renewed only SETUP_EXPIRES_AT for one hour and refreshed the existing setup claim in a separate background tab using the previously approved one-use recovery. Original entered form untouched. Verified secure form, removed route (404/no cookie), deleted consumed local link. Final unchanged application Worker 419cf4f4-7799-48ac-b0ed-8aa4b888cfe8. Owner submission still pending; browser claim remains bounded to 15 minutes.
