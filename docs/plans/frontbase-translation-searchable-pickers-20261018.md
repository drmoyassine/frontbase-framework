# Searchable translation model and language pickers

2026-10-18. Owner requests a searchable model dropdown and language lists. Source base015cb90. Local implementation is verified; scoped commits and staging delivery are next. This does not authorize choosing/saving a model, changing language/storage configuration or generating translations.

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

Commit/push source/evidence, generated CMS and documentation separately. Deploy the immutable checkpoint to existing USA staging under the ongoing delivery authorization, preserving environment/mounts/publication/drafts. Verify the owned OpenRouter catalog and embedded model/language search read-only; cancel ephemeral selections without saving or generating. Then the user can choose model/languages through these controls before reviewing the first bounded translation batch and allowance.
