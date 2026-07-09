/**
 * init scaffolder — emits a working Frontbase project. Variants:
 *   --pure       : edge-core + compiler (dev) + example component + page + worker + vite config.
 *                  Output builds (`pnpm build`) and runs a smoke test.
 *   --with-infra : --pure + edge-infra wiring placeholders (Phase 2).
 *   --full       : --with-infra + builder/backend wiring placeholders (Phase 2).
 *
 * Templates are inlined strings (no FS template dir) so the compiler package is
 * self-contained. The scaffolded worker mirrors examples/cf-worker.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type InitVariant = 'pure' | 'with-infra' | 'full';

export interface InitResult {
    path: string;
    variant: InitVariant;
    files: string[];
    notes: string[];
}

export function scaffoldProject(targetDir: string, variant: InitVariant): InitResult {
    if (existsSync(targetDir)) throw new Error(`Target already exists: ${targetDir}`);
    const files: string[] = [];
    const notes: string[] = [];
    const write = (rel: string, content: string) => {
        const full = join(targetDir, rel);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, content);
        files.push(rel);
    };

    write('package.json', packageJson(variant));
    write('tsconfig.json', TSCONFIG);
    write('vite.config.ts', VITE_CONFIG);
    write('wrangler.toml', WRANGLER);
    write('src/components/Hello.tsx', HELLO_COMPONENT);
    write('src/queries.ts', QUERIES);
    write('src/manifest.ts', MANIFEST);
    write('src/sw.ts', SW_ENTRY);
    write('src/worker.ts', WORKER_ENTRY);
    write('src/smoke.ts', SMOKE);
    write('README.md', README(variant));

    if (variant !== 'pure') {
        write('src/infra.ts', INFRA_PLACEHOLDER);
        notes.push('edge-infra wiring is a placeholder — real providers land in Phase 2 (M2.1).');
    }
    if (variant === 'full') {
        write('src/console.ts', CONSOLE_PLACEHOLDER);
        notes.push('Console API (backend) wiring is a placeholder — lands in Phase 2 (M2.2).');
    }

    return { path: targetDir, variant, files, notes };
}

function packageJson(variant: InitVariant): string {
    const deps = ['"@frontbase/edge-core": "workspace:*"'];
    if (variant !== 'pure') deps.push('"@frontbase/edge-infra": "workspace:*"');
    return `{
  "name": "my-frontbase-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node dist/smoke.js",
    "check": "frontbase check --json"
  },
  "dependencies": { ${deps.map((d) => d).join(', ')} },
  "devDependencies": {
    "@frontbase/compiler": "workspace:*",
    "typescript": "^5.6.0"
  }
}
`;
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"], "strict": true, "noUncheckedIndexedAccess": true,
    "isolatedModules": true, "verbatimModuleSyntax": true, "skipLibCheck": true,
    "declaration": true, "rootDir": "src", "outDir": "dist"
  },
  "include": ["src"]
}
`;

const VITE_CONFIG = `import { defineConfig } from 'vite';
import { frontbasePlugin } from '@frontbase/compiler/vite';
export default defineConfig({ plugins: [frontbasePlugin()] });
`;

const WRANGLER = `name = "my-frontbase-app"
main = "dist/worker.js"
compatibility_date = "2026-01-01"
no_bundle = true
`;

const HELLO_COMPONENT = `import { z } from 'zod';

export const Schema = z.object({
    title: z.string().default('Hello, Edge').describe('Heading text'),
    subtitle: z.string().optional().describe('Supporting line'),
});

export function Hello({ title, subtitle }: { title: string; subtitle?: string }) {
    return \`<section><h1>\${title}</h1>\${subtitle ? \`<p>\${subtitle}</p>\` : ''}</section>\`;
}
`;

const QUERIES = `import { z } from 'zod';
import { defineQueries } from '@frontbase/compiler';

export const queries = defineQueries({
    'sample.list': {
        params: z.object({ limit: z.number().optional() }),
        scope: 'public',
        ttlSeconds: 60,
        execute: async () => [{ id: 1, name: 'Sample row' }],
    },
});
`;

const MANIFEST = `import { buildSiteManifest } from '@frontbase/compiler';
import { queries } from './queries.js';

export const manifest = buildSiteManifest({
    pages: {
        '/': {
            title: 'My Frontbase App', slug: 'home',
            layout: { root: {}, content: [
                { id: 'h', type: 'Heading', props: { content: 'Hello, Edge', level: 'h1' } },
                { id: 'l', type: 'Link', props: { text: 'Sample data →', href: '/sample', color: '#4338ca', underline: true } },
            ] },
        },
        '/sample': {
            title: 'Sample', slug: 'sample', queryId: 'sample.list',
            layout: { root: {}, content: [
                { id: 's', type: 'Text', props: { content: '{% for r in records %}{{ r.name }};{% endfor %}' } },
            ] },
        },
    },
    queries,
});
`;

const SW_ENTRY = `import { createEngine, proxyProvider, attachServiceWorker } from '@frontbase/edge-core';
import { manifest } from './manifest.js';
const engine = createEngine({ manifest, data: proxyProvider('/api/data'), environment: 'service-worker' });
attachServiceWorker(self, engine, manifest);
`;

const WORKER_ENTRY = `import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { manifest } from './manifest.js';
configureEngine({ edition: 'community', nodeEnv: 'production' });
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
export default engine;
`;

const SMOKE = `import { createEngine, directProvider } from '@frontbase/edge-core';
import { manifest } from './manifest.js';
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const home = await engine.fetch(new Request('http://t.local/'));
const sample = await engine.fetch(new Request('http://t.local/sample'));
const ok = home.status === 200 && sample.status === 200 && (await sample.text()).includes('Sample row');
console.log(ok ? 'smoke: PASS' : 'smoke: FAIL');
process.exit(ok ? 0 : 1);
`;

const INFRA_PLACEHOLDER = `// Phase 2 (M2.1): wire @frontbase/edge-infra providers here.
// import { d1Provider } from '@frontbase/edge-infra';
// export const data = d1Provider(env.DB);
export {};
`;

const CONSOLE_PLACEHOLDER = `// Phase 2 (M2.2): mount the @frontbase/backend console API here.
// import { createConsole } from '@frontbase/backend';
export {};
`;

function README(variant: InitVariant): string {
    return `# my-frontbase-app

Scaffolded by \`frontbase init --${variant}\`.

\`\`\`bash
pnpm install
pnpm build        # compile
pnpm test         # in-process smoke (renders home + /sample)
pnpm check        # schema + diagnostics (--json for agents)
\`\`\`

Deploy as a Cloudflare Worker: \`npx wrangler deploy\` (after \`pnpm build\`).
`;
}
