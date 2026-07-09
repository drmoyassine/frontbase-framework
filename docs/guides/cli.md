# Frontbase CLI

`npx @frontbase/compiler <command>` — every command supports `--json` for agent
consumption (the output shape is the `AgentOutput` from the technical spec:
`{version, type, success, summary, issues[], recommendations[]}`; issues carry
`file/line/code/severity/fixable/fix`).

## `init <name>`

Scaffold a new project.

```bash
npx @frontbase/compiler init my-app --pure        # engine + compiler (default)
npx @frontbase/compiler init my-app --with-infra  # + edge-infra wiring placeholders
npx @frontbase/compiler init my-app --full        # + builder/console placeholders
```

Produces a buildable project: `cd my-app && pnpm install && pnpm build && pnpm test`.

## `check [path]`

Validate component schemas and TypeScript.

```bash
npx @frontbase/compiler check            # human output
npx @frontbase/compiler check --json     # agent JSON
npx @frontbase/compiler check --typecheck  # also run tsc --noEmit
```

Reports `MISSING_SCHEMA`, `UNSUPPORTED_ZOD`, `TS####` diagnostics with precise
`file:line`. Exits non-zero on errors.

Diagnostic codes:
- `MISSING_SCHEMA` — component file has no `export const Schema = z.object({...})`. **Fixable.**
- `UNSUPPORTED_ZOD` — a Zod construct the compiler can't extract (union/record/etc.).
- `TS####` — TypeScript compile errors (with `--typecheck`).

## `lint [path]`

Custom Frontbase rules (AST-driven).

```bash
npx @frontbase/compiler lint
npx @frontbase/compiler lint --rules FB001,FB003
```

| Rule | Severity | What it catches |
|---|---|---|
| `FB001` no-browser-globals | error | `window`/`document` in engine components |
| `FB002` anchor-navigation | warning | JS-driven nav (`data-navigate-to`) without an `<a href>` |
| `FB003` describe-every-prop | warning | a `Schema` property missing `.describe()` |

## `simulate <manifestPath>`

Render a page locally in a given provider mode (M1.4).

```bash
npx @frontbase/compiler simulate src/manifest.ts --path /products --provider proxy
npx @frontbase/compiler simulate src/manifest.ts --serve --port 3000
```

Provider modes: `direct` (edge), `proxy` (SW's HTTP data path), `draft` (in-memory).
The same page renders byte-identically across all three.

## `emit-sw <entry>`

Emit a content-hash-versioned `sw.js` from a SW entry module.

```bash
npx @frontbase/compiler emit-sw src/sw.ts --out dist --json
```

Emits `dist/sw.<hash>.js`; the hash changes iff the bundle content changes.
Budget: < 150 KB min+gzip.
