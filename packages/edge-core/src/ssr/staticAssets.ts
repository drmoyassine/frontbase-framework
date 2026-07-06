/**
 * Embedded Client Assets
 * 
 * At build time (tsup), the esbuild plugin in tsup.shared.ts replaces
 * the placeholder strings below with the actual file contents from
 * public/react/. This allows cloud edge engines (CF, Vercel, Netlify,
 * Deno, Supabase) to serve hydrate.js without a filesystem.
 * 
 * In dev mode (tsx watch), these remain as empty strings — Docker
 * serves static files from the public/ directory via serveStatic().
 */

// Replaced at build time by embedClientAssetsPlugin
export const HYDRATE_JS = '%%HYDRATE_JS%%';
export const HYDRATE_CSS = '%%HYDRATE_CSS%%';
export const FAVICON_PNG_B64 = '%%FAVICON_PNG_B64%%';
