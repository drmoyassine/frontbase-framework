# T3: guarded publishing in the existing admin

**2026-10-08. Bounded local implementation and verification complete.** [T3 delivery](wordpress-pilot-t3-delivery.md) is the current implementation/evidence authority; the design checklist below is retained. Preceding Step 2 checkpoint `fcf0f1c` is pushed; T3 changes are uncommitted. Retains the existing admin, six packages, trusted deployment owner and one rendering engine. No permission to publish actual content, new control plane, consumer-specific activation path or public low-level store endpoint.

## Outcome

An authorized site administrator can publish a specifically reviewed capture, update it or select a reviewed earlier capture for rollback. The interface clearly shows the version currently served and the version being proposed. Publication changes only the active pointer; it does not edit canonical content, saved configuration, layouts or review evidence. Partial bounded captures are labelled with included routes/record counts; publishing them is not a claim that all original production routes are covered.

## Server work

1. Add authenticated publication-state and activation controls alongside the existing preparation/read/review routes. Reuse their trusted `tenant` context, allowed administrator roles, bounded strict JSON handling, generic error responses and no-store headers. Never accept an owner/tenant from the request. Active-state reads validate the artifact and its own review; corruption is unavailable, never inactive.
2. Validate a target capture hash and an explicit expected active pointer, including generation; `null` means first publication only. Reuse the existing pointer schema. Do not accept implicit latest version, missing expected state, arbitrary artifact/configuration content or a forged review/actor.
3. Activate solely through `SitePublicationReviewStore.activate`, which checks the target's own immutable review and uses `SitePublicationStore` compare-and-set. Do not call the low-level activation primitive from HTTP. Return the resulting pointer on success, a conflict on failed comparison and a generic unavailable result for failed integrity/review/state. Same-target and repeated-click behavior must have an explicit regression test; never silently advance generations on an automatic retry.
4. Rollback uses exactly the same target-review and expected-pointer contract. Generation advances; an older capture never inherits another capture's approval. It neither restores database content nor overwrites a newer pointer with a stale expectation.
5. Return only bounded publication metadata needed by the admin, not raw artifacts, source credentials, private records or another owner's history. Preserve the existing public reader's inactive-only continuation and terminal400/404/503 behavior.

The final HTTP request/response schema and exact endpoint names must be implemented and tested together, not advertised as existing in this plan. The existing review and capture contracts remain the source of truth.

## Admin work

Extend `SitePreparationPanel`/existing Page Settings rather than add a second admin. Keep preparation, content approval, capture review and publishing visibly separate. Show current hash/generation and candidate review/included routes before the action; disable publication for unreviewed candidates. User selection is explicit; opening, preparing or reviewing a candidate does not publish it.

Freeze the target and expected pointer during an attempt. Prevent double clicks and stale component/configuration responses. A conflict prompts a fresh state read and deliberate reselection; never substitute the newer expected pointer and replay automatically.

If the response is lost, disable retry until authenticated read-back completes. If the target is currently live, report that observation without claiming which administrator's attempt succeeded. If state advanced to another version, require reassessment. If state cannot be read, retain the uncertain outcome and target details; never label it inactive or safe to retry. Reopening the panel must recover from server state, not a browser-local assumption.

Saved drafts/custom layouts remain intact. No automatic refresh of old template bindings, content approval or public activation is part of loading the new UI.

## Acceptance evidence

| Surface | Required proof |
|---|---|
| First publication | Reviewed target plus expected null succeeds once; concurrent first attempts have one winner |
| Update | Exact expected active generation succeeds; stale or omitted expectations cannot replace current state |
| Rollback | Earlier target needs its own valid review; stale rollback cannot overwrite a later update |
| Lost response | Read-back resolves currently-live/conflicted/unavailable states; no blind replay or duplicate generation |
| Authorization/isolation | Anonymous/disallowed role and cross-owner hash/state access refused; owner selected by server context |
| Invalid/corrupt input | Strict request allowlist/body bound; missing/corrupt/unreviewed targets do not change the pointer |
| Admin lifecycle | Double clicks, config changes, unmount/stale replies and reopening preserve uncertainty and deliberate choice |
| Real host on synthetic state | Publish/update/rollback through admin yields matching public hash/generation/HTML; no legacy decoy, mixed draft or stale SW content |
| Restoration | Existing publication mutation/CAS/owner/review chains plus new route/UI fault regressions go RED on break and GREEN after restoration |

Use isolated temporary databases and invented captures for implementation proof. Run workspace check/build, targeted admin/backend/browser tests and affected security/mutation/no-leak/conformance gates; preserve the nine known unreachable conformance fixtures as an explicit failure unless separately resolved under release governance.

Primary owns design, routes, UI integration and independent verification. Claim exact files in the audit before implementation; this plan dispatches no parallel agent. T3 controls becoming tested source does not authorize actual pilot review/activation. The later staging target, real content/layout acceptance, full migration/browsing, installer/inquiry/restore contracts and production cutover remain separate [execution gates](wordpress-pilot-execution-plan.md).
