/**
 * CF-22 P3 — the product community console SPA shell. In production (CF Workers
 * Static Assets), this file is unused — the `[assets]` binding serves the real
 * HTML/JS/CSS from console-dist/. In the local smoke (in-memory), this provides
 * a minimal shell so /frontbase-admin resolves.
 *
 * The REAL index.html lives in console-dist/index.html (built by the product's
 * `vite build --mode community`). It references /frontbase-admin/assets/*.js and
 * *.css with the product's BrowserRouter basename="/frontbase-admin".
 *
 * This file is the INLINE fallback for the smoke build only — it imports the
 * product's index.html at build time via the build.mjs console-shell plugin.
 * If console-dist/ doesn't exist, a minimal placeholder is used.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try to read the real index.html from console-dist/.
const indexPath = join(__dirname, '..', 'console-dist', 'frontbase-admin', 'index.html');
const CONSOLE_INDEX: string = readFileSync(indexPath, 'utf-8');

export default CONSOLE_INDEX;
