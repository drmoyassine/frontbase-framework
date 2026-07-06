/**
 * Template Context Builder
 * 
 * Builds the unified context object for LiquidJS template rendering.
 * Collects variables from: page, user, visitor, url, system, cookies, local, session
 */

import { getUserFromSession } from './auth-seam.js';
import { engineConfig } from '../../config.js';
import type { UserContext } from './IAuthProvider.js';
import { applyVisitorTracking, TrackingConfig, VisitorContext, getDefaultTrackingConfig } from './tracking.js';

// =============================================================================
// Types
// =============================================================================

export interface PageData {
    id: string;
    title: string;
    slug: string;
    description?: string;
    published: boolean;
    createdAt: string;
    updatedAt: string;
    canonicalUrl?: string;
    ogImage?: string;
    ogType?: string;
    customVariables?: Record<string, unknown>;
    appVariables?: Record<string, unknown> | null;
}

export interface SystemContext {
    date: string;
    time: string;
    datetime: string;
    timestamp: number;
    year: number;
    month: number;
    day: number;
    env: string;
}

export interface TemplateContext {
    page: {
        id: string;
        title: string;
        url: string;
        slug: string;
        description: string;
        published: boolean;
        createdAt: string;
        updatedAt: string;
        image: string;
        type: string;
        custom: Record<string, unknown>;
    };
    user: UserContext | null;
    visitor: VisitorContext;
    url: Record<string, string>;
    system: SystemContext;
    cookies: Record<string, string>;
    local: Record<string, unknown>;
    session: Record<string, unknown>;
    record?: Record<string, unknown>;
    records?: Record<string, unknown>[];
    app: Record<string, unknown>;
}

// =============================================================================
// Context Builder
// =============================================================================

export async function buildTemplateContext(
    request: Request,
    pageData: PageData,
    trackingConfig?: TrackingConfig,
    dataContext?: { record?: Record<string, unknown>; records?: Record<string, unknown>[] },
    tenantSlug?: string
): Promise<TemplateContext> {

    // Parse cookies
    const cookies = parseCookies(request.headers.get('Cookie') || '');

    // Get user from session (if authenticated)
    const user = await getUserFromSession(request, tenantSlug);

    // Build base visitor context from headers
    let visitor = buildVisitorContext(request);

    // Apply tracking if enabled
    const config = trackingConfig || getDefaultTrackingConfig();
    visitor = applyVisitorTracking(visitor, request, config, cookies);

    // Flatten URL query params
    const url = buildUrlContext(request);

    // System variables (UTC)
    const system = buildSystemContext();

    // Build page context
    const origin = new URL(request.url).origin;

    return {
        page: {
            id: pageData.id,
            title: pageData.title,
            url: pageData.canonicalUrl || `${origin}/${pageData.slug}`,
            slug: pageData.slug,
            description: pageData.description || '',
            published: pageData.published,
            createdAt: pageData.createdAt,
            updatedAt: pageData.updatedAt,
            image: pageData.ogImage || '',
            type: pageData.ogType || 'website',
            custom: pageData.customVariables || {},
        },
        user,
        visitor,
        url,
        system,
        cookies,
        local: {}, // Populated by page-level state
        session: {}, // Client-only, empty on SSR
        record: dataContext?.record,
        records: dataContext?.records,
        app: pageData.appVariables || {},
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse cookies from Cookie header
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        if (name) {
            try {
                cookies[name] = decodeURIComponent(rest.join('='));
            } catch {
                cookies[name] = rest.join('=');
            }
        }
    });
    return cookies;
}

/**
 * Build visitor context from request headers
 */
function buildVisitorContext(request: Request): VisitorContext {
    const headers = request.headers;
    const userAgent = headers.get('User-Agent') || '';

    // Parse device type from User-Agent
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent) && !/iPad|Tablet/i.test(userAgent);
    const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent);

    // Parse browser
    let browser = 'Unknown';
    if (userAgent.includes('Edg/')) browser = 'Edge';
    else if (userAgent.includes('Chrome/')) browser = 'Chrome';
    else if (userAgent.includes('Firefox/')) browser = 'Firefox';
    else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) browser = 'Safari';

    // Parse OS
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux') && !userAgent.includes('Android')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    // Get Cloudflare-specific headers if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cf = (request as any).cf;

    // Get IP address
    const rawIp = headers.get('CF-Connecting-IP') || headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
    const isLocalhost = !rawIp || rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.startsWith('192.168.') || rawIp.startsWith('10.');

    // Get country and city (with localhost fallback)
    const countryCode = headers.get('CF-IPCountry') || cf?.country || '';
    let country = countryCode;

    // Timezone detection:
    const cookies = parseCookies(headers.get('Cookie') || '');

    // Parse visitor-enhanced JSON cookie (set by client-side script)
    let clientEnhanced: { tz?: string; vp?: string; theme?: string; conn?: string } = {};
    const enhancedCookie = cookies['visitor-enhanced'];
    if (enhancedCookie) {
        try {
            clientEnhanced = JSON.parse(decodeURIComponent(enhancedCookie));
        } catch { /* Invalid JSON, ignore */ }
    }

    // Use client timezone if available, else fallback to Cloudflare or cookie
    let timezone = clientEnhanced.tz || cookies['visitor-tz'] || cf?.timezone || 'UTC';

    // City detection:
    // 1. From Cloudflare Workers cf object
    // 2. Fallback: Parse from timezone string (e.g. "Asia/Kuwait" -> "Kuwait")
    let city = cf?.city || '';
    if (!city && timezone && timezone.includes('/')) {
        city = timezone.split('/').pop()?.replace(/_/g, ' ') || '';
    }

    // Convert country code to full name using built-in Intl API
    if (countryCode && countryCode.length === 2 && countryCode !== 'XX') {
        try {
            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            country = regionNames.of(countryCode) || countryCode;
        } catch (e) {
            console.warn('[SSR] Failed to convert country code:', countryCode);
        }
    }

    // Localhost detection: Provide mock values for local development
    if (isLocalhost && (!countryCode || countryCode === '')) {
        country = 'Local';
        city = 'Development';
        // Note: This gets the SERVER's timezone, not the visitor's
        timezone = clientEnhanced.tz || cookies['visitor-tz'] || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }

    return {
        ip: rawIp,
        country,
        city,
        timezone,
        device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
        browser,
        os,
        language: headers.get('Accept-Language')?.split(',')[0]?.split(';')[0] || 'en',
        referrer: headers.get('Referer') || '',
        isBot: /bot|crawl|spider|slurp|googlebot|bingbot/i.test(userAgent),
        // Client-side enhanced fields
        viewport: clientEnhanced.vp,
        themePreference: clientEnhanced.theme as 'dark' | 'light' | undefined,
        connectionType: clientEnhanced.conn,
    };
}

/**
 * Build URL context from query parameters
 */
function buildUrlContext(request: Request): Record<string, string> {
    const url: Record<string, string> = {};
    try {
        const searchParams = new URL(request.url).searchParams;
        searchParams.forEach((value, key) => {
            url[key] = value;
        });
    } catch {
        // Invalid URL, return empty
    }
    return url;
}

/**
 * Build system context (all UTC)
 */
function buildSystemContext(): SystemContext {
    const now = new Date();
    return {
        date: now.toISOString().split('T')[0],
        time: now.toISOString().split('T')[1],
        datetime: now.toISOString(),
        timestamp: now.getTime(),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        env: engineConfig().nodeEnv,
    };
}

// Re-export types for convenience
export type { UserContext, VisitorContext, TrackingConfig };
