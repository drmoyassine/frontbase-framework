/**
 * Analytics + Error Reporting — Cloud-mode only.
 *
 * Two vendors, one module:
 *  - **Sentry** (`@sentry/react`): error + performance for the SPA.
 *  - **PostHog** (`posthog-js`): product analytics for the SPA (the activation
 *    funnel). Explicit events only — autocapture is OFF to keep volume low and
 *    avoid capturing input PII.
 *
 * Everything is **env-gated and Cloud-only** (see `isCloud()` in `edition.ts`):
 * when unset or self-host, every function here is a no-op, so self-host builds
 * ship with zero third-party telemetry. Call `initAnalytics()` once at startup
 * (from `src/main.tsx`).
 *
 * Identity is tracked automatically: this module subscribes to the auth store
 * and calls identify/reset as the session changes — login, logout, session
 * restore on reload, and impersonation are all covered from one place, so no
 * call-site has to remember to identify. Activation events are emitted from the
 * relevant stores/components via `track()`.
 */

import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { isCloud } from '@/lib/edition';
import { hasAnalyticsConsent } from '@/lib/consent';
import { useAuthStore, type User, type TenantInfo } from '@/stores/auth';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

/**
 * True only when: Cloud edition AND keys present AND consent granted (Sprint 3D).
 * EU users without an explicit "accept" never initialise the SDKs. Because this
 * is evaluated at call time, granting consent later and re-calling
 * `initAnalytics()` will load the SDKs at that point (idempotent guard allows it).
 */
const analyticsEnabled = (): boolean =>
    isCloud() && (!!SENTRY_DSN || !!POSTHOG_KEY) && hasAnalyticsConsent();

let _initialized = false;
let _lastSignature = '';

/**
 * Initialize Sentry + PostHog. Safe to call multiple times (idempotent).
 * No-op outside Cloud mode or when no keys are configured.
 */
export function initAnalytics(): void {
    if (_initialized || !analyticsEnabled()) return;
    _initialized = true;

    if (SENTRY_DSN) {
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: isCloud() ? 'cloud' : 'self-host',
            // Low sample rate — perf traces are noisy and we mainly want errors.
            tracesSampleRate: 0.1,
            // No session replay for launch (cost + privacy). Add later if needed.
            integrations: [Sentry.browserTracingIntegration()],
            // Don't send errors from extensions or cross-origin scripts we don't own.
            denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
        });
    }

    if (POSTHOG_KEY) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            // Explicit-event funnel only. Autocapture would grab input PII and
            // blow through the event quota; we emit named events ourselves.
            autocapture: false,
            disable_session_recording: true,
            capture_pageview: false, // SPA — we control routing; no double-counts.
            persistence: 'localStorage+cookie',
            // GDPR (Sprint 3D): mask visitor IP at capture time so PostHog never
            // stores a full IP (last octet zeroed). Combined with consent gating,
            // EU users who opt in still get IP-anonymized analytics.
            mask_ip: true,
            loaded: () => {
                // Re-identify in case the auth store resolved before posthog was ready.
                syncIdentity();
            },
        });
    }

    // One subscription covers login / logout / reload-restore / impersonation.
    useAuthStore.subscribe(syncIdentity);
    syncIdentity();
}

/** Build a stable signature so we only (re)identify when identity actually changes. */
function identitySignature(user: User | null, tenant: TenantInfo | null, impersonating: boolean): string {
    if (!user) return '';
    return [user.id, user.role || '', user.is_master ? '1' : '0', impersonating ? '1' : '0', tenant?.plan || ''].join('|');
}

/**
 * Push current auth identity to Sentry + PostHog. Called automatically on auth
 * transitions; also safe to call directly.
 */
export function syncIdentity(): void {
    if (!_initialized) return;

    const { user, tenant, isImpersonating } = useAuthStore.getState();
    const signature = identitySignature(user, tenant, isImpersonating);
    if (signature === _lastSignature) return;
    _lastSignature = signature;

    if (!user) {
        if (POSTHOG_KEY) posthog.reset();
        if (SENTRY_DSN) Sentry.setUser(null);
        return;
    }

    const personId = user.tenant_id || user.id;
    const personProps = {
        email: user.email,
        user_id: user.id,
        tenant_id: user.tenant_id || null,
        tenant_slug: user.tenant_slug || null,
        role: user.role || null,
        is_master: !!user.is_master,
        is_impersonating: isImpersonating,
        plan: tenant?.plan || null,
    };

    if (POSTHOG_KEY) posthog.identify(personId, personProps);
    if (SENTRY_DSN) {
        Sentry.setUser({ id: personId, email: user.email });
        Sentry.setTag('tenant_id', user.tenant_id || 'unknown');
        Sentry.setTag('role', user.role || 'unknown');
    }
}

/**
 * Emit a product-analytics event. No-op when analytics is disabled, so call-sites
 * can fire unconditionally without checking the edition.
 */
export function track(event: string, properties: Record<string, unknown> = {}): void {
    // Re-check consent: a user who revokes after the SDK loaded must stop being tracked.
    if (!_initialized || !POSTHOG_KEY || !hasAnalyticsConsent()) return;
    posthog.capture(event, properties);
}

/**
 * Report an error to Sentry programmatically (most SPA errors are auto-captured
 * by the React SDK; this is for caught-but-noteworthy failures). No-op when off.
 * Consent-gated for EU users (Sprint 3D).
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
    if (!_initialized || !SENTRY_DSN || !hasAnalyticsConsent()) return;
    if (context) Sentry.captureException(error, { extra: context });
    else Sentry.captureException(error);
}
