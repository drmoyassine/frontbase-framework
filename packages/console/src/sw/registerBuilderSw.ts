/**
 * registerBuilderSw — register the builder-scoped Service Worker (Phase E).
 *
 * Called once at BuilderPage mount. Both the script URL and the scope are
 * derived from the app's configured base path (import.meta.env.BASE_URL) so
 * they resolve correctly in EVERY deploy mode:
 *
 *   - vite dev  (base "/")                 → script /builder-sw.js,         scope /builder/
 *   - prod self-host (base "/frontbase-admin/") → script /frontbase-admin/builder-sw.js, scope /frontbase-admin/builder/
 *   - prod cloud     (base "/admin/")           → script /admin/builder-sw.js,         scope /admin/builder/
 *
 * A SW can only control URLs at-or-below its own script path. Deriving BOTH
 * the script URL and the scope from BASE_URL guarantees the script is always
 * an ancestor of the builder SPA route (BASE_URL + "builder/:pageId"), so the
 * page becomes controlled and its virtual POST /__fb_builder_render__ is
 * intercepted locally.
 *
 * === WHY NOT THE SPEC'S LITERAL scope "/builder/" ===
 * The product SPA's builder route is BrowserRouter("/builder/:pageId") mounted
 * UNDER base. In production the literal "/builder/" prefix is owned by the
 * FRAMEWORK WORKER (its /builder/api/* + /builder/edit/* server routes), NOT
 * by this SPA. Registering at root "/builder/" would (a) exceed the SW's
 * script-path authority (SecurityError — scope exceeds the registered script
 * URL) and (b) target the wrong origin's routes. BASE_URL + "builder/" is the
 * correct, deploy-mode-agnostic scope and matches the spec's INTENT (control
 * the builder area).
 *
 * === COLLISION CHECK ===
 * No other SW is registered by this SPA — a repo-wide search for
 * `serviceWorker.register` / `@vite-pwa` / `workbox` returned zero hits in
 * src/ and index.html. The published-page /sw.js is served by the framework
 * worker to site VISITORS (a different browsing context) and is NOT registered
 * here, so the two SWs never share a scope.
 *
 * === NON-FATAL ===
 * If registration fails (unsupported browser, HTTPS/network error, script 404
 * in dev before the first build pass), we return { ok: false } and the client
 * render path silently falls back to POST /builder/api/reRender (Phase D).
 */

export interface RegisterBuilderSwResult {
    ok: boolean;
    /** The scope we requested (always BASE_URL + "builder/"). */
    scope: string;
    /** The script URL we registered (always BASE_URL + "builder-sw.js"). */
    scriptURL: string;
    /** Present only when ok === false. */
    error?: string;
}

const SW_FILENAME = 'builder-sw.js';

/**
 * Register the builder SW exactly once per page load. Safe to call repeatedly
 * — the browser dedupes by script URL + scope, and a second register() with
 * the same URL just refreshes the registration.
 */
export async function registerBuilderSw(): Promise<RegisterBuilderSwResult> {
    // BASE_URL always carries a leading slash and a trailing slash (vite normalises
    // it to the `base` config value, e.g. "/", "/frontbase-admin/", "/admin/").
    const base = import.meta.env.BASE_URL;
    const scriptURL = `${base}${SW_FILENAME}`;
    const scope = `${base}builder/`;

    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        return { ok: false, scope, scriptURL, error: 'service-worker-unsupported' };
    }

    try {
        const registration = await navigator.serviceWorker.register(scriptURL, {
            scope,
            // The SW is tiny and changes whenever edge-core or the SW source
            // changes — always fetch the freshest bytes during registration,
            // never a cached HTTP response.
            updateViaCache: 'none',
        });
        // `scriptURL` on ServiceWorkerRegistration is not in this project's
        // TS lib version; the string we passed is the source of truth anyway.
        void registration;
        return {
            ok: true,
            scope,
            scriptURL,
        };
    } catch (err) {
        return {
            ok: false,
            scope,
            scriptURL,
            error: err instanceof Error ? err.message : 'register-failed',
        };
    }
}
