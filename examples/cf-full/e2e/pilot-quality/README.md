# Pilot quality acceptance (swarm2 workstream C)

Independent browser/engine acceptance fixtures for the WordPress pilot
directory surfaces. Nothing here touches the first swarm's generators,
runtimes or styles: this folder only ADDS fixtures, a Playwright config and a
spec that drive the already-built self-host artifact.

## What it does

1. Builds `examples/cf-full` (console bundle + `dist/node.mjs`).
2. Boots the real Node self-host entry on `127.0.0.1:4393` (configurable via
   `PILOT_QUALITY_PORT`) with an EPHEMERAL SQLite state database in the OS
   temp dir — one fresh database per run, deleted by nobody, shared with no
   other server. The primary's server/database at port 4389 is never touched.
3. Seeds that database through the framework's own stores (`seed/global-setup.ts`):
   synthetic canonical tables, a shared configuration (two revisions), five
   saved role templates built with the existing console generators, two
   synthetic article approvals, and a capture prepared + reviewed + activated
   through the existing internal reviewed-publication pipeline. All rows are
   invented fixture data (`fixture-data.ts`); review notes say so explicitly.
   A second capture (contacts absent) is prepared and reviewed but never
   activated — it is only rendered through the authenticated private preview
   endpoint.
4. Runs `pilot-quality.quality.ts`: serving/routing matrix, local timing and
   response-size budgets, accessibility and reflow checks at 320/375/768/1280,
   keyboard focus walks, empty/pagination states, list-vs-detail behavior,
   blog rendering, the no-contacts preview, and a read-only admin authoring
   pass (login, pages panel, builder canvas, publication read contract).

## Run

```sh
# from examples/cf-full (deps installed, browsers installed once):
pnpm e2e:quality
# or with a private evidence directory for screenshots/metrics:
PILOT_QUALITY_EVIDENCE_DIR=/path/to/private/dir pnpm e2e:quality
```

The evidence directory is never committed: screenshots and the
`pilot-quality-metrics.jsonl` metrics/finding stream stay private.

## Media isolation

Captured cover/logo URLs use the reserved `https://media.fixture.test/...`
origin. Playwright routes intercept every request to that origin inside the
browser and fulfill it with a 1x1 PNG (404 for `/broken/*`), so no network
fetch ever happens and present/broken media are deterministic.

## Notes

- Assertions that must hold today fail the run ("ACTUAL CHECKS").
- Observations of current v1 behavior that the quality report ranks are
  written to the metrics stream as `finding` records ("FINDINGS") — several
  are capture-v1 limitations, not bugs.
- `reuseExistingServer: false`: an occupied port 4393 fails fast instead of
  silently testing someone else's server.
