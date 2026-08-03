/**
 * Provider credential registry — maps provider/datasource-kind → resolver +
 * enricher. Provider agents edit ONLY their own `./<provider>.ts`; this index is
 * the single wiring point.
 *
 * Keys are matched against (a) EdgeProviderAccount.provider for connect-time
 * enrichment and (b) datasource `kind` for runtime resolution. Both surfaces use
 * the same keys (supabase, neon, turso, cloudflare, google_sheets, wordpress_*).
 */
import type { DatasourceResolver, ProviderEnricher } from './types.js';
import { resolveSupabase, enrichSupabase } from './supabase.js';
import { resolveNeon, enrichNeon } from './neon.js';
import { resolveTurso, enrichTurso } from './turso.js';
import { resolveCloudflare, enrichCloudflare } from './cloudflare.js';
import { resolveGoogleSheets, enrichGoogleSheets } from './google_sheets.js';
import { resolveWordPress, enrichWordPress } from './wordpress.js';
import { passthroughResolver, passthroughEnricher } from './types.js';

/** kind/provider → resolver. Unknown kinds pass through (sqlite, postgres inline, etc.). */
export const RESOLVERS: Record<string, DatasourceResolver> = {
    supabase: resolveSupabase,
    neon: resolveNeon,
    turso: resolveTurso,
    d1: resolveCloudflare,
    cloudflare: resolveCloudflare,
    google_sheets: resolveGoogleSheets,
    wordpress_rest: resolveWordPress,
    wordpress_graphql: resolveWordPress,
    wordpress_plugin: resolveWordPress,
    wordpress: resolveWordPress,
};

/** provider → enricher. Unknown providers pass through. */
export const ENRICHERS: Record<string, ProviderEnricher> = {
    supabase: enrichSupabase,
    neon: enrichNeon,
    turso: enrichTurso,
    cloudflare: enrichCloudflare,
    google_sheets: enrichGoogleSheets,
    wordpress_rest: enrichWordPress,
    wordpress_graphql: enrichWordPress,
    wordpress_plugin: enrichWordPress,
};

export { passthroughResolver, passthroughEnricher };
export type { DatasourceResolver, ProviderEnricher };
