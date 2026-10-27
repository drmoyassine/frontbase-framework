/**
 * Committed Deno Deploy entrypoint. The real server is the BUNDLED build
 * output deno-dist/deno.mjs (staged by `pnpm -r build` together with its own
 * fresh console-dist/ copy), but a build output does not exist in a fresh
 * clone — and Deno Deploy's project-creation flow validates the entrypoint
 * against the working directory before any build runs. This file exists in
 * the clone, satisfies that validation, and after the build simply hands
 * off: importing the bundle starts the server (Deno.serve).
 *
 * Referenced by deno.json → deploy.runtime.entrypoint. Do not run this file
 * before `pnpm -r build` — the import target only exists after it.
 */
import './deno-dist/deno.mjs';
