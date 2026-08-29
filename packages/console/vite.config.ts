import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { build as esbuildBuild } from "esbuild";
import { componentTagger } from "lovable-tagger";

// Cache busting timestamp - update this to force browser cache invalidation
const BUILD_TIMESTAMP = new Date().getTime();

// ---------------------------------------------------------------------------
// Builder-scoped Service Worker build pass.
//
// The builder SW (src/sw/builder-sw.ts) imports renderPage/renderDocument from
// @frontbase/edge-core — the SAME workspace package the framework cf-full
// worker uses — so canvas re-renders happen LOCALLY in the SW thread with zero
// drift vs what visitors see. edge-core is a real workspace dependency of this
// package, so it resolves through node_modules to the compiled dist — the
// same index.js the worker imports.
//
// Strategy: a tiny vite plugin that runs an esbuild pass. esbuild is pinned as
// a devDependency of this package because its version decides the SW bytes.
// We use esbuild rather than a second vite/rollup pass because (a) the SW is a
// single self-contained entry with one external workspace package — exactly
// esbuild's sweet spot — and (b) it must emit a fixed-name `builder-sw.js` at
// the dist root (NOT under the hashed assets/ folder, so the registration
// module can address it by a stable URL), which vite's main rollup pass cannot
// do without fighting the assetFileNames template above.
//
// Build:  closeBundle -> dist/builder-sw.js (the production asset).
// Dev:    configureServer middleware serves the same bundle at
//         `${base}builder-sw.js` so vite dev has SW parity (rebuilt lazily and
//         cached; restart vite to pick up SW-source edits).
// ---------------------------------------------------------------------------

function resolveEdgeCoreEntry(): string {
  // import.meta.resolve, NOT createRequire().resolve: edge-core's exports map
  // declares only `types` + `import` conditions, so the CJS resolver throws
  // ERR_PACKAGE_PATH_NOT_EXPORTED against the bare specifier.
  const spec = import.meta.resolve?.("@frontbase/edge-core");
  if (!spec) {
    throw new Error("[builderSwPlugin] import.meta.resolve unavailable — Node >= 20.6 required.");
  }
  const entry = fileURLToPath(spec);
  if (!fs.existsSync(entry)) {
    throw new Error(
      "[builderSwPlugin] @frontbase/edge-core dist not found at " + entry +
        "\nRun: pnpm --filter @frontbase/edge-core build",
    );
  }
  return entry;
}

function builderSwPlugin(): Plugin {
  const swSourcePath = path.resolve(__dirname, "src/sw/builder-sw.ts");
  const edgeCoreEntry = resolveEdgeCoreEntry();

  /** Bundle the SW with esbuild. Returns the JS string + byte stats. */
  async function bundleBuilderSw(outFile?: string): Promise<{ bytes: number; gzipped: number; js: string }> {
    const result = await esbuildBuild({
      entryPoints: [swSourcePath],
      bundle: true,
      // IIFE, not ESM: a classic SW needs no {type:'module'} registration and
      // works on every browser that supports SWs. esbuild inlines every import
      // (including the framework dist + liquidjs) into one self-contained file.
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      sourcemap: false,
      // The SW ships internal builder tooling; strip license comments to keep
      // the payload inside the ~200-500 KB budget.
      legalComments: "none",
      alias: {
        // Pin the SW to the SAME edge-core the cf-full worker imports. A bare
        // `@frontbase/edge-core` would otherwise fail to resolve (not in this
        // repo's node_modules / tsconfig paths).
        "@frontbase/edge-core": edgeCoreEntry,
      },
      write: !!outFile,
      ...(outFile ? { outfile: outFile } : {}),
    });

    if (result.errors.length > 0) {
      throw new Error(
        `[builderSwPlugin] SW bundle failed:\n` +
          result.errors.map((e) => e.text).join("\n"),
      );
    }
    if (result.warnings.length > 0) {
      console.warn("[builderSwPlugin] esbuild warnings:\n" + result.warnings.map((w) => w.text).join("\n"));
    }

    const js = outFile ? fs.readFileSync(outFile, "utf8") : result.outputFiles![0].text;
    const bytes = outFile ? fs.statSync(outFile).size : Buffer.byteLength(js);
    const gzipped = zlib.gzipSync(js).length;
    return { bytes, gzipped, js };
  }

  return {
    name: "frontbase-builder-sw",
    // Build: emit dist/builder-sw.js after the main rollup pass finishes, so the
    // SPA bundle and the SW land in dist together from a single `vite build`.
    apply: "build",
    async closeBundle() {
      const outFile = path.resolve(__dirname, "dist/builder-sw.js");
      await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
      const { bytes, gzipped } = await bundleBuilderSw(outFile);
      const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
      console.log(
        `[builder-sw] emitted dist/builder-sw.js — ${kb(bytes)} raw, ${kb(gzipped)} gzipped`,
      );
    },
  };
}

/**
 * Dev-only middleware that serves the freshly bundled SW so `vite dev` has SW
 * parity with production. Registered separately so it never runs during
 * `vite build` (where closeBundle owns emission).
 */
function builderSwDevMiddleware(): Plugin {
  let cached: { js: string; mtime: number } | null = null;
  const swSourcePath = path.resolve(__dirname, "src/sw/builder-sw.ts");
  return {
    name: "frontbase-builder-sw-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        // Base-agnostic match: serve at <base>builder-sw.js in every mode.
        if (!url.split("?")[0].endsWith("/builder-sw.js")) return next();
        try {
          const mtime = fs.statSync(swSourcePath).mtimeMs;
          if (!cached || cached.mtime !== mtime) {
            const { js } = await (async () => {
              // Reuse the bundler without writing to disk.
              const result = await esbuildBuild({
                entryPoints: [swSourcePath],
                bundle: true,
                format: "iife",
                platform: "browser",
                target: "es2020",
                minify: true,
                sourcemap: false,
                legalComments: "none",
                alias: { "@frontbase/edge-core": resolveEdgeCoreEntry() },
                write: false,
              });
              return { js: result.outputFiles![0].text };
            })();
            cached = { js, mtime };
          }
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(cached.js);
        } catch (err) {
          console.error("[builder-sw] dev bundle failed:", err);
          res.statusCode = 500;
          res.end("// builder-sw bundle failed — see server log");
        }
      });
    },
  };
}



// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Edition-aware base path: cloud → /admin/, self-host → /frontbase-admin/.
  // The `cloud` vite MODE (build:cloud → `vite build --mode cloud`, A-25
  // Phase 4) implies the cloud edition — `--mode` alone only picks which .env
  // files load, so without this the cloud build silently kept the self-host
  // base. An explicit VITE_DEPLOYMENT_MODE in an env file still wins.
  const deploymentMode = env.VITE_DEPLOYMENT_MODE || (mode === 'cloud' ? 'cloud' : 'self-host');
  const basePath = deploymentMode === 'cloud' ? '/admin/' : '/frontbase-admin/';

  return {
    base: basePath,
    build: {
      // Add cache busting to asset filenames
      sourcemap: false,
      rollupOptions: {
        output: {
          // Use content-based hash + timestamp for aggressive cache busting
          assetFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}[extname]`,
          chunkFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}.js`,
          entryFileNames: `assets/[name]-[hash]-${BUILD_TIMESTAMP}.js`,
        },
      },
    },
    server: {
      host: "::",
      port: 5173,
      proxy: {
        // Framework worker (examples/cf-full under wrangler dev) — serves /api,
        // /static (published assets) and /builder (eSSR reRender + registry
        // descriptor). Same-origin via proxy so the fb_session cookie carries
        // through builderAuthGate. In prod the console is served FROM the
        // worker, so these are already same-origin; this is dev-only.
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
        '/static': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
        '/builder': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      react(),
      // Builder-scoped SW: the build plugin emits dist/builder-sw.js; the dev
      // middleware serves the same bundle during `vite dev`.
      builderSwPlugin(),
      builderSwDevMiddleware(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        // Source-aliased local packages — deliberately NOT workspace packages
        // (see README.md). No "@frontbase/builder" entry either: the framework
        // workspace ships a real @frontbase/builder package and this console
        // never imports one; an alias here would shadow the framework's.
        "@": path.resolve(__dirname, "./src"),
        "@frontbase/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
        "@frontbase/datatable": path.resolve(__dirname, "./packages/datatable/src/index.ts"),
        "@frontbase/infolist": path.resolve(__dirname, "./packages/infolist/src/index.ts"),
        "@frontbase/form": path.resolve(__dirname, "./packages/form/src/index.ts"),
        "@frontbase/chart": path.resolve(__dirname, "./packages/chart/src/index.ts"),
        "@frontbase/kpicard": path.resolve(__dirname, "./packages/kpicard/src/index.ts"),
        "@frontbase/grid": path.resolve(__dirname, "./packages/grid/src/index.ts"),
        "@frontbase/liquid-core": path.resolve(__dirname, "./packages/liquid-core/src/index.ts"),
      },
    },
    // Expose server-side env vars to client
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_PROJECT_URL || env.SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
      'import.meta.env.VITE_DEPLOYMENT_MODE': JSON.stringify(deploymentMode),
      'import.meta.env.VITE_AUTH_PROVIDER': JSON.stringify(env.AUTH_PROVIDER),
    },
  };
});
