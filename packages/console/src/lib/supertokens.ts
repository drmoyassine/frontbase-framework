/**
 * SuperTokens Web SDK Initialization — Cloud mode only.
 *
 * Handles automatic access token refresh when the token expires.
 * Uses supertokens-web-js (lightweight, no UI) — just wraps fetch()
 * to intercept 401s and auto-refresh via the /api/auth/session/refresh endpoint.
 *
 * This module must be initialized ONCE at app startup (in main.tsx or App.tsx).
 */

import SuperTokens from 'supertokens-web-js';
import Session from 'supertokens-web-js/recipe/session';
import { isCloud } from '@/lib/edition';

let _initialized = false;

/**
 * Initialize SuperTokens web SDK for automatic session management.
 * Safe to call multiple times — only initializes once.
 * No-op in self-host mode.
 */
export function initSuperTokens(): void {
  if (_initialized || !isCloud()) return;

  SuperTokens.init({
    appInfo: {
      appName: 'Frontbase Cloud',
      apiDomain: window.location.origin,  // Same origin — reverse proxy handles routing
      apiBasePath: '/api/auth',
      websiteBasePath: '/admin',
    } as any,
    recipeList: [
      Session.init(),
    ],
  });

  _initialized = true;
  console.log('[SuperTokens] Web SDK initialized');
}
