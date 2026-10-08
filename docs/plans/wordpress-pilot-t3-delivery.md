# T3: guarded admin publication delivery

**2026-10-08. Primary-owned implementation and bounded local verification complete.** Preceding combined pilot checkpoint `fcf0f1c` is committed and verified on `origin/codex/wordpress-pilot`. This subsequent T3 increment is uncommitted. No actual pilot database, canonical content, saved layout, approval, activation or deployment was changed. All write tests use isolated temporary SQLite and invented captures.

## Delivered controls

The existing Page Settings → Directory → Site preparation surface now provides a publication panel after capture review. It shows the selected hash, its review, included URLs and checked live hash/generation. Unreviewed targets, unknown live state and already-live targets cannot be submitted. Confirmation is explicit; first publication requires a verified inactive state. An earlier reviewed capture can be reopened for rollback through the same control.

| Authenticated control | Contract |
|---|---|
| `GET /api/project/site-configuration/publication/state/` | No query parameters. Trusted server tenant only. Returns pointer and bounded public capture metadata, or both null when inactive. Artifact/review corruption or state failure returns generic 503, never inactive |
| `POST /api/project/site-configuration/publication/activate/` | JSON only; 4,096-byte body bound; strict `{hash, expected}` with required nullable existing pointer schema. Missing/forged fields return 422, non-JSON 415, oversized body 413. Server tenant and privileged roles are authoritative |
| Activation/update/rollback | Validate current artifact and own review, compare explicit expected pointer, validate target's own review, then call `SitePublicationReviewStore.activate`. Comparison/race conflicts return 409; unavailable/unreviewed/corrupt state returns generic 503. Successful same-target submission with matching expectation is a no-op; stale same-target retries are still refused |

Both endpoints are behind the existing default-deny authentication and explicit administrator role checks, return no-store/noindex, and expose no private review note, reviewer, datasource/table metadata or raw artifact. Pointer generations advance for updates and rollback. Public inactive-only continuation and terminal 400/404/503 are unchanged. Preparation/read/review still report `publicationAvailable:false`: those private operations do not publish; the separate guarded control does.

The UI freezes target/expectation during the request, blocks double clicks, rejects stale responses after candidate/configuration changes or unmount, and reads authenticated state after success or failure. A lost response never causes automatic replay. If the target is live, the interface reports that observation without attributing the action to an administrator. Different current state requires fresh confirmation; failed read-back leaves outcome uncertain and publishing disabled. Reopening/remounting requires a fresh state check.

Partial captures remain explicitly labelled. Capture bounds are still 48 records per collection, 1 MiB and seven templates; no whole-catalog, complete migration or production-readiness claim follows this control. It changes the active pointer only, not saved pages or canonical data.

## Verification

| Gate | Evidence |
|---|---|
| Workspace `pnpm -r build` | Pass; final focused backend rebuild and refreshed cf-full stage include the last JSON-boundary edit; final CF 512.0 KB gzip, no prohibited client symbols; existing warnings retained |
| Workspace `pnpm -r check` | Pass on final source |
| Console directory Vitest | 55/55, including eight new publication tests; legacy preparation assertions retain private-operation semantics |
| Backend `test/site-publication-controls.mjs` | Pass: anonymous/role refusal, cross-owner read/write, allowlist/JSON/body bounds, first-publication race, stale expectation, same-target no-op, update/rollback, actual public response identity, no-leak and unavailable/corrupt refusal |
| Backend publication/SEO functional fixtures | Pass; private preparation and public serving contracts retained |
| Chromium `publishing.config.ts` | 2/2 real-host admin journeys: checked inactive first publication with explicit confirmation and generation 1; selected reviewed update, forwarded request with browser reply deliberately dropped, authenticated read-back, generation 2, reviewed rollback to generation 3, public hash/HTML/contact behavior, unchanged saved pages, stale request 409 and 390px panel overflow check |
| Chromium `quality.config.ts` | 30/30 on refreshed console/host and a separate fixture run |
| Compatibility security/database security | Pass on final compiled source |
| Tenant matrix | 175/175 identifier-bearing operations isolated; 29 tables snapshotted |
| Built host smoke | Pass, including byte-identical Vercel stage, Deno disk/static/SPA and boot guards |
| Strict conformance | Exit 1 retained: 248 conforming, zero violations, 77 verified refusals, nine unreachable; CF-22 remains paused |
| New control mutation/restoration | 12/12 faults go RED, with rebuilt GREEN functional baseline after every restoration; final source SHA256 equals the pre-mutation source; final workspace check passes |

Verification corrections were not waived: the initial new fixture used a null summary contrary to the existing record schema; corrected to an empty string. A legacy test assumed one status element before adding the panel; it now asserts the specific preparation message. The first browser run consumed an old staged console. `build.mjs` deliberately retains the existing stage unless refreshed; using its documented `--refresh-console` option stages the freshly built console. A standalone Playwright request lacked the browser authentication context; protected assertions now run through authenticated browser fetch and explicitly require 200 for saved-page comparison. A build overlapped the last JSON-boundary edit, leaving old emitted JS; a final backend rebuild and refreshed host supersede that failed run. No runtime/auth/validation guard was removed to make tests pass.

The review-boundary fault deliberately bypasses both redundant target-review preflight and the guarded review-store activation wrapper. This is a coordinated boundary bypass, not evidence that removing either redundant check alone changes behavior. All other named fault cases are recorded in the mutation harness.

No fresh live database/storage audit, hosted update timing, production traffic, actual content review/activation, external install, second-country reuse or deployed restore proof was run. An authorized loopback probe found the real port 4389 preview stopped; it was restarted on loopback with its existing private state DB and session secret, without administrator seed variables. Administrator login returns HTTP 200. This restores the preview, not publication. The controlled-old-SW mutation chain is historical Step 1 evidence, not a new T3 result. Documentation checks pass: changed-line whitespace and 175 local Markdown targets, zero missing.

## Next executable work

E's restore preflight safety blocker is [locally repaired and verified](wordpress-pilot-restore-safety-delivery.md); settle B installer/D public-inquiry production contracts and production recovery adoption before production acceptance. Then prepare a concrete isolated staging slice for owner content/layout review; actual pilot activation requires that review. Complete missing editorial/media/essential-page coverage and whole-catalog browsing, then owner core/template/consumer packaging review, clean install/separate-country reuse and production operations/cutover acceptance. Use the [ordered execution plan](wordpress-pilot-execution-plan.md); Framework Developer Preview remains a recommendation subject to R0–R4, not a release label accepted by this pilot.
