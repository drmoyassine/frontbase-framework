/**
 * HTML Document Generator
 *
 * Generates the full HTML document shell for SSR-rendered pages.
 * Extracted from routes/pages.ts for single-responsibility compliance.
 */

import { TrackingConfig } from './lib/tracking.js';
import { FALLBACK_CSS } from './baseStyles.js';
import { escapeHtml } from './components/lib/utils.js';

// Re-export the canonical escapeHtml so existing callers (e.g. shell.ts) that
// import it from htmlDocument keep working after the consolidation.
export { escapeHtml };

// Cache-busting version - update this when hydration scripts change
const HYDRATE_VERSION = '20260617c';

// Default favicon path constant
const DEFAULT_FAVICON = '/static/icon.png';

// Reuse the PageData interface shape from pages route
export interface HtmlPageData {
    id: string;
    slug: string;
    name: string;
    title?: string;
    description?: string;
    keywords?: string;
    layoutData: unknown;
    datasources?: unknown[];
    cssBundle?: string;
}

/** Auth config for client-side SDK (Realtime subscription + signOut) */
export interface AuthConfig {
    url: string;              // Supabase project URL
    anonKey: string;          // Supabase anon key
    contactsTable: string;    // Table name for contact records
    authUserIdColumn: string; // Column to match auth user ID
    accessToken?: string;     // User's JWT for RLS-authenticated Realtime
}

/**
 * Generate the full HTML document for an SSR-rendered page.
 */
export function generateHtmlDocument(
    page: HtmlPageData,
    bodyHtml: string,
    initialState: Record<string, unknown>,
    trackingConfig: TrackingConfig,
    faviconUrl: string = DEFAULT_FAVICON,
    authConfig?: AuthConfig | null
): string {
    const title = page.title || page.name;
    const description = page.description || '';
    const keywords = page.keywords || '';

    // Sprint 4A: builder-injected analytics (GA4 / GTM) + custom <head> HTML.
    const analyticsHead = buildAnalyticsHead(trackingConfig);
    const gtmNoscript = buildGtmNoscript(trackingConfig.gtmContainerId);
    const customHead = sanitizeCustomHead(trackingConfig.customHeadHtml);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
    ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
    <meta name="generator" content="Frontbase">
    ${analyticsHead}
    <!-- Favicon -->
    <link rel="icon" type="image/png" href="${faviconUrl}">
    <link rel="apple-touch-icon" href="${faviconUrl}">
    
    <!-- Prefetch hydration bundle -->
    <link rel="modulepreload" href="/static/react/hydrate.js?v=${HYDRATE_VERSION}">

    <!-- Client-Side Visitor Context Enhancement -->
    <script>
    (function() {
        if (sessionStorage.getItem('visitor-enhanced')) return;
        
        // Configuration from advancedVariables
        const adv = ${JSON.stringify(trackingConfig.advancedVariables || {})};
        const data = {};

        // Timezone as UTC offset (+3, -5.5)
        if (adv.timezone?.collect !== false) {
            const offset = -new Date().getTimezoneOffset() / 60;
            data.tz = (offset >= 0 ? '+' : '') + offset;
        }

        // Viewport only
        if (adv.viewport?.collect !== false) {
            data.vp = innerWidth + 'x' + innerHeight;
        }

        // Theme preference
        if (adv.themePreference?.collect !== false) {
            data.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        // Connection type
        if (adv.connectionType?.collect !== false && navigator.connection) {
            data.conn = navigator.connection.effectiveType;
        }

        if (Object.keys(data).length > 0) {
            document.cookie = "visitor-enhanced=" + encodeURIComponent(JSON.stringify(data)) + "; path=/; max-age=31536000; SameSite=Lax";
            sessionStorage.setItem('visitor-enhanced', '1');
        }
    })();
    </script>
    
    <!-- Base styles (from CSS Bundle or fallback) -->
    <style>
        ${page.cssBundle || FALLBACK_CSS}
    </style>
    ${customHead}
</head>
<body>
    ${gtmNoscript}
    <div id="root">${bodyHtml}</div>
    <!-- Initial state for hydration -->
    <script>
        window.__INITIAL_STATE__ = ${safeJsonStringify(initialState)};
        window.__PAGE_DATA__ = ${safeJsonStringify({
        id: page.id,
        slug: page.slug,
        layoutData: page.layoutData,
        datasources: page.datasources
    })};
    </script>
    
    <!-- Frontbase Client SDK -->
    <script>
        // Initialize window.frontbase SDK
        (function() {
            var STORAGE_KEY = 'frontbase_user';

            // Sync SSR user state to localStorage
            try {
                var state = window.__INITIAL_STATE__;
                if (state && state.user) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
                } else {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (e) {
                console.warn('[Frontbase] Failed to sync user to localStorage:', e);
            }

            // Public SDK
            window.frontbase = {
                _channel: null,
                _supabase: null,

                get user() {
                    try {
                        var raw = localStorage.getItem(STORAGE_KEY);
                        return raw ? JSON.parse(raw) : null;
                    } catch (e) { return null; }
                },

                signOut: function(redirectTo) {
                    // 1. Unsubscribe Realtime
                    if (this._channel && this._supabase) {
                        this._supabase.removeChannel(this._channel);
                        this._channel = null;
                    }
                    // 2. Clear localStorage
                    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
                    // 3. POST to logout endpoint
                    fetch('/api/page-auth/logout', { method: 'POST', credentials: 'same-origin' })
                        .finally(function() {
                            window.location.href = redirectTo || '/';
                        });
                }
            };
        })();
    </script>
${authConfig ? `
    <!-- Supabase Realtime (async, only for logged-in users) -->
    <script>
    (function() {
        var user = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
        if (!user) return;

        var cfg = ${safeJsonStringify(authConfig)};
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.async = true;
        script.onload = function() {
            try {
                var sb = supabase.createClient(cfg.url, cfg.anonKey);
                window.frontbase._supabase = sb;

                // Set authenticated session so Realtime has RLS permissions
                if (cfg.accessToken) {
                    sb.realtime.setAuth(cfg.accessToken);
                }

                var channel = sb.channel('user-contact-' + user.id)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: cfg.contactsTable,
                        filter: cfg.authUserIdColumn + '=eq.' + user.id
                    }, function(payload) {
                        console.log('[Frontbase] Realtime UPDATE:', payload.new);
                        var current = window.frontbase.user || {};
                        var merged = Object.assign({}, current, payload.new);
                        try {
                            localStorage.setItem('frontbase_user', JSON.stringify(merged));
                        } catch (e) {}

                        // Soft refresh: re-fetch page and swap #root content
                        fetch(window.location.href, { credentials: 'same-origin' })
                            .then(function(r) { return r.text(); })
                            .then(function(html) {
                                var parser = new DOMParser();
                                var doc = parser.parseFromString(html, 'text/html');
                                var newRoot = doc.getElementById('root');
                                var oldRoot = document.getElementById('root');
                                if (newRoot && oldRoot) {
                                    oldRoot.innerHTML = newRoot.innerHTML;
                                    console.log('[Frontbase] Page content refreshed with new user data');
                                }
                            })
                            .catch(function(err) {
                                console.warn('[Frontbase] Soft refresh failed:', err);
                            });

                        window.dispatchEvent(new CustomEvent('frontbase:user-updated', { detail: merged }));
                    })
                    .subscribe(function(status) {
                        console.log('[Frontbase] Realtime status:', status);
                    });

                window.frontbase._channel = channel;
            } catch (err) {
                console.warn('[Frontbase] Realtime setup failed:', err);
            }
        };
        document.head.appendChild(script);
    })();
    </script>
` : ''}

    <!-- Background Eager Prefetcher -->
    <script>
    (function() {
        if (sessionStorage.getItem('fb-prefetched')) return;
        var rIC = window.requestIdleCallback || function(cb) { setTimeout(cb, 2000); };
        rIC(function() {
            fetch('/sitemap.xml')
                .then(function(r) { return r.text(); })
                .then(function(xml) {
                    var urls = [];
                    var regex = /<loc>(.*?)<\\/loc>/g;
                    var match;
                    while ((match = regex.exec(xml)) !== null) {
                        if (match[1] !== window.location.href) urls.push(match[1]);
                    }
                    var i = 0;
                    function fetchNext() {
                        if (i >= urls.length) {
                            sessionStorage.setItem('fb-prefetched', '1');
                            return;
                        }
                        if (urls[i].indexOf(window.location.origin) === 0) {
                            fetch(urls[i], { priority: 'low' }).catch(function(){});
                        }
                        i++;
                        setTimeout(fetchNext, 100); // Stagger requests
                    }
                    if (urls.length > 0) fetchNext();
                })
                .catch(function(){});
        });
    })();
    </script>

    <!-- Hydration bundle (all interactive components) -->
    <script type="module" src="/static/react/hydrate.js?v=${HYDRATE_VERSION}"></script>
</body>
</html>`;
}

/**
 * Safely stringify JSON for embedding in <script> tags.
 * Escapes </script> sequences to prevent user content from breaking the page.
 */
export function safeJsonStringify(obj: unknown): string {
    return JSON.stringify(obj)
        .replace(/<\/script>/gi, '<\\/script>')
        .replace(/<!--/g, '<\\!--');
}

// `escapeHtml` is re-exported from the canonical implementation in
// `./components/lib/utils.js` (imported above) for callers that historically
// reached into htmlDocument for it.
// ── Sprint 4A: builder analytics injection ────────────────────────────────

const GA4_RE = /^G-[A-Z0-9]{6,}$/;
const GTM_RE = /^GTM-[A-Z0-9]+$/;

/**
 * Build the GA4 + GTM `<head>` scripts for a published page. IDs are validated
 * against their canonical formats so a malformed value never ships broken HTML.
 * GTM takes precedence when both are set (GTM can load GA4 itself).
 */
export function buildAnalyticsHead(cfg: { ga4MeasurementId?: string; gtmContainerId?: string }): string {
    const parts: string[] = [];
    const gtm = cfg.gtmContainerId && GTM_RE.test(cfg.gtmContainerId) ? cfg.gtmContainerId : '';
    const ga4 = cfg.ga4MeasurementId && GA4_RE.test(cfg.ga4MeasurementId) ? cfg.ga4MeasurementId : '';

    if (gtm) {
        parts.push(`<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');</script>
<!-- End Google Tag Manager -->`);
    } else if (ga4) {
        // Only emit GA4 directly when GTM isn't configured (GTM loads GA4 itself).
        parts.push(`<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4}');
</script>`);
    }
    return parts.join('\n    ');
}

/** GTM <noscript> iframe — must live immediately after <body>, not in <head>. */
export function buildGtmNoscript(gtmContainerId?: string): string {
    if (!gtmContainerId || !GTM_RE.test(gtmContainerId)) return '';
    return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmContainerId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
}

/**
 * Sanitize builder-supplied custom <head> HTML. This is raw HTML the builder
 * intentionally injects (their own pixels/verification tags), so it is NOT
 * HTML-escaped — but we strip document-structure breakouts (`</head>`, `</body>`,
 * `<html`) so a stray tag can't terminate the document early. XSS is an accepted
 * builder risk (they control their own published pages); documented in sprint4.md.
 */
export function sanitizeCustomHead(html?: string): string {
    if (!html || !html.trim()) return '';
    return html
        .replace(/<\/\s*(head|body|html)\s*>/gi, '')
        .replace(/<\s*html\b/gi, '&lt;html')
        .replace(/<\/\s*script\s*>/gi, '<\\/script>'); // safe inside the template literal
}
