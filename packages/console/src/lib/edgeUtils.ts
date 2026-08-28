/**
 * edgeUtils.ts
 * 
 * Centralized helpers for interacting with Edge Engine URLs and infrastructure logic.
 */

/**
 * Resolves the absolute browser-accessible URL for an Edge Engine.
 * 
 * Context: 
 * The `url` stored in the database for the Local Edge engine is typically
 * an internal Docker network address (e.g. `http://edge:3002`).
 * This is useless to the user's browser in a VPS environment.
 * 
 * - If the target is an internal hostname, and we are in production,
 *   we use `window.location.origin` (because Nginx proxies root to Edge).
 * - If the target is internal, but we are in dev (port 5173), we return the local URL.
 * - If it's an external cloud target (e.g., Vercel, CF), we resolve it natively.
 * 
 * @param isShared Whether the target engine is a shared community worker
 * @returns Fully qualified origin (e.g. `https://myfrontbase.com` or `https://worker.dev`)
 */
export function resolveEngineOrigin(engineUrl: string | undefined | null, isShared?: boolean, tenantSlug?: string, isSystem?: boolean): string {
  // The system edge IS the worker this deployment runs on (self-host community).
  // In production the console is served from it, so the browser origin is correct.
  // In Vite dev (:5173) `/builder` isn't proxied, so fall through to a configured
  // engine URL (if any) before assuming same-origin.
  if (isSystem) {
    const isDev = window.location.port === '5173';
    if (isDev && engineUrl) {
      const cleanUrl = engineUrl.trim();
      const urlWithProto = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
      return urlWithProto.replace(/\/$/, '');
    }
    return window.location.origin;
  }

  // Detect wildcard URLs (e.g., https://*.frontbase.dev) — treat as implicitly shared
  const isWildcard = engineUrl?.includes('*') ?? false;
  const effectivelyShared = isShared || isWildcard;

  // If this is a shared community engine (or wildcard URL), the tenant's exact subdomain routing
  // is what matters — resolve to tenant.frontbase.dev rather than the raw worker domain.
  if (effectivelyShared && tenantSlug) {
    // If the engine URL is a wildcard like https://*.frontbase.dev, replace * with tenantSlug
    if (isWildcard && engineUrl) {
      const resolved = engineUrl.replace('*', tenantSlug);
      try {
        new URL(resolved); // Validate the result is a parseable URL
        return resolved.replace(/\/$/, '');
      } catch {
        // Fall through to hostname-based resolution
      }
    }

    const hostParts = window.location.hostname.split('.');
    if (hostParts.length >= 3 && window.location.hostname !== 'localhost') {
      // App is on app.frontbase.dev or another domain with subdomains, replace first
      hostParts[0] = tenantSlug;
      return `${window.location.protocol}//${hostParts.join('.')}${window.location.port ? ':' + window.location.port : ''}`;
    }
  }

  if (effectivelyShared) {
    return window.location.origin;
  }

  if (!engineUrl) return '';
  
  const cleanUrl = engineUrl.trim();
  const urlWithProto = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
  
  try {
    const host = new URL(urlWithProto).hostname;
    // Basic heuristic: internal hostnames either don't have dots or are explicitly localhost
    const isInternal = !host.includes('.') || host === 'localhost' || host === '0.0.0.0';
    
    if (isInternal) {
      const isDev = window.location.port === '5173';
      return isDev ? urlWithProto.replace(/\/$/, '') : window.location.origin;
    }
    
    return urlWithProto.replace(/\/$/, '');
  } catch {
    return urlWithProto.replace(/\/$/, '');
  }
}

/**
 * Computes a full edge preview/webhook URL directly appended to the normalized origin.
 * 
 * @param engineUrl The raw Edge engine URL from the data model
 * @param isShared Whether the engine is a shared community worker
 */
export function resolvePreviewUrl(engineUrl: string | undefined | null, path: string = '', isShared?: boolean, tenantSlug?: string, isSystem?: boolean): string {
  const origin = resolveEngineOrigin(engineUrl, isShared, tenantSlug, isSystem);
  if (!origin) return '';
  const cleanPath = path.replace(/^\//, ''); // Avoid double-slashes
  return cleanPath ? `${origin}/${cleanPath}` : origin;
}

/**
 * Minimal shape of a publish/preview target. Structural — accepts both the
 * builder header's EdgeTarget and the EdgePublishDialog's EdgeTarget.
 */
export interface PreviewTarget {
  url?: string | null;
  is_shared?: boolean;
  is_system?: boolean;
}

/**
 * Resolve a browser-usable preview URL for a published page on a given target.
 *
 * The backend publish endpoint can return an internal Docker hostname or an
 * empty string for the system edge (which has no standalone engine.url), so we
 * mirror the PagesPanel.getPreviewUrl priority order to guarantee a usable URL:
 *
 *   1. System edge      → this deployment's own origin (it IS the worker).
 *   2. Shared + tenant  → resolve the tenant subdomain (stored URLs may be the
 *                         raw backend request origin rather than the route).
 *   3. Stored previewUrl → exact tenant-aware URL the edge returned at publish.
 *   4. Engine URL       → resolve from the target's configured URL.
 *   5. Origin fallback  → current browser origin (reverse proxy routes it).
 *
 * @param pagePath '' for the homepage, otherwise the page slug.
 */
export function resolvePagePreviewUrl(
  target: PreviewTarget | undefined | null,
  pagePath: string,
  storedPreviewUrl: string | undefined | null,
  tenantSlug?: string,
): string {
  if (!target) return (storedPreviewUrl ?? '').trim();

  const cleanPath = pagePath.replace(/^\//, '');

  // 1. System edge = the worker this deployment runs on.
  if (target.is_system) {
    return cleanPath ? `${window.location.origin}/${cleanPath}` : window.location.origin;
  }

  // 2. Shared community engine with tenant routing — resolve subdomain first.
  if (target.is_shared && tenantSlug) {
    const resolved = resolvePreviewUrl(target.url, pagePath, target.is_shared, tenantSlug);
    if (resolved) return resolved;
  }

  // 3. Prefer the exact tenant-aware URL the edge returned at publish time.
  if (storedPreviewUrl && storedPreviewUrl.trim()) return storedPreviewUrl.trim();

  // 4. Resolve from the engine URL.
  const resolved = resolvePreviewUrl(target.url, pagePath, target.is_shared, tenantSlug);
  if (resolved) return resolved;

  // 5. Absolute fallback: current origin (reverse proxy handles routing).
  return cleanPath ? `${window.location.origin}/${cleanPath}` : window.location.origin;
}
