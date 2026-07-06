/**
 * Visitor Tracking - Optional Cookie-Based Tracking
 * 
 * Only active if enabled in /settings → Privacy & Tracking
 */

// =============================================================================
// Types
// =============================================================================

export interface AdvancedVariableConfig {
    collect: boolean;
    expose: boolean;
}

// Advanced visitor variables (configurable via Settings > Privacy & Tracking)
// Basic variables (country, city, timezone, device) are ALWAYS available - not listed here
export interface AdvancedVariables {
    ip: AdvancedVariableConfig;
    browser: AdvancedVariableConfig;
    os: AdvancedVariableConfig;
    language: AdvancedVariableConfig;
    viewport: AdvancedVariableConfig;
    themePreference: AdvancedVariableConfig;
    connectionType: AdvancedVariableConfig;
    referrer: AdvancedVariableConfig;
    isBot: AdvancedVariableConfig;
}

export interface TrackingConfig {
    enableVisitorTracking: boolean;
    cookieExpiryDays: number;
    requireCookieConsent: boolean;
    advancedVariables?: AdvancedVariables;
    /** Google Analytics 4 measurement ID (G-XXXXXXXXXX). Sprint 4A. */
    ga4MeasurementId?: string;
    /** Google Tag Manager container ID (GTM-XXXXXXX). Sprint 4A. */
    gtmContainerId?: string;
    /** Arbitrary <head> HTML (other pixels / verification meta). Sprint 4A. */
    customHeadHtml?: string;
}

export interface TrackingVariables {
    isFirstVisit: boolean;
    visitCount: number;
    firstVisitAt: string;
    landingPage: string;
}

export interface VisitorContext {
    ip: string;
    country: string;
    city: string;
    timezone: string;
    device: 'mobile' | 'tablet' | 'desktop';
    browser: string;
    os: string;
    language: string;
    referrer: string;
    isBot: boolean;
    // Optional tracking variables (only if enabled)
    isFirstVisit?: boolean;
    visitCount?: number;
    firstVisitAt?: string;
    landingPage?: string;
    // Client-side enhanced fields
    viewport?: string;
    themePreference?: 'dark' | 'light';
    connectionType?: string;
}

// =============================================================================
// Constants
// =============================================================================

const TRACKING_COOKIE_NAME = 'fb_visitor';
const CONSENT_COOKIE_NAME = 'fb_consent';

// =============================================================================
// Tracking Functions
// =============================================================================

/**
 * Extend visitor context with tracking variables (if enabled)
 */
export function applyVisitorTracking(
    visitor: VisitorContext,
    request: Request,
    config: TrackingConfig,
    cookies: Record<string, string>
): VisitorContext {

    // If tracking disabled, return base visitor context
    if (!config.enableVisitorTracking) {
        return visitor;
    }

    // If consent required, check for consent cookie
    if (config.requireCookieConsent && cookies[CONSENT_COOKIE_NAME] !== 'accepted') {
        return visitor;
    }

    // Parse existing tracking cookie
    const trackingData = parseTrackingCookie(cookies[TRACKING_COOKIE_NAME]);

    // Determine if first visit
    const isFirstVisit = !trackingData;

    // Build tracking variables
    const tracking: TrackingVariables = {
        isFirstVisit,
        visitCount: (trackingData?.visitCount || 0) + 1,
        firstVisitAt: trackingData?.firstVisitAt || new Date().toISOString(),
        landingPage: trackingData?.landingPage || new URL(request.url).pathname,
    };

    return {
        ...visitor,
        ...tracking,
    };
}

/**
 * Build Set-Cookie header for tracking (called on response)
 */
export function buildTrackingCookie(
    tracking: TrackingVariables,
    config: TrackingConfig
): string {
    const data = JSON.stringify({
        visitCount: tracking.visitCount,
        firstVisitAt: tracking.firstVisitAt,
        landingPage: tracking.landingPage,
    });

    const maxAge = config.cookieExpiryDays * 86400;
    return `${TRACKING_COOKIE_NAME}=${encodeURIComponent(data)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

/**
 * Check if we should set tracking cookie on response
 */
export function shouldSetTrackingCookie(
    config: TrackingConfig,
    cookies: Record<string, string>
): boolean {
    if (!config.enableVisitorTracking) return false;
    if (config.requireCookieConsent && cookies[CONSENT_COOKIE_NAME] !== 'accepted') {
        return false;
    }
    return true;
}

/**
 * Get default tracking config (used when settings not loaded)
 */
export function getDefaultTrackingConfig(): TrackingConfig {
    return {
        enableVisitorTracking: false,
        cookieExpiryDays: 365,
        requireCookieConsent: true,
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseTrackingCookie(value: string | undefined): TrackingVariables | null {
    if (!value) return null;
    try {
        return JSON.parse(decodeURIComponent(value));
    } catch {
        return null;
    }
}
