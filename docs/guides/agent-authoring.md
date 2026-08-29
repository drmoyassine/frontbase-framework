# Agent Authoring Guide & Prompt Templates

For coding agents (Claude, Cursor, Gemini) authoring Frontbase components, pages,
queries, and workflows. These templates encode the conventions and the **golden
rules** — follow them and `frontbase check` passes first try.

## The contract (read first)

Every Frontbase component is a `.tsx` exporting a Zod **`Schema`**. The compiler
extracts it → manifest (builder panels + agent diagnostics) → TypeScript types.
**zod is pinned at 3.25** (`.describe()` is a chainable method; `.email()`/`.url()`
are modifiers, not `z.email`).

**Supported Zod:** `z.string/number/boolean/enum/array/object` + `.optional/.default/
.describe/.nullable/.min/.max` and format modifiers `.email()/.url()/.uuid()`.
**Unsupported (emits UNSUPPORTED_ZOD):** `z.union/.discriminatedUnion/.literal/
.record/.tuple/.lazy/.any/.unknown` — use `z.enum` for literal sets, `z.object`
for structured data.

**Rules:** every property needs `.describe()` (FB003); no `window`/`document`
(FB001 — render server-side); navigation is `<a href>` (FB002).

## Template 1 — Author a component

```
You are authoring a Frontbase component. Produce ONE .tsx file:

import { z } from 'zod';

export const Schema = z.object({
    <prop>: z.<kind>(...).<modifiers>.describe('<one-line purpose>'),
    ...                                   // every property gets .describe()
});

type Props = z.infer<typeof Schema>;
export function <Name>(props: Props) { return null; }   // render impl optional for extraction

Rules: zod 3.25 only. Every property has .describe(). No z.union/z.record (use
z.enum/z.object). No window/document. Return only the file.
```

## Template 2 — Add a page

```
Add a page at <path> to the site manifest (buildSiteManifest). It has:
  - title, slug, optional queryId (a registered query whose rows inject as `records`)
  - a layout: builder tree of { id, type, props } where Text props may use Liquid
    over `records` (e.g. "{% for r in records %}{{ r.name }}{% endfor %}").
Navigation between pages is <a href> (Link component), never data-navigate-to.
```

## Template 3 — Define a query

```
Define a registered data query (code-first). The browser sees {queryId, hasParams,
scope, ttl} only; execute runs server-side with edge secrets.

import { defineQueries } from '@frontbase/compiler';
import { z } from 'zod';

export const queries = defineQueries({
    '<namespace>.<name>': {
        params: z.object({ ... }),          // optional; the proxy validates
        scope: 'public' | 'tenant' | 'user', // tenant/user require a resolved principal
        ttlSeconds: 60,
        execute: async (params, ctx) => {
            // ALWAYS filter by ctx.tenant for tenant-scoped data.
            return ctx.db.query('SELECT ... WHERE tenant = ?', [ctx.tenant]);
        },
    },
});
```

## Template 4 — Build a workflow

```
Author a workflow as a node/edge graph (React-Flow shape) the engine's
executeWorkflow consumes. Node types: trigger, http_request, transform, condition,
log, set_variable, http_response, delay (edge-core); ai.chat, mcp.call, email,
queue_trigger (edge-infra). Each node's `inputs` carry its config; condition nodes
use the expr engine (safeEval: `data.field === 'x'`, `n > 10`, `a || b`).
```

## Self-check before finishing

Run `frontbase check --json` on your work. Apply every `edit` in the output
(machine-applicable quick-fixes). Re-run until `success: true`. If `--parity` is
available on the manifest, run it — the page must render byte-identically across
providers.
