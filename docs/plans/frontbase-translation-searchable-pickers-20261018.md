# Searchable translation model and language pickers

2026-10-18. Owner requests a searchable model dropdown and language lists. Source base015cb90. Source5692e30/generateda0f3c7d/receipt2087c93 are committed, pushed and deployed to USA staging. Local gates and actual OpenRouter metadata/search acceptance are verified. This does not authorize changing saved model/language/storage configuration or generating translations.

## User experience

- Model is a dropdown with embedded name/ID search. Selecting an AI connection loads its catalog; switching connections clears the previous unsaved model and cancels/ignores obsolete responses. Free OpenRouter variants are labelled and sorted first. Explicit Refresh models retries discovery without modifying settings.
- Source language is a searchable single choice. Target languages is a searchable multiple choice with checkmarks and Done, bounded to16. Search includes English names, language codes and native names. The source is disabled in targets; choosing a source already in targets removes that target. Saving remains explicit and uses the same canonical BCP47/configuration validation.
- Language labels reuse native Intl/CLDR and canonical locale validation, covering named two-letter languages, common regional/script variants and every already-saved valid locale. No language-data/runtime dependency is added. Language display names are not claims about a model's translation quality or supported languages.
- Saved models absent from the catalog remain visible and unchanged; failed discovery preserves selection and shows a safe retry. The catalog is a convenience, not new execution/approval authority. OpenAI's catalog does not expose per-model Chat Completions compatibility, so the UI states that compatibility/current availability is checked when an authorized job runs.

## Reused boundaries

The scoped picker composes existing Command/Popover/Button primitives. It avoids the unrelated custom multi-select's arbitrary-value creation and nested interactive badges. No generic widget behavior changes. Translation AI is added to the existing scoped UI type gate.

Authenticated `GET /api/project/translation-generation/models/:accountId` inherits owner/admin and no-store middleware. Model discovery and invocation share the same owned-active provider/key resolver. Decryption follows ownership/kind/provider checks; canonical guarded origins ignore custom credential URLs. The server performs only provider catalog GETs and returns validated ID/name/free metadata, never credentials or raw provider descriptions/accounting payloads. OpenRouter text input/output modalities are checked. Responses are bounded to8MiB/5,000 rows with a10-second request deadline, strict UTF-8, deduplication and safe errors. There are no automatic retries, settings writes, prompts or model calls.

Official metadata contracts reviewed: [OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list), [OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties). Shared sanitized UI/backend response validation lives beside existing host/UI localization contracts; the standalone translation engine has no dependency on the builder or this picker.

## Local evidence

[Sanitized gates](../../scripts/localization/pickers-evidence/gates.json) and [actual route import graph](../../scripts/localization/pickers-evidence/import-graph.json): full pnpm -r build/check pass;35 native translation UI cases pass (12 AI,16 batch,7 storage);13 functional suites pass, including new catalog/auth/ownership/redaction/bounds, existing provider/accounting/batch/view/security/tenant/strict conformance and no-leak gates. Nineteen compile-and-run provider/catalog faults fail behavioral assertions and restore exact source/artifact hashes. Strict response conformance remains257 contracts/77 verified refusals, zero violations/unreachable operations. The actual route bundles for browser-compatible ES2022 without Node/native database drivers or optional AI SDK imports.

Initial catalog fixture encrypted accounts with the wrong session secret; it was corrected to exercise actual resolution. The first new size-bound mutant survived because invalid oversized JSON independently failed parsing; valid oversized catalog fixtures now independently kill both declared and streaming bound faults. UI interactions now wait for the previous dropdown's close transition before opening another, avoiding detached test nodes. Temporary diagnostic traces were removed and are absent from source/generated CMS. These failed intermediate attempts are not counted as passing gates.

Existing bundle warnings remain. Console type checks retain scoped coverage; full legacy UI type debt, all-framework external consumers, real provider generation, remote credential-gated isolation variants, native locale publication and public-release gates are not renewed or closed. No SQL, dependencies, credentials, live data or saved settings changed. CF-22 remains paused.

## Next executable step

The user can choose model/languages through these controls and explicitly save the configuration. Intended translation storage/protocol acceptance and a reviewed bounded batch/allowance precede the first real translation request. Native visual locale editing/publication remains separate; execution is still disabled on staging.

## Staging delivery — verified

[Sanitized deployment evidence](../../scripts/localization/pickers-evidence/deployment.json): immutable2087c9353cbfd2eb4c703275f473dc93f7ddda1f archive6,659,517 bytes/2,297 entries, SHA2565cb9e41a4d4793b11d3121d3ac09a758473c6b57573f5e4a32d1cf79025959b9. Source-only archive excludes12 synchronization/cache/private paths and validates the allowed public community build flag; no worktree overlay or secret files.

One upload to newpanel.studygram.me → studygram/usa-frontbase-staging starts actioncmve9iv6n003h07qq2xs46u7f, done2026-10-18 20:14:31 UTC (23:14:31 Kuwait). Server frozen install, workspace build, client-symbol and Docker gates pass. New containerc0d0bd97… is healthy on imagesha256:dcb93b5547e7049f1fa73aff894bc65256e95326f36fb243c750bc4a65246d53; previous imagec4f97a18… is historical identity, not an actual rollback test. Full image security-suite execution is not renewed.

Environment, mounts, build/deploy settings and ports exact-match before/after. All8 public/auth-denial statuses, byte lengths and hashes match: health/Homepage/Explore institutions/Explore programs/Blog200 and anonymous translation generation/storage/batches401. Fresh Pages preserves generation21, Homepage Changes pending and test/test Draft.

The user had independently saved an OpenRouter connection, modelopenrouter/free, sourceen and targetar since the preceding delivery. The fresh verification tab automatically loads the actual owned OpenRouter catalog, resolves the saved model to its Free Models Router label, searches model IDs and language names, and supports temporary French/Spanish multiselection. Only catalog metadata is fetched; no prompt or generation is submitted. Temporary form edits are discarded by reloading only the agent's fresh verification tab. Saved OpenRouter/free/en/ar values restore and host execution remains disabled. No Save AI/storage settings or connection test, credentials, SQL, publication or model-generation action is performed; existing user tabs are untouched.

Source/generated/initial receipt checkpoints are pushed; delivery evidence is a separate documentation checkpoint. Unrelated1,840 index entries remain byte-identical, SHA25679cf82907c9d15909354dc44ba473dd55432f802607e754535e61ee85ede623d. Read-only actual OpenRouter catalog acceptance does not certify OpenAI credentials, translation output quality, billing or full multilingual publication. No new release/CF-22 claim.
