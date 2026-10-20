# cf-full Vercel preview failure incident — 2026-10-20

## Evidence and cause

Owner reported more than fifty failed-deployment emails, including preview commit `a708c3d` on `codex/wordpress-pilot`. The latest inspected build is `cf-full-a2c14ts01-mohamads-projects-f742d79e.vercel.app`, branch `codex/study-in-usa-translations`, commit `50ecbb4`. Its log fails in `edge-core` with TS2307 for `@frontbase/translation` and its subpaths. The example's clean-build fallback selects direct workspace packages without their dependency closure; the omitted translation package has no compiled exports on a fresh host. This proves the latest failure, not an assertion that every historical failure has the same cause. The twenty latest listed cf-full deployments all have ERROR state.

Project `cf-full` (`prj_9dkvX5bn10SumvHBC3e1Tj9PC53x`) in team `mohamads-projects-f742d79e` links the Frontbase GitHub repository, uses root `examples/cf-full`, and production branch `main`. Its ignored-build command was null. Automatic branch previews explain why ongoing development pushes repeatedly invoke this broken build path. No production outage is inferred from preview emails.

## Immediate reversible containment

Updated only this project's `commandForIgnoringBuildStep` through the authenticated Vercel CLI API, then independently read it back:

```sh
if [ "$VERCEL_ENV" = "preview" ]; then case "$VERCEL_GIT_COMMIT_REF" in codex/*) exit 0 ;; esac; fi; exit 1
```

This skips development previews on `codex/*`; production and other branch decisions remain enabled. Exact Bash checks pass for wordpress-pilot, deployment-profiles and study-in-usa-translations preview skip (0), main production continue (1), codex production continue (1), and an unrelated feature preview continue (1). Rollback is restoring the previous null command through Project Settings → Build and Deployment → Ignored Build Step. No environment values, notification preferences, domains, existing deployments or other projects were changed.

Vercel documents that ignored builds become CANCELED, still count toward deployment quotas, and do not run the application build. This is bounded incident containment; future intended preview testing can explicitly bypass the project's ignored-build step. It does not disable Git integration account-wide.

## Source repair and verification

`examples/cf-full/build.mjs` now uses pnpm's dependency-inclusive selector (`package...`) for each missing workspace artifact. The existing package dependency graph supplies order rather than a duplicate hand-maintained translation build step.

- `pnpm -r build`: PASS.
- `pnpm -r check`: PASS.
- `pnpm test:deployment-gates`: PASS.
- `pnpm --filter @frontbase/edge-core... list --depth -1 --json`: includes translation and edge-core.
- Actual `pnpm --filter @frontbase/edge-core... build`: PASS, translation builds before edge-core.
- `git diff --check`: PASS.

Private nonsecret logs: `vercel-preview-fix-build.log`, `vercel-preview-fix-check.log`, `vercel-preview-fix-gates.log` in the task evidence directory. No clean remote Vercel success, live database integration, public release gate closure or production redeployment is claimed. This correction remains on the isolated deployment-profiles branch until merged into another development branch; the project skip rule already applies to those branches.

Next: observe a subsequent development push as skipped rather than failed, then resume native KV/R2 and durable resource identity work. Preserve the separate translation stream and paused CF-22.