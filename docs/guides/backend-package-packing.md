# Backend package packing

Use the pinned package manager and build the workspace before packing:

```sh
pnpm -r check
pnpm -r build
pnpm --filter @frontbase/backend pack:release --pack-destination /absolute/output
pnpm exec node scripts/release-consumer-proof.mjs --online
```

The release-consumer script is `scripts/release-consumer-proof.mjs`. It packs all seven library candidates, installs their archives into a separate temporary project, imports every public export, and checks actual package declarations under strict NodeNext and Bundler resolution with `skipLibCheck: false`. It also builds/tests/checks an independent pure scaffold. A successful local proof does not publish a package or certify a registry installation.

The backend currently pins Drizzle 0.36.4. Its cross-dialect declarations contain upstream compatibility errors. `patches/drizzle-orm@0.36.4.patch` corrects declaration signatures only. Workspace installs apply the pnpm patch; external consumers must not need that root configuration.

`scripts/pack-backend.mjs` therefore stages the built backend and a real-directory copy of the corrected Drizzle dependency in an isolated temporary folder and bundles that dependency into the backend archive. It retains the upstream license and adds a notice. Before packing, it verifies that all 1,232 upstream JavaScript/CommonJS/map files match the committed aggregate digest in `scripts/release-evidence/drizzle-runtime.json`. It emits a separate archive-side dependency inventory. It does not edit the workspace linking strategy or an installed package store.

Raw backend `pnpm pack`/source-directory publication is refused by `prepack`; use the verified archive. Other libraries retain their normal packing path. Registry publication needs its own approved version and target. `mysql2` satisfies upstream declarations that refer to its types; Frontbase does not import it in runtime paths or add a TCP database adapter. This patch does not repair a consumer's separate installation of another Drizzle version.
