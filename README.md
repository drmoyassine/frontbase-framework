# Frontbase Framework

The **Chimera (Universal eSSR)** framework — one Hono engine that renders every page in three environments (cloud edge, browser service worker, builder canvas), a compiler that turns Zod schemas into manifests/types/registered queries, and a complete CMS that deploys as **one edge worker**.

> **Status**: Phase 1 (engine & compiler extraction) — pre-release, private.
> Phase 0 validation is complete: **PROCEED** ([docs/PHASE0-DECISION-MEMO.md](docs/PHASE0-DECISION-MEMO.md)).

## Packages

| Package | Role |
|---|---|
| [`@frontbase/edge-core`](packages/edge-core) | The Chimera Engine — unified router, eSSR renderer, DataProvider DI, workflows, behaviors runtime, SW primitives |
| [`@frontbase/compiler`](packages/compiler) | Zod schema extraction → manifests/types, query registrar, SW bundle emitter, CLI (`init`/`check`/`lint`/`simulate`/`deploy`) |
| [`@frontbase/ui-components`](packages/ui-components) | The single set of isomorphic page components (no React on published pages) |
| [`@frontbase/edge-infra`](packages/edge-infra) | Direct data providers, Edge Data Proxy, cache/queue/vault/auth/sync/storage adapters |

The `builder` and `backend` packages (Phase 2) live elsewhere for now — placement and licensing are an open decision (PRD-1).

## Architecture

Canonical spec: [docs/CHIMERA-ARCHITECTURE.md](docs/CHIMERA-ARCHITECTURE.md). Roadmap: [docs/MILESTONES.md](docs/MILESTONES.md). Decision log: [docs/DECISIONS.md](docs/DECISIONS.md) (this repo exists per **A-15**).

Three non-negotiable principles:

1. **Single-edge deployment** — the whole CMS ships as one worker. Zero infrastructure.
2. **Universal eSSR** — one engine, three hosts, byte-identical output. No React on published pages; no hydration drift.
3. **Six npm packages** — fixed surface (A-14).

## Development

```bash
pnpm install
pnpm build     # builds all packages
pnpm check     # typechecks all packages
```

Extraction source: the production renderer in the private Frontbase product repo. Parity is enforced by the [golden corpus](golden-corpus/README.md) — byte-identical HTML against snapshots of the production renderer, including the real Frontbase homepage validated in Phase 0 (spike evidence: `docs/spike/README.md`, `docs/spike-cf/README.md`; spike *code* remains in the product repo).

## License

[Apache-2.0](LICENSE) for all packages in this repository.
