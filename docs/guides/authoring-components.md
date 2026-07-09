# Authoring Frontbase Components

A Frontbase component is a `.tsx` file that exports a Zod **`Schema`** and a render
function. At build time `@frontbase/compiler` extracts the `Schema` into a manifest
(builder property panels + agent diagnostics) and TypeScript types. At runtime the
engine renders the component to an HTML string — on the edge, in the browser service
worker, and in the builder canvas, all from the same code.

> **No React on published pages.** Components render to strings (eSSR). The render
> function body is not on the published-page hot path; only the `Schema` is extracted.

## The convention

```tsx
import { z } from 'zod';

export const Schema = z.object({
    title: z.string().describe('Hero title'),
    subtitle: z.string().optional().describe('Supporting subtitle'),
    ctaText: z.string().default('Get Started').describe('Button label'),
    theme: z.enum(['emerald', 'indigo', 'slate']).default('emerald').describe('Accent'),
    count: z.number().default(0).describe('Initial counter'),
    items: z.array(z.string()).default([]).describe('Bulleted items'),
});

type HeroProps = z.infer<typeof Schema>;
export function Hero({ title, subtitle }: HeroProps) {
    return `<section><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</section>`;
}
```

## Supported Zod constructs

| Kind | Example |
|---|---|
| string | `z.string()` |
| number | `z.number()` |
| boolean | `z.boolean()` |
| enum | `z.enum(['a', 'b'])` |
| array | `z.array(z.string())`, `z.array(z.object({...}))` |
| object (nested, any depth) | `z.object({ a: z.string(), b: z.object({ c: z.number() }) })` |

**Modifiers:** `.optional()`, `.default(...)`, `.describe('...')`, `.nullable()`, `.min(n)`, `.max(n)`
**Format hints** (recorded as `string` + a `format` field): `.email()`, `.url()`, `.uuid()`

## Rules (enforced by `frontbase check` / `lint`)

1. **Every property needs `.describe()`** — lint rule **FB003**. Apply it to **every object
   key, recursively** (nested objects and array-of-object fields too). The description drives
   the builder property panel label and agent diagnostics. Place `.describe()` last in the chain.
2. **No `window`/`document`** — lint rule **FB001**. Components render server-side (no
   hydration). Client interactivity goes in the behaviors runtime via `data-fb-*` attributes.
3. **Navigation is `<a href>`** — lint rule **FB002**. The service worker intercepts real
   anchors. Avoid `data-navigate-to` except for button-styled links.
4. **zod is pinned at 3.25** — `.describe()` is a chainable method (v4 changed it).

## Props type idiom

Derive the render-function props from the schema with `z.infer`:

```tsx
type HeroProps = z.infer<typeof Schema>;
export function Hero(props: HeroProps) { ... }
```

The compiler does not validate the render signature, but the extracted `Schema` is the source
of truth — `z.infer<typeof Schema>` stays in sync with the manifest.

## Unsupported constructs → `UNSUPPORTED_ZOD`

The compiler does **not** support: `z.union`, `z.discriminatedUnion`, `z.literal`,
`z.record`, `z.tuple`, `z.lazy`, `z.any`, `z.unknown`. Use `z.enum` for fixed value sets
and `z.object` for structured data. Unsupported constructs surface as a structured
diagnostic with a suggestion rather than crashing extraction.

## Round-trip safety

The extractor rebuilds a Zod schema from the manifest and verifies it accepts/rejects
exactly what your original schema does. If you see a round-trip mismatch, it's an
extractor bug — report it.

## Data bindings (Decision A-16)

Components declare data via registered queries, authored code-first:

```ts
import { z } from 'zod';
import { defineQueries } from '@frontbase/compiler';

export const queries = defineQueries({
    'products.list': {
        params: z.object({ limit: z.number().optional() }),
        scope: 'public',
        ttlSeconds: 60,
        execute: async (params) => fetchProducts(params),  // server-side only
    },
});
```

The browser/SW projection strips `execute` — the SW only ever sees `{queryId, params}`.
The Edge Data Proxy (`/api/data/:queryId`) validates params with Zod before execution.
