# Education template install proof (workstream B prototype)

**October 8 primary follow-up:** stricter export/preflight, read-only recovery planning and conservative upgrade proposals are integrated locally. See [production contract](../../docs/plans/wordpress-pilot-installer-recovery-contract.md) and [delivery evidence](../../docs/plans/wordpress-pilot-installer-recovery-delivery.md). No production installer, durable journal or conditional upgrade executor is delivered. T3 controls exist separately; this example verifies install remains draft/inactive. Historical publication-control-pending claims below are superseded.

A **design prototype**, not an installable template. This example proves what
the existing Frontbase framework already supports when installing the
education-directory template into unrelated self-hosted destinations — using
only synthetic fixtures, isolated SQLite state and the real framework seams
(`@frontbase/edge-core` schemas, `@frontbase/compiler` registered queries,
`@frontbase/backend` compat routes). No framework source is edited, no
production import route is introduced, and nothing here is copied from any
real deployment: every institution, program, city, path, URL and contact in
`fixtures/` is invented, and `PRIVATE_*` strings are canaries that must never
appear in exports or preview projections.

## What it proves

1. **One artifact, two destinations, zero source edits.** The same exported
   artifact installs into a synthetic USA destination (`usa_institutions`,
   scope `840`, locale `en`, `/explore/`) and a synthetic Hungary destination
   (`hu_intezmenyek`/`hu_programok`, scope field `orszag`, value `348`, locale
   `hu`, `/kepzesek/`) purely through destination binding manifests.
2. **Fresh install through existing mechanisms.** Shared settings are saved
   through the real `PUT /api/project/site-configuration/` route (revision
   CAS), pages are created through the real `POST /api/pages/` route, and the
   datasource is resolved through the existing connection store (encrypted
   config, tenant-scoped).
3. **Authoring preview works; publication stays fail-closed.** The real
   preview route resolves synthetic rows on original paths;
   `publicationAvailable` stays `false`, the publish endpoint refuses with
   `directory_runtime_pending`, and no activation endpoint exists.
4. **Refusals are explicit.** Missing capability (`sql.datasource`), slug
   collisions, an unresolvable datasource at save time (403), stale revision
   (409) and cross-tenant access (query-level `principal_context_required`,
   route-level 403/422) all fail with clear messages.
5. **Upgrade preserves owner customization (prototype merge).** Owner-edited
   template nodes, owner-added nodes and owner root metadata survive a
   template v1 → v2 upgrade; unmodified template nodes upgrade; page history
   keeps the pre-upgrade snapshot. This merge is a proposal, not an accepted
   framework mechanism — the current available recovery mechanism is page
   version history.

## Commands (clean environment)

Prerequisites: Node >= 20, pnpm 10. From the repository root:

```sh
pnpm install
pnpm -r build          # builds the workspace packages this example imports
pnpm --filter @frontbase/example-education-template-proof test   # contract + destination tests
pnpm --filter @frontbase/example-education-template-proof proof   # full phased proof narrative
```

The proof runs fully in-process (`app.request`) against per-destination
`:memory:`/temporary-file SQLite databases. It starts no server, uses no
network, and touches no shared database, bucket or the primary session's
local pilot state.

## Files

- `src/template-source.mjs` — the synthetic template source (exporter input).
- `src/layouts.mjs` — the five editable role layouts (deterministic `tpl-*`
  node ids, `directoryQuery`/`recordBindings`/`siteBindings` only).
- `src/artifact.mjs` — the proposed `exportSchema: 1` artifact: exporter,
  independent validator, capability evaluation, collision pre-check and the
  upgrade-merge prototype.
- `src/install.mjs` — prototype installer driving only real routes.
- `src/proof.mjs` — the phased proof.
- `test/artifact-contract.test.mjs` — exclusion/no-secret/capability/collision
  and merge-preservation semantics.
- `test/destination-proof.test.mjs` — two isolated destinations from one
  artifact, isolation, refusals, fail-closed publication.
- `fixtures/usa.json`, `fixtures/hungary.json` — synthetic datasets and
  destination binding manifests.

Design proposal, evidence and the honest list of unproven lifecycle steps
live in `docs/plans/wordpress-pilot-template-install-proof.md`. The export
contract must be accepted by the primary session before any production import
route, schema version or code relocation is implemented.
