/**
 * Community Edition "Powered by Frontbase" badge + sign-out pill.
 * Pure code move from PageRenderer.renderPage; no logic change.
 *
 * NOTE: the template-literal whitespace below is byte-load-bearing — the
 * leading newlines and 12-space indentation are part of the rendered output and
 * are reproduced verbatim from the original renderPage block. Do NOT re-indent.
 */

export function renderBadge(
    edition: string,
    licenseKey: string | undefined,
    env: string | undefined,
    user: unknown
): string {
    // If it's community edition and no license key is provided, inject the badge.
    // SUPPRESSED in the builder canvas (system.env === 'builder', set by BOTH the
    // reRender endpoint and the builder Service Worker) — the "Powered by" pill is
    // a published-page watermark, not builder chrome. Live pages render with
    // system.env = nodeEnv ('production'), so the badge still shows there.
    if (edition !== 'community' || licenseKey || env === 'builder') {
        return '';
    }

    // Floating sign-out pill (only when user is logged in)
    const signOutHtml = user ? `
            <div style="position:fixed;bottom:48px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <button onclick="frontbase.signOut()" style="display:flex;align-items:center;gap:5px;background:white;padding:5px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.2s;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <span>Sign Out</span>
                </button>
            </div>
        ` : '';
    return `${signOutHtml}
            <div style="position:fixed;bottom:16px;right:16px;z-index:9999;font-family:system-ui,-apple-system,sans-serif;">
                <a href="https://frontbase.dev?ref=badge" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:6px;background:white;padding:6px 10px;border-radius:6px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);text-decoration:none;color:#374151;font-size:12px;font-weight:500;border:1px solid #e5e7eb;transition:all 0.2s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Powered by Frontbase</span>
                </a>
            </div>
        `;
}
