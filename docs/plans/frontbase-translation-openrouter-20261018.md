# OpenRouter translation support

2026-10-18. Owner requests OpenRouter for the first real translation job. This is a bounded provider integration on source base6328570, not authorization to choose a model, reuse unrelated credentials or transmit content. Verified source37eadda and generated CMSf666361 are committed separately and pushed with receipt8f81272. That immutable checkpoint is deployed and verified on USA staging; real-provider acceptance remains open.

## Implementation

- Connected Accounts offers OpenRouter with the existing encrypted API-key fields and generic save flow. Its existing bearer-test strategy checks only `GET https://openrouter.ai/api/v1/key`; it returns success metadata without exposing the key-account response or generating text.
- Translation configuration accepts an owned, active OpenAI or OpenRouter provider account through one shared capability predicate. Configuration stores only the existing account reference, model, locale and output-limit contract. Saving does not call the model; execution stays disabled by default.
- The current `@frontbase/edge-infra/ai` HTTP invoker supports an optional OpenRouter protocol. Its OpenAI default/wire format remains compatible. OpenRouter uses `max_tokens`, the same bounded plain-text response/usage parser, cancellation, redirect refusal and no automatic transport retries. No SDK/dependency/native transport or engine fork is introduced.
- The host fixes the origin to `https://openrouter.ai/api/v1`; custom credential base URLs are ignored. Owned metadata is checked before decrypting credentials. Existing selected-content review, request allowance, lease/source/configuration fences and accounting remain authoritative.
- OpenRouter routing requires parameter support, denies provider data collection and disables provider fallbacks. Models ending in `:free`, plus `openrouter/free`, additionally request zero prompt/completion/request pricing. No fallback model list, preset or paid alternative is injected. The host does not claim to audit third-party billing or guarantee availability/privacy beyond the requested provider policy. Free offerings may reject the privacy/routing requirements; they fail rather than relaxing them.
- Native translation settings explain OpenRouter model IDs/free variants and routing behavior. A model is not auto-selected; free suffixes must refer to an available catalog entry. Keys belong in Connected Accounts, never translation settings or chat.

Official API references reviewed: [HTTP quickstart](https://openrouter.ai/docs/quickstart), [current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [provider routing and max price](https://openrouter.ai/docs/guides/routing/provider-selection), [free variants](https://openrouter.ai/docs/guides/routing/model-variants/free).

## Verification

Full `pnpm -r build` and `pnpm -r check` pass with Node24. The build regenerates the tracked CMS artifact; existing bundle warnings remain. Native translation UI tests30/30 pass (AI7, batch16, storage7), including saving an explicit free OpenRouter model with reference-only settings and no generation. Console checks retain their existing scoped type coverage, not a full legacy UI type-debt acceptance.

Fourteen functional suites pass: shared HTTP AI, OpenRouter connection test, translation generation, allowance, allowance lifecycle, batches, saved-view inputs, SDK HTTP, external requests, backend security, tenant matrix, response conformance, infra isolation and no-leak. OpenRouter request accounting is exercised with deterministic fake HTTP/provider responses through the real host runner: known usage completes/charges one request, missing usage remains uncertain, second jobs cannot exceed the same allowance. Tests use no real credentials or provider requests.

All15 provider mutations fail behavioral assertions and restore green, including fixed origin, correct token-cap field, free pricing/detection, data policy, required parameters and disabled provider fallbacks, plus the retained role/ownership/CAS/placeholder/completion gates. Source and built-artifact hashes restore exactly. Strict response conformance passes257 contracts/77 verified refusals with zero violations/unreachable operations. Remote D1/Turso/PostgreSQL isolation variants remain credential-gated; only the local fixture path is renewed.

The actual host graph bundles for browser-compatible ES2022 without Node/native database drivers or optional AI SDK imports. An offline packed AI subpath extracted into an external consumer passes OpenAI/OpenRouter protocol behavior and strict NodeNext declarations; this is not a full dependency-install or whole-framework consumability proof. [Sanitized gates](../../scripts/localization/openrouter-evidence/gates.json), [graph](../../scripts/localization/openrouter-evidence/import-graph.json), [packed adapter](../../scripts/localization/openrouter-evidence/package.json).

The shared worktree is not a clean-checkout or public release proof. Full multilingual UI/publication, actual model/provider acceptance and broader provider/deployment parity remain open. CF-22 remains paused.

## Next executable step

Select/connect the user's exact OpenRouter model and intended translation storage before reviewing a bounded batch and explicit request allowance. No owner SQL upgrade, configuration save, actual model request, content publication or npm release was performed. The native visual locale refinement/publication work remains separate.

## Staging delivery — verified

[Sanitized delivery evidence](../../scripts/localization/openrouter-evidence/deployment.json): immutable source8f812721fcc3e63d982bc2e2895d6b7b283cabf0 archive6,643,654 bytes/2,288 entries, SHA2566fcb7c295d2d70e162435eebb78ea4db3aa951daace2fb1a83505251d782ab57. Excludes12 synchronization/cache/private paths. The one allowed community env file contains only comments and the public VITE_DEPLOYMENT_MODE=self-host flag; initial packaging validation rejected comments before the exact noncomment assignment was validated. No private-file guard was weakened and no failed archive was uploaded.

One upload automatically starts EasyPanel newpanel.studygram.me → studygram/usa-frontbase-staging actioncmvdvuxy3003707qq0l1f84ns; done2026-10-18 13:51:50 UTC (16:51:50 Kuwait). Server frozen-install/workspace-build/client-symbol/docker gates pass. New container9fbb2b8c… is healthy on imagesha256:c4f97a18816a3fbb2a8aac47cf6853a1e1cb82d2eaeca8bf0efc21b3749fb867. Previous imagebd414cbb… retained as historical identity; no actual rollback or full image security-suite execution is claimed.

Exact in-memory comparisons preserve environment, mounts, deploy/build settings and ports. All8 before/after public/auth-denial statuses, byte lengths and SHA256 hashes match: health/Homepage/Explore institution/Explore program/Blog200, anonymous generation/storage/batches401. Fresh authenticated Pages preserves generation21, Homepage Changes pending and test/test Draft. Native Connected Accounts visibly offers OpenRouter and selects its blank API-key form; no key entered, connection test or save submitted. Translation settings show OpenAI/OpenRouter support, blank model, absent saved AI selection and disabled save/clear. Authenticated batch capability remains executionAvailable:false. Original user tab was not reloaded or edited; the temporary provider dialog was cancelled.

Source/generated/initial docs are pushed normally. Delivery docs/evidence are a separate checkpoint. Unrelated1826 staged index entries retain SHA25639a64bf3f4b29e82b1afd3c612c8a7962889fc50de4dd9a48c90a4d1022bad1c. Local full build/check and focused gates precede deployment; docs-only follow-up does not renew them or claim clean-checkout acceptance. No secret connector output was printed during this delivery; connector configurations/logs were kept private and only allowlisted status fields were rendered.
