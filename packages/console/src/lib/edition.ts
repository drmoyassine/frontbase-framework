/**
 * Edition detection — shared frontend helpers.
 *
 * Reads VITE_DEPLOYMENT_MODE at build time.
 * "self-host" (default) → /frontbase-admin/ base path, session cookies.
 * "cloud"               → /admin/ base path, JWT auth.
 *
 * When VITE_DEPLOYMENT_MODE is not set or "self-host":
 *   - SPA talks to FastAPI via relative URLs (Vite proxy)
 *   - Agent chat goes to FastAPI /api/agent/chat
 *   - Auth via ADMIN_EMAIL/ADMIN_PASSWORD session cookies
 *
 * When VITE_DEPLOYMENT_MODE is "cloud":
 *   - Multi-tenant cloud SaaS at app.frontbase.dev
 *   - Auth via JWT (signup + login)
 *   - FastAPI handles master admin + cloud users
 */

export type DeploymentMode = 'self-host' | 'cloud';

export const DEPLOYMENT_MODE: DeploymentMode =
  (import.meta.env.VITE_DEPLOYMENT_MODE as DeploymentMode) || 'self-host';

export const isCloud = (): boolean => DEPLOYMENT_MODE === 'cloud';
export const isSelfHost = (): boolean => DEPLOYMENT_MODE !== 'cloud';

/** BrowserRouter basename — differs between editions. */
export const BASE_PATH: string = isCloud() ? '/admin' : '/frontbase-admin';

/**
 * Get the API base URL for design-time operations.
 *
 * Both modes: '' (relative URLs → Vite proxy / reverse proxy → FastAPI)
 */
export function getApiBase(): string {
  return ''; // relative → Vite proxy (dev) / nginx (prod)
}

/**
 * Get the agent chat URL.
 *
 * Self-host: FastAPI /api/agent/chat (Python, no Zod bugs)
 * Cloud: same — FastAPI handles workspace agent
 */
export function getAgentChatUrl(profileSlug: string): string {
  return `/api/agent/chat/${profileSlug}`;
}
