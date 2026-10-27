# Route policy reconciliation and preflight prefix repair

**Subsequent preparation guard:** [Preparation URL serialization guard](wordpress-pilot-preparation-url-serialization.md) refuses new candidates whose original path differs from browser pathname spelling, before capture persistence, without renaming URLs or changing saved-artifact compatibility. Original regression fails, repaired acceptance and publication mutation 27/27 pass; workspace/security/tenant/conformance/SEO/host/no-leak gates pass. Next: intended host reserved/fallback inventory and a bounded unpublished catalog inventory. Existing raw captures need separate review; broader grammar alignment, browser preview, state admission/recovery and all writers remain gates. No M2 or release clearance. Earlier receipts below remain historical.

2026-10-10. Bounded correctness repair plus measured remaining differences. This does not establish a universal URL normalizer or complete installer policy.

## Reproduced and repaired

The actual template-preflight endpoint accepted `/builder/x` with HTTP 200. Expanded synthetic acceptance expects 422 and fails against the original built handler. The host already owns `/builder`, `/frontbase-setup` and `/console`, and the capture schema already refuses them. Added these three prefixes to the existing preflight reserved expression, preserving its case-insensitive key handling and segment-boundary matching. Checks occur before datasource resolution/probing. `builder-course`, `frontbase-setup-guide` and `console-studies` remain allowed. No original public URL, stored page, capture or resolver is rewritten.

Changed production surface is one reserved expression in [template-preflight](../../packages/backend/src/compat/routes/template-preflight.ts). Expanded its existing acceptance and reconciled the [route diagnostic](../../packages/backend/test/route-identity-diagnostic.mjs); the independent eight-fault production mutation gate is required before closeout. Mutation source/build slot is exclusive and source must be restored before other build/regression evidence.

## Remaining differences are explicit

| Surface | Current semantics | Remaining acceptance need |
| --- | --- | --- |
| Legacy public serving | Decodes request path and strips boundary slashes; exact case lookup | Intended host fallback/owner inventory and cross-family collision policy |
| Capture resolution | Exact stored path versus Request URL pathname | Preserve original paths; reject or review unservable serialization forms before preparation |
| Capture collision schema | Decodes path, removes one final slash; case-sensitive | Case variants need explicit ambiguity review alongside legacy serving |
| Read-only namespace audit | Conservative ASCII/hyphen paths; lowercase/slash potential-conflict groups | Unsupported is a review refusal, not permission to rewrite valid original URLs |
| Template preflight | Conservative lowercase/slash keys; known host prefixes refused | Remains destination-only, not reservation, complete catalog inventory or install admission |

The expanded diagnostic includes underscores, dotted segments, repeated separators and encoded spelling: capture schema/runtime accept these exact fixtures while the conservative audit refuses them for review. `/health/x` remains capture-schema accepted but audit/preflight reserved; this is not resolved by changing historical evidence. Raw `/café/` passes capture schema but Request serializes it to `/caf%C3%A9/`, so exact resolution misses. This is a reproduced preparation/serialization gate, not a reason to silently rename an SEO URL. Host/proxy evidence and source-original-path review are needed before broader policy adoption.

No new architecture or release choice is made. Framework owns reusable core controls; education templates consume them. One engine, six packages, existing admin, self-host boundaries and paused CF-22 remain unchanged.

## Verification status

Original expanded preflight acceptance: exit 1, `/builder/x` returned 200 rather than 422. Repaired acceptance and final rebuilt rerun exit 0. Existing production mutation gate passes 8/8 with independently rebuilt RED/restored GREEN for role, trusted owner, wire bounds, reserved routes, deleted collision, namespace completeness, mapped columns and post-probe recheck; original restored source hash is identical. This source/build slot was exclusive until restoration, before workspace/host checks.

Workspace `pnpm -r check` and `pnpm -r build` exit 0. Final route diagnostic 8/8, compatibility security, tenant matrix 175/175 (29 tables/two public capability operations), captured SEO, built-host dispatch and no-leak exit 0. Existing conformance remains 334 operations: 257 conforms/77 verified refusals, zero violations/unreachable/no-schema/stubs; differential 577 cases/76 differing. This is existing-contract evidence, not closure of all behavior gaps or coverage of every added endpoint.

Existing chunk/dynamic-import warnings remain; host gzip CF 519.3 KiB, Vercel 519.9 KiB, Deno 520.9 KiB; prohibited client symbols zero. Restored preflight SHA256 `288e69fda595a6bb669301ed01468c3cd82c6e310ea577b6a7135aabe9a83149`; expanded diagnostic `ee02f2481d3f9ecbeab7d580b11d816a5e8c28215ab9bb7f852cf0cb69206fef`; external audit worker `b24601b47e745d7d3148430a8e8245c889ac1e12cf8b921be0b2f9c317da2220` remains intact. No primary subprocess/build lock remains; all changes uncommitted.

No real datasource, saved pilot state, live provider, fresh WordPress/Supabase/storage reconciliation, browser proof, publication, deployed host/proxy or Git action occurred. No complete production mutation matrix is claimed; this change ran its existing preflight-specific gate. Modified production expression, acceptance/diagnostic, generated host and this report/current-plan receipts; unfamiliar/external changes preserved. Strategy/Decisions/README release boundaries remain unchanged.

## Next executable work

Prove browser URL serialization/encoded-original-path admission and intended host dispatch before tightening capture preparation. Expand reserved/fallback host inventory. Full unpublished catalog inventory, runtime adapter admission, trusted containment/recovery, all writers and installer coordination remain open. No M2 or R1–R4 clearance follows from a prefix fix.
