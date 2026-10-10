# R2 Neon: strict external package experiment

2026-10-10. Primary continuation of the [transport proposal](PUBLIC-RELEASE-R2-NEON-TRANSPORT-PROPOSAL.md). This proves a local candidate can be delivered as a typed archive; it does not adopt that dependency or repair production Neon. Six framework packages and the accepted Developer Preview scope remain unchanged.

## Reproducible candidate

[Experiment script](../../scripts/neon-client-package-experiment.mjs) independently copies the installed MIT-licensed `@neondatabase/serverless@1.1.0` to a uniquely named private temporary directory. It rejects changed source hashes and nonunique patch anchors. Neither pnpm's installed package/store nor workspace dependencies are modified.

The candidate identity is **`@frontbase-experiment/neon-client@1.1.0-frontbase-experiment.0`**, marked private with lifecycle scripts removed. It never masquerades as upstream Neon. Exactly five original files differ: `index.mjs`, `index.js`, `index.d.mts`, `index.d.ts`, `package.json`. An additional `FRONTBASE-EXPERIMENT.md` records derived provenance and modifications; upstream LICENSE bytes remain identical. All other original bytes match.

- Both ESM and CommonJS runtime closures select the explicit client hook before the upstream global default. They preserve upstream serialization/result parsing, without a second SQL protocol implementation.
- Both declaration formats introduce `NeonClientOptions` extending the existing transaction options, with a precise Fetch-compatible `fetchImpl` signature. Only the `neon()` constructor accepts the new option; query/transaction options remain upstream types. There is no added `any`, cast, skipped library checking or ignore directive. Existing upstream declaration types are unchanged outside this additive option.
- The private candidate is packed, then installed from its archive into an external consumer using offline pnpm with lifecycle scripts disabled. Runtime/declaration/license/notice bytes are verified against the candidate. pnpm changes manifest formatting; every parsed metadata field is verified instead of pretending those bytes are identical.

```powershell
node scripts/neon-client-package-experiment.mjs C:/Users/drmoy/AppData/Roaming/npm/node_modules/pnpm/bin/pnpm.cjs
```

The argument is this machine's installed pnpm entry; other machines provide their own `pnpm.cjs` path, or invoke through pnpm with its `npm_execpath` available. TypeScript is the repository's installed compiler, invoked against external files with no ambient workspace types (`types: []`). This is not an independently downloaded compiler/clean-machine proof.

## Verified results

Final evidence: `C:/Users/drmoy/AppData/Local/Temp/frontbase-neon-package-zALTOa/evidence.json`. Earlier full run `frontbase-neon-package-FKsHVa` passed the same type/runtime profiles before installed-byte verification was added. Both archives have SHA256 **`4f0ae933fb0666d54911034c1b3442c1da2e67973e6ef7a72fcd5c646ee18c35`**. Equality of these local repeats is evidence, not universal cross-toolchain reproducibility.

| Command/profile | Exact outcome |
| --- | --- |
| Private candidate `pnpm pack` | exit 0 |
| External offline archive installation, scripts disabled | exit 0 |
| Strict NodeNext, ESM `.mts` and CommonJS `.cts`, `skipLibCheck:false` | exit 0 |
| Strict Bundler, ESM `.mts`, `skipLibCheck:false` | exit 0 |
| Invalid numeric hook and unsupported query-level hook | expected exit 2, diagnostics on both exact fixture lines |
| Installed archive ESM and CommonJS runtime | exit 0; owner A/B transport separation, POST/auth/parameter serialization, empty UPDATE rows with count seven, unchanged SDK globals, zero raw fetch calls |
| Original installed package full hash inventory after execution | identical |

Node 26.7.0 on Windows. All URLs/credentials and SQL responses are invented; global fetch is replaced only inside the temporary runtime test process with a throwing offline sentinel, then restored. No socket or live provider access occurs. Existing nine-group [in-memory experiment](../../packages/backend/test/neon-client-experiment.mjs) separately supplies guarded endpoint/redirect/denial/cancellation/batch and hook-removal counterfactual evidence; this archive test is not a substitute for production adapter mutations.

Two harness failures are disclosed: first `pack --out` passed a directory instead of a file (EISDIR before consumer execution); added manifest byte equality then failed solely on pack's formatting normalization (parsed manifests independently compared equal). Corrected output argument and strict semantic metadata comparison; final repeated proof passes. Neither failed run proves package or security acceptance.

## Decision and production backlog

Prefer a supported upstream client-scoped API. The tested interim alternative is an explicitly maintained, pinned dependency patch/artifact whose provenance and typed ESM/CJS delivery are inspectable. Choosing to maintain that artifact is a durable maintenance/distribution decision, distinct from this agent's feasibility observation. No package is published and no manifest/lockfile is adopted here.

Before production adoption, record who owns upstream/security updates, exact source revision/license notices, naming/distribution and immutable artifact verification. Replace the minified version-specific prototype with a reviewed source-level build or a reproducible accepted patch strategy. Verify Node 20/Cloudflare/claimed hosts and external supported TypeScript versions; no universal compatibility claim follows from Windows Node 26/current compiler.

Then integrate the typed per-client seam through the existing edge-infra runner/backend caller boundaries, correct `.query()` and validated full-result affected-row handling together, and prove actual query/exec/count/error behavior. Complete guard/no-fallback/owner/cancellation/secret-safe route fixtures and independently restored production mutations, workspace checks, security/conformance/no-leak and host gates. Malformed/absent counts, native PostgreSQL state and namespace coordination remain distinct acceptance tasks.

The current application still has the Neon API/global-transport/count defects diagnosed previously. Supabase/Turso/D1 bounded HTTP repairs remain separately verified. R1/R2, the installer and full USA migration are open. No live state, canonical import, publication/activation, deployment, commit/push or CF-22 changes occurred.
