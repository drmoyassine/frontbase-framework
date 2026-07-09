# Console API & Single-Worker Deploy

## Console API (`@frontbase/backend`)

Mounted at `/api/console` via `createEngine({ console })`. **Default-DENY**: every
route except `/health` requires an authenticated principal (RULE 2). Drizzle is
the single persistence source of truth (A-13); every tenant table has a
`tenant` column and composite PK; all CRUD is tenant-scoped. Errors are opaque
(RULE 4).

```ts
import { createConsole } from '@frontbase/backend';
import { createResolvePrincipal } from '@frontbase/edge-infra';
const console = createConsole({
    resolvePrincipal: createResolvePrincipal({ jwtSecret: process.env.JWT_SECRET }),
    dbUrl: process.env.DB_URL,
    queries,
});
const engine = createEngine({ manifest, data, environment: 'edge', console });
```

Routes: `GET /pages`, `GET/PUT /drafts/:slug`, `POST /publish/:slug`, `DELETE /pages/:slug`,
`GET /health`. **Publish** validates the draft → assembles the `SiteManifest`
(reusing `@frontbase/compiler`) → emits the **execute-stripped browser
projection** (RULE 1) → bumps the content-hash version → purges the cache.

## Builder (`@frontbase/builder`)

React SPA (peer `react`). NEVER imports `@frontbase/edge-infra` — it talks to the
console over HTTP and renders drafts through the same `@frontbase/edge-core`
engine (preview HTML == published HTML). `localDraftProvider` is a `DataProvider`;
property panels are generated from a compiler `ComponentManifest`.

## Deploy (`frontbase deploy`)

Composes engine + console + proxy + builder SW into one CF Worker.

```bash
npx @frontbase/compiler deploy --dry-run   # compose + routing smoke + size budget
npx @frontbase/compiler deploy             # wrangler deploy (primary)
npx @frontbase/compiler deploy --target deno
```

**The composition boundary (RULE 1):** the served `/sw.js` is the
execute-stripped browser projection — it contains no server secret and no
edge-infra driver. The worker's server code lives only in the fetch handler.
Worker budget: < 400 KB min+gzip (measured ~55 KB).
