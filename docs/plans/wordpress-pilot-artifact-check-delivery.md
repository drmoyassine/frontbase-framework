# B internal education artifact checks

**2026-10-08; locally verified, uncommitted.** Implements a bounded syntax-check foundation within the [installer contract](wordpress-pilot-installer-recovery-contract.md). It does not adopt a public stable export format or the private example's installer. Existing six packages, editable nodes, shared schemas, authenticated administration and one engine remain unchanged.

## Delivered

`POST /api/project/template-artifact/check/` is registered in the existing backend app after default-deny authentication. Administrator roles only; strict JSON wrapper, no query parameters, streamed 1MiB request bound, no-store/noindex and opaque refusal. Success reports supported roles/version and `installAvailable:false`, `publicationAvailable:false`; no authorization token, operation, settings, pages or publication is created.

The internal `education-editable-v1` profile accepts one directory and at most four other distinct role pages: institution, program, article index and article. Template identity/version, shell slugs, page references, declared destination gaps and required SQL capability are checked. Destination datasource, identity, origin, contacts and scopes must be blank. The shared configuration, record/site binding and directory query validators are reused; site binding schema receives an additive re-export, with no change to its validation.

Supported editable primitives are Text, Paragraph, Heading, Link, Image, Container and Repeater. Strict node/prop grammar, bounded node/depth counts, unique IDs and matching template IDs exclude arbitrary components, expressions, raw HTML props, events, data requests and credential/provider state. Styles and viewport overrides accept a conservative value/key grammar, excluding URL functions, expression/import syntax and attribute/style delimiters. Links are blank or local paths; portable contacts use destination site bindings. Images have no static source; record bindings supply optional media. Required list/detail queries must exist for each role. Literal markup in text remains escaped by the existing renderer; this checker is not a new renderer.

Known credential-shaped strings and prohibited private-state keys are refused throughout the input. This is a bounded exclusion policy, not a claim to recognize every possible secret embedded in arbitrary prose. Artifact producers still must export only defaults and editable layouts. The profile does not accept all existing builder components or every historic saved layout.

Syntax acceptance is separate from [destination checks](wordpress-pilot-install-check-delivery.md). Neither route proves runtime/storage capabilities, complete record mappings, data/media availability, dynamic WordPress URL collisions, operation ownership or safe execution. Full preflight must compose these checks with server-resolved capabilities and exact destination-bound state; clients cannot combine two successful responses into install authority.

## Verification

| Gate | Result |
|---|---|
| Backend `test/template-artifact.mjs` | Existing five-role synthetic candidate accepted; 41 malformed/unsafe/destination-bound cases refused; real-app authentication, roles, bounds, opaque errors and no-write checks pass |
| Backend `test/template-artifact-mutation.mjs` | 8/8 faults detected; rebuilt GREEN functional baseline after each restoration; final source hashes match |
| `pnpm -r build`, `pnpm -r check` | Pass; existing chunk and mixed-import warnings retained |
| Destination preflight, draft changes, directory preview and site configuration | Pass; draft suite has 15 groups including independent process restart proof |
| Compatibility security/database security | Pass |
| Tenant matrix | 175/175 existing operations isolated; new artifact route's role checks are in its focused suite |
| Example `dist/smoke-host.mjs` | All pass |
| Strict compatibility conformance | Exit1 remains: 248 conforming, zero violating, nine unreachable, 77 verified refusals; 334 operations, 577 differential cases, 76 differing. Not waived |

Environment: Windows, Node26.7.0, pnpm10.15.1. Fresh generated-host sizes: CF517.1KB, Vercel517.6KB, Deno518.6KB min+gzip; client prohibited-symbol check passes. Generated `examples/cf-full/api/cms.mjs` remains uncommitted.

Verification corrections: the first backend compile exposed a missing shared schema re-export, which was added and rebuilt. The first test factory retained a capability-array reference from the private fixture; a refusal case polluted later candidates. The test now clones one clean baseline for each case. A combined import command exited when the first fixture called `process.exit(0)`; remaining gates were rerun in separate processes. The initial host filter matched no project; the correct example package was then run and passed. These attempts do not count as passing gates.

No real pilot database restart/migration, Supabase/Garage access, canonical data, saved layouts, approval/publication or deployment changed. No live provider or clean install/reuse acceptance is claimed. Full installer, recovery controls and final core/template packaging review remain open; R0 edition acceptance and release gates remain separate.

Next execution design: [database and namespace guarantees](wordpress-pilot-install-execution-design.md).
