# Frontbase Documentation

Documentation for the Frontbase framework — a modular, edge-native platform
built on the **universal SSR** architecture: one Hono engine rendering
isomorphic JSX in three environments (cloud edge, browser service worker,
builder canvas), the whole CMS deployed as a single worker.

---

## Guiding Principles

1. **Single-worker deployment** — the complete CMS (admin console, admin API,
   rendering engine, data proxy, workflows) deploys as **one worker**. Zero
   standing infrastructure.
2. **Universal SSR** — **one Hono engine** renders every page in three
   environments: cloud edge (SEO/first load), browser service worker
   (zero-latency navigation, private pages, offline), and builder canvas
   (exact WYSIWYG preview). One set of isomorphic components; no React on
   published pages.
3. **Strict package boundaries** — server-only packages never enter a browser
   bundle; browser-only packages never import server code (enforced by no-leak
   gates with mutation proofs).

---

## Start Here

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) ⭐ | The canonical architecture spec — one engine, three environments, the Edge Data Proxy, deployment layout, size budgets. All other documents defer to it. |
| [PACKAGE-STRUCTURE.md](./PACKAGE-STRUCTURE.md) | The 9 workspace packages, their roles, and dependency rules |
| [STACK.md](./STACK.md) | Technology choices in detail (Hono, JSX, React shells, Drizzle, pnpm, deployment targets) |

## Guides

| Document | What it covers |
|---|---|
| [guides/console-and-deploy.md](./guides/console-and-deploy.md) | Deploying the full CMS — flags, secrets, setup wizard, Vercel/Deno paths |
| [guides/self-host-docker.md](./guides/self-host-docker.md) | The single-container Docker path (and bare-metal Node) |
| [guides/cli.md](./guides/cli.md) | The `@frontbase/compiler` CLI (`init`/`check`/`lint`/`simulate`/`deploy`) |
| [guides/authoring-components.md](./guides/authoring-components.md) | Writing page components (isomorphic JSX + Zod schemas) |
| [guides/agent-authoring.md](./guides/agent-authoring.md) | Agent-oriented authoring workflows |
| [guides/infra-providers.md](./guides/infra-providers.md) | Database runners and the tenant-isolation contract |
| [guides/supabase-setup.md](./guides/supabase-setup.md) | Supabase Postgres datasource setup |

## Runtime & Platform

| Document | What it covers |
|---|---|
| [system-services.md](./system-services.md) | Cache · queue · vector · embedding runtime — env reference, RAG, security posture |
| [cloud-free-tier.md](./cloud-free-tier.md) | The managed-cloud mode: opt-in, host model, plans & limits |
| [testing-plan.md](./testing-plan.md) | Automated / credential-gated / manual test tiers |
| [known-limitation-postgres-mysql.md](./known-limitation-postgres-mysql.md) | The documented Postgres/MySQL app-database limitation |
| [../golden-corpus/README.md](../golden-corpus/README.md) | The byte-identical rendering regression corpus |

---

## Project History

The decision log, milestones, delivery reports, sprint plans, audits, and
Phase-0 spike evidence live in [history/](./history/README.md). They are
retained as the project's audit trail; the documents above are the current
reference.

---

*Created: 2026-06-29 · Rewritten as the current docs index: 2026-08-29*
