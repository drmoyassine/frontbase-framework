# Frontbase Component Authoring Convention

A Frontbase component is a `.tsx` file that exports a Zod `Schema` and a render
function. The compiler extracts `Schema` → a manifest (builder property panels
+ agent diagnostics) → TypeScript types.

## Required shape

```tsx
import { z } from 'zod';

export const Schema = z.object({
    title: z.string().describe('Hero title'),              // every prop needs .describe()
    subtitle: z.string().optional().describe('Subtitle'),
    count: z.number().default(0).describe('Initial count'),
    theme: z.enum(['light', 'dark']).default('light').describe('Theme'),
    tags: z.array(z.string()).default([]).describe('Tags'),
});
```

## Supported Zod constructs
- kinds: z.string, z.number, z.boolean, z.enum([...]), z.array(...), z.object({...})
- modifiers: .optional(), .default(...), .describe('...'), .nullable(), .min(n), .max(n)
- format hints: z.string().email() / .url() / .uuid()
- nesting: objects in objects, arrays of objects (any depth)

## NOT supported (the compiler emits UNSUPPORTED_ZOD)
- z.union, z.discriminatedUnion, z.literal, z.record, z.tuple, z.lazy, z.any, z.unknown
- Use z.enum for fixed value sets.

## Rules
- zod is pinned at 3.25 (.describe() is a chainable method here).
- Every property MUST have .describe() (lint rule FB003).
- Do not use `window`/`document` (engine components render server-side; lint FB001).
- The render function can return null — only the Schema is extracted.

Author one component per file: <Name>.tsx, exporting `Schema` and a function `<Name>`.
