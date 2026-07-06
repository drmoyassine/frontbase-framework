/**
 * Auth seam — replaces the product repo's `./auth.js` (tenant-aware provider
 * factory + @supabase/ssr). Auth IMPLEMENTATIONS live in @frontbase/edge-infra;
 * the engine only knows "give me the user for this request", injected via
 * `configureEngine({ resolveUser })`. Default: anonymous.
 */
import type { UserContext } from './IAuthProvider.js';
import { engineConfig } from '../../config.js';

export async function getUserFromSession(request: Request, tenantSlug?: string): Promise<UserContext | null> {
    return engineConfig().resolveUser(request, tenantSlug);
}
