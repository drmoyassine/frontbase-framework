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
