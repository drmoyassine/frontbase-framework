/**
 * Gated Page Document Generator
 * 
 * Generates an HTML document for private pages when the visitor is NOT authenticated.
 * The page content is rendered but blurred behind a frosted-glass overlay with
 * an inline auth form. On successful auth, the page reloads and serves normally.
 * 
 * Self-sufficient: Uses Supabase JS from CDN. No FastAPI calls at runtime.
 * Auth form config comes from the baked `_primaryAuthForm` field in the page bundle.
 */

import type { HtmlPageData } from './htmlDocument.js';
import { generateHtmlDocument } from './htmlDocument.js';

interface AuthFormConfig {
    type: 'login' | 'signup' | 'both';
    title?: string;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    providers?: string[];
    magicLink?: boolean;
    showLinks?: boolean;
    redirectUrl?: string;
}

/**
 * Wrap normal page HTML with auth-gating overlay.
 * Returns the full HTML string.
 */
export function generateGatedPageDocument(
    page: HtmlPageData,
    bodyHtml: string,
    initialState: Record<string, unknown>,
    trackingConfig: any,
    faviconUrl: string | null | undefined,
    authFormConfig?: AuthFormConfig,
): string {
    // Generate the normal page HTML first
    const normalHtml = generateHtmlDocument(page, bodyHtml, initialState, trackingConfig, faviconUrl ?? undefined);

    // Build the auth form HTML
    const formConfig: AuthFormConfig = authFormConfig || {
        type: 'both',
        title: 'Welcome',
        showLinks: true,
    };

    // Determine current path for redirect after login
    // If it's the homepage, the url is '/'. Otherwise '/slug'
    const currentPath = (page as any).isHomepage ? '/' : `/${page.slug}`;
    const authOverlayHtml = buildAuthOverlay(formConfig, currentPath);

    // Inject: wrap #root content in blur container, append overlay before </body>
    const modifiedHtml = normalHtml
        .replace(
            /<div id="root">/,
            '<div id="root" style="filter:blur(8px);pointer-events:none;user-select:none;-webkit-filter:blur(8px)">'
        )
        .replace(
            '</body>',
            `${authOverlayHtml}\n</body>`
        );

    return modifiedHtml;
}

/**
 * Build the auth overlay HTML (inline styles, no external CSS dependencies)
 */
function buildAuthOverlay(
    config: AuthFormConfig,
    currentPath: string = '/',
): string {
    const primaryColor = config.primaryColor || '#18181b';
    const title = config.title || (config.type === 'signup' ? 'Create an Account' : 'Sign In');
    const description = config.description || '';
    const showToggle = config.type === 'both';
    const defaultIsLogin = config.type !== 'signup';

    // Social provider buttons
    const socialButtons = (config.providers || []).map((provider) => {
        const name = provider.charAt(0).toUpperCase() + provider.slice(1);
        return `<button type="button" class="fb-social-btn" data-provider="${provider}">
            Continue with ${name}
        </button>`;
    }).join('\n');

    const hasSocial = (config.providers || []).length > 0;

    return `
<!-- Frontbase Auth Overlay (Private Page Gating) -->
<div id="fb-auth-overlay" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem">

<!-- Toast notification -->
<div id="fb-auth-toast" style="position:fixed;top:1.5rem;left:50%;transform:translateX(-50%);background:#18181b;color:#fff;padding:0.75rem 1.5rem;border-radius:0.5rem;font-size:0.875rem;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:100000;animation:fb-toast-in 0.5s ease-out">
    Please log in or sign up to access this page
</div>

<!-- Auth Card -->
<div style="background:#fff;border-radius:0.75rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:400px;width:100%;padding:2rem;font-family:system-ui,-apple-system,sans-serif;animation:fb-card-in 0.4s ease-out">

    ${config.logoUrl ? `<div style="text-align:center;margin-bottom:1.5rem"><img src="${escapeHtml(config.logoUrl)}" alt="Logo" style="max-height:48px;max-width:200px"></div>` : ''}

    <h2 id="fb-auth-title" style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;color:#18181b;text-align:center">${escapeHtml(title)}</h2>
    ${description ? `<p style="margin:0 0 1.5rem;color:#71717a;font-size:0.875rem;text-align:center">${escapeHtml(description)}</p>` : '<div style="margin-bottom:1.5rem"></div>'}

    ${hasSocial ? `
    <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">
        ${socialButtons}
    </div>
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
        <div style="flex:1;height:1px;background:#e4e4e7"></div>
        <span style="color:#a1a1aa;font-size:0.75rem;text-transform:uppercase">or</span>
        <div style="flex:1;height:1px;background:#e4e4e7"></div>
    </div>
    ` : ''}

    <div id="fb-auth-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem"></div>

    <form id="fb-auth-form" action="/api/page-auth/login" method="POST" style="display:flex;flex-direction:column;gap:0.75rem">
        <input type="hidden" name="redirectTo" value="${escapeHtml(currentPath)}">
        <div>
            <label for="fb-email" style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Email</label>
            <input id="fb-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"
                style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box"
                onfocus="this.style.borderColor='${primaryColor}'" onblur="this.style.borderColor='#d4d4d8'">
        </div>
        <div>
            <label for="fb-password" style="display:block;font-size:0.8125rem;font-weight:500;color:#374151;margin-bottom:0.25rem">Password</label>
            <input id="fb-password" name="password" type="password" required autocomplete="current-password" placeholder="••••••••" minlength="6"
                style="width:100%;padding:0.5rem 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.875rem;outline:none;transition:border-color 0.2s;box-sizing:border-box"
                onfocus="this.style.borderColor='${primaryColor}'" onblur="this.style.borderColor='#d4d4d8'">
        </div>
        <button id="fb-auth-submit" type="submit"
            style="width:100%;padding:0.625rem;background:${primaryColor};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer;transition:opacity 0.2s"
            onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            ${defaultIsLogin ? 'Sign In' : 'Sign Up'}
        </button>
    </form>

    ${showToggle ? `
    <p id="fb-auth-toggle" style="text-align:center;margin-top:1rem;font-size:0.8125rem;color:#71717a">
        <span id="fb-toggle-text">${defaultIsLogin ? "Don't have an account?" : 'Already have an account?'}</span>
        <a href="#" id="fb-toggle-link" style="color:${primaryColor};font-weight:500;text-decoration:none;margin-left:0.25rem"
            onclick="fbToggleMode();return false">${defaultIsLogin ? 'Sign Up' : 'Sign In'}</a>
    </p>
    ` : ''}

</div>
</div>

<style>
@keyframes fb-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-1rem)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes fb-card-in{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
.fb-social-btn{width:100%;padding:0.5rem;background:#fff;border:1px solid #d4d4d8;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer;transition:background 0.2s;font-family:inherit}
.fb-social-btn:hover{background:#f4f4f5}
</style>

<script>
(function(){
    var isLoginMode = ${defaultIsLogin ? 'true' : 'false'};
    var form = document.getElementById('fb-auth-form');
    var errorDiv = document.getElementById('fb-auth-error');
    var submitBtn = document.getElementById('fb-auth-submit');

    // Show error from URL params (server-side redirect on auth failure)
    var urlParams = new URLSearchParams(window.location.search);
    var authError = urlParams.get('auth_error');
    var authMessage = urlParams.get('auth_message');
    if (authError) {
        errorDiv.textContent = authError;
        errorDiv.style.display = 'block';
    }
    if (authMessage) {
        errorDiv.style.background = '#f0fdf4';
        errorDiv.style.borderColor = '#bbf7d0';
        errorDiv.style.color = '#16a34a';
        errorDiv.textContent = authMessage;
        errorDiv.style.display = 'block';
    }

    // Loading state on submit
    form.addEventListener('submit', function() {
        submitBtn.disabled = true;
        submitBtn.textContent = isLoginMode ? 'Signing in...' : 'Signing up...';
    });

    // Toggle login/signup mode
    window.fbToggleMode = function() {
        isLoginMode = !isLoginMode;
        form.action = isLoginMode ? '/api/page-auth/login' : '/api/page-auth/signup';
        document.getElementById('fb-auth-title').textContent = isLoginMode ? '${escapeHtml(config.type === 'both' ? 'Welcome Back' : title)}' : 'Create an Account';
        submitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        document.getElementById('fb-toggle-text').textContent = isLoginMode ? "Don't have an account?" : 'Already have an account?';
        document.getElementById('fb-toggle-link').textContent = isLoginMode ? 'Sign Up' : 'Sign In';
        document.getElementById('fb-password').autocomplete = isLoginMode ? 'current-password' : 'new-password';
    };

    // Auto-dismiss toast after 5s
    setTimeout(function() {
        var toast = document.getElementById('fb-auth-toast');
        if (toast) toast.style.opacity = '0';
        setTimeout(function() { if (toast) toast.remove(); }, 500);
    }, 5000);
})();
</script>`;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
