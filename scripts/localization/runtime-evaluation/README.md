# Isolated localization runtime probes

These packages are evaluation fixtures, not adopted Frontbase application dependencies. The checked-in lockfile pins transitive versions; install into a disposable directory outside the workspace with lifecycle scripts disabled.

```powershell
$evalRoot = Join-Path $env:TEMP 'frontbase-localization-evaluation'
New-Item -ItemType Directory -Force -Path $evalRoot | Out-Null
Copy-Item scripts/localization/runtime-evaluation/package.json,scripts/localization/runtime-evaluation/package-lock.json -Destination $evalRoot
npm ci --prefix $evalRoot --ignore-scripts --no-audit --no-fund
node --disallow-code-generation-from-strings scripts/localization/evaluate-runtimes.mjs $evalRoot (Join-Path $evalRoot 'results.json')
```

Run from repository root after normal workspace dependencies (esbuild) are available. Node24.19.0 was used for the recorded result; messageformat4.1.0 declares Node ^20.19 / ^22.12 / >=24. `--disallow-code-generation-from-strings` applies to these executed fixtures; it is not a full security proof.

All four candidates pass the selected Arabic plural, variable-reordering/display, independent-instance and dynamic-message-update fixtures. i18next owns catalog/fallback behavior; the two message-only candidates use explicit host fixture wrappers, so measurements are not a complete application comparison. Plain i18next JSON does not parse ICU syntax; its malformed-ICU observation is not a defect. ICU plugin strict parser behavior and cache invalidation are explicitly configured. Missing interpolation in core i18next requires a separate validation policy.

The MF2 probe strips isolation controls only for semantic assertions while recording their presence; it does not disable bidi isolation in the formatter. Output is text, not safe HTML: production rendering must escape or use validated parts/trees. No candidate is selected.

The fixture's browser-target bundle measurement includes its imported runtime constructor and parser; it does not include a complete Frontbase catalog/backend or routing layer. Single-run timings vary considerably and are not adoption criteria. Real browser/worker parity, native renderer rich-text integration, sustained performance/cold start and storage/publication remain open.

Pinned package license metadata observed from official npm registry/package manifests: i18next26.4.7 MIT; i18next-icu2.5.0 MIT; intl-messageformat12.1.3 BSD-3-Clause; messageformat4.1.0 Apache-2.0. Use the selected exact package license, not a blanket assumption from an older repository page.

## Host and native Intl reference probe

```powershell
node --disallow-code-generation-from-strings scripts/localization/evaluate-hosts.mjs $evalRoot (Join-Path $evalRoot 'host-results')
```

This also needs the workspace-installed Wrangler/Miniflare toolchain (recorded Wrangler4.129.1, Miniflare5.20260907.0-alpha, local workerd compatibility date2026-09-14). It uses Miniflare's programmatic API plus its exported V4 options converter, not a project Wrangler config. No project bindings, environment files or credentials are loaded. Worker outbound fetches are refused and telemetry is disabled. Dependencies remain isolated; no runtime adoption or deployment takes place. A loopback/native-process sandbox may require running this fixture with appropriate local permission.

[Recorded host results](results-hosts-node24-windows.json) pass matching Node/local-workerd Arabic output, number/date formatting, dynamic replacement, eight concurrent request fixtures per host, independent locale instances and hostile interpolation through the existing native Text renderer. This is local execution, not deployed Cloudflare or actual-browser evidence. It does not validate rich-text editor integration or either HTML shell's locale/direction behavior. Node runs prohibit string code generation; Workers retain their normal runtime restrictions.

The fifth option, `native-intl-reference`, has no message library or parser. Its hand-authored functions supply the greeting/catalog/fallback; Intl supplies plural categories and number/date formatting. Do not interpret its passing samples or lack of package bytes as a complete product implementation or like-for-like cost comparison. **None of the shortlist is a valid decision**, with a separate implementation/maintenance case required before adoption. Plain messages/rich-text storage can remain independent of that decision.

The harness first checks a dependency-free worker, so environment failures do not reject a localization candidate. A failed run records its stage, exits nonzero and never claims parity. Startup errors can also affect disposal; cleanup error codes are preserved. Initial attempts exposed the installed compatibility-date limit, a Wrangler watcher/log feedback loop and Windows file-backed module startup errors. Using the isolated programmatic API and inline bundle content resolved those harness failures; the recorded final run passes. The fixture bundle on disk is not imported by the Worker at runtime.
