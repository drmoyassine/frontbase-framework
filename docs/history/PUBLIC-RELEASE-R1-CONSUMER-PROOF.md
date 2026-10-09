# R1: external tarballs and pure starter

**2026-10-08; bounded local proof complete, uncommitted.** Follows owner acceptance of Framework Developer Preview preparation in [Decisions](DECISIONS.md). This closes the demonstrated workspace/scaffold defects for the pure engine starter. It does not complete R1, publish packages, select release versions or certify a full CMS deployment.

**Subsequent evidence:** [R2 response-fixture correction](PUBLIC-RELEASE-R2-CONFORMANCE-DIAGNOSIS.md) supersedes the nine-unreachable measurement below; response conformance now passes while behavior acceptance remains open. [Infrastructure binding repair](PUBLIC-RELEASE-R1-BINDING-TYPES.md) passes fresh runtime/starter and strict Node/actual Cloudflare type checks. Backend Drizzle declarations still fail, so runtime imports and starter build do not complete package acceptance. Original archive measurements below remain historical evidence.

## Changes and behavior

The pure starter formerly emitted workspace references and imported backend/database packages without declaring them. Its worker passed the asynchronous console construction result into a synchronous engine option. The external baseline reproduced the build failure. The starter now imports only its declared engine, uses the installed compiler/core package versions, and declares Vite for its emitted config. Package metadata resolution uses ESM import conditions; a first attempt using CommonJS resolution failed against the core's import-only export and was corrected.

Browser manifest generation now writes the source projection used for bundling and the compiled projection used at runtime. Previously the post-TypeScript step updated source only, leaving the compiled stub behind. Neither projection includes server query executors. The generated Worker config permits bundling imported packages rather than declaring `no_bundle=true`. Richer starter variants retain explicit provider/console placeholders and do not claim working administration or database setup; their unused placeholder imports do not add unexplained runtime dependencies. The setup SPA is now `private:true`, retaining exactly six publishable library candidates.

The compiler mutation harness now requires successful compilation of each source fault, rebuilds and reruns both existing functional baselines after each restoration, and checks source SHA256. This strengthens evidence independence without weakening a gate.

## Reproducible external proof

Build first, then run [release-consumer-proof.mjs](../../scripts/release-consumer-proof.mjs):

```powershell
pnpm -r build
pnpm exec node scripts/release-consumer-proof.mjs --online
# After populating the third-party cache, the same proof can run offline:
pnpm exec node scripts/release-consumer-proof.mjs
```

Each run creates a new temporary directory outside the monorepo, packs six libraries, records hashes/command outcomes, installs them using explicit `pnpm.overrides` pointing at those immutable tarballs, and imports every declared public entry. It then invokes the packed CLI to create a **sibling** starter, so the starter cannot inherit the six-package consumer's dependencies through a parent directory. Both dependency trees are checked for symlinks escaping their respective roots. The starter retains its own declared dependencies and uses the same unpublished tarball overrides; no workspace/source links or copied source modules substitute for package contents.

Final expanded offline run: **23 public entries imported; 14 commands exit0; no generated workspace references.** Starter install/build/test/check and direct compiled worker responses for `/` and `/sample` pass. Source and compiled browser projections agree and omit `execute`. All temporary proof artifacts remain outside Git at `C:/Users/drmoy/AppData/Local/Temp/frontbase-r1-consumer-IseZ49`; `evidence.json` records command output and archives. This is evidence on Windows/Node26.7.0/pnpm10.15.1, not an independently established Node/OS matrix.

| Packed package | Version | SHA256 |
|---|---|---|
| edge-core | 0.0.0 | 0d600a38613e6aa3a756881c388b2dc304b38688795ff3465e82dedb4e836e8c |
| compiler | 0.0.0 | d9c2785cd0d7278ace98de213fcf43a4084955ca29cfbe1ecc7fddab75a97d7d |
| ui-components | 0.0.0 | 6ed177a54da9e0dcaed16e08696645993728725106e57f110394bd826e2f8b26 |
| edge-infra | 0.0.0 | aac50ec8a7ffad89a92991e3d5616ab73425c09c8e3452aa1be52f0a85020b5e |
| backend | 0.0.0 | 8f95ce187bb3018253dbef3df423cd3b219f25c65df92e192cfa0af455b1cae2 |
| builder | 0.1.0 | bb861b202a098491708d2a6225bf8f2bd1ec3bc294f2fba3c267cf75307fda48 |

These are local working-tree artifacts, not reproducible released binaries. Overrides resolve the unpublished internal graph; they are **not a registry consumer proof**. All installs use `--ignore-scripts`; necessary dependency lifecycle acceptance remains open. The starter's normal TypeScript build uses its declared configuration including skipLibCheck; exhaustive public declaration checking for all six libraries is not claimed.

Failed attempts are retained: first offline run lacked pgpass metadata; online fallback populated ordinary third-party dependencies. Original scaffold external build failed on asynchronous console wiring. The first successful baseline had a nested starter that could inherit consumer dependencies; the final proof corrected that setup and uses siblings. CommonJS metadata resolution failed locally and in a fresh packed consumer; ESM resolution fixed both. Those failures are not counted as passes.

## Integrated verification

| Gate | Result |
|---|---|
| `pnpm -r build`, `pnpm -r check` | Pass; existing chunk/mixed-import warnings retained |
| `pnpm --filter @frontbase/compiler test` | Full existing command passes, including CLI, manifests, SW emission, deploy fixtures and secret-input handling |
| Compiler `test:mutation` | 3/3 faults detected; restored GREEN baselines after each source fault, source hashes match |
| Setup SPA `test/no-leak.mjs` | Pass, including its fresh SPA build |
| Example `dist/smoke-host.mjs` | All pass |
| Backend strict conformance | Exit1 remains: 248 conforming, zero violating, nine unreachable, 77 verified refusals; 334 operations, 577 differential cases/76 differing. No waiver |

Fresh host build remains CF517.1KiB, Vercel517.6KiB, Deno518.6KiB min+gzip. The build log labels its byte/1024 measurements KB; README now points to dated evidence and clarifies the measurement basis instead of retaining stale fixed sizes. Readiness wording now distinguishes tested encryption/reset implementations from still-open deployment/security acceptance. No real database, canonical content, browser session, storage, publication, host deployment, registry or credentials changed. Prior pilot source and Python bytecode are preserved; changes remain uncommitted.

Next: diagnose the strict conformance fixture gaps, prove full public type/lifecycle consumption, and design the versioned full CMS clean-room path. Registry/version/release operations and actual host deployment require their own accepted evidence and authorization; CF-22 remains paused. Pilot installation/namespace, forms and full migration remain separate unfinished work.
