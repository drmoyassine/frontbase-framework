/**
 * GDPR consent (Sprint 3D).
 *
 * EU users must explicitly opt in to analytics/error-reporting before the SPA
 * initialises PostHog + Sentry (see `src/lib/analytics.ts`). Non-EU users are
 * treated as implied-consent (no banner) — coarse, but the timezone heuristic is
 * documented in the sprint spec; a GeoIP upgrade can replace it later.
 *
 * Decision persists in localStorage under `frontbase_consent`. Bumping
 * CONSENT_VERSION re-prompts everyone (use when the policy materially changes).
 */

export type ConsentCategory = 'analytics' | 'marketing';

export interface ConsentRecord {
    analytics: boolean;
    marketing: boolean;
    date: string; // ISO timestamp of the decision
    version: number;
}

const STORAGE_KEY = 'frontbase_consent';
const CONSENT_VERSION = 1;

// EEA-ish timezone prefixes (Europe + Atlantic for Iceland/Azores). Coarse by
// design — see risks in sprint3.md §3D.
const EEA_TZ_PREFIXES = ['Europe/', 'Atlantic/'];

/** True if the browser reports an EU/EEA timezone (→ banner + consent gate). */
export function isEuTimezone(): boolean {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        return EEA_TZ_PREFIXES.some((p) => tz.startsWith(p));
    } catch {
        return false;
    }
}

/** The stored consent decision, or null if none (or stale version). */
export function getConsent(): ConsentRecord | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== CONSENT_VERSION) return null; // re-prompt
        return {
            analytics: !!parsed.analytics,
            marketing: !!parsed.marketing,
            date: String(parsed.date || ''),
            version: CONSENT_VERSION,
        };
    } catch {
        return null;
    }
}

/**
 * Whether analytics may run RIGHT NOW. Non-EU with no banner shown → implied
 * consent (true). EU users → only true once they've explicitly accepted.
 */
export function hasAnalyticsConsent(): boolean {
    const stored = getConsent();
    if (!stored) return !isEuTimezone(); // non-EU → implied; EU + undecided → false
    return stored.analytics;
}

/** Persist a consent decision. */
export function setConsent(record: Partial<ConsentRecord>): ConsentRecord {
    const next: ConsentRecord = {
        analytics: !!record.analytics,
        marketing: !!record.marketing,
        date: new Date().toISOString(),
        version: CONSENT_VERSION,
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        /* private mode / quota — consent can't persist; banner may re-show */
    }
    return next;
}

/** Flip a single category (used by the consent-settings dialog after dismissal). */
export function grantConsent(category: ConsentCategory, value: boolean): ConsentRecord {
    const current = getConsent();
    return setConsent({ ...current, [category]: value });
}

/** True when the banner should be shown: EU timezone AND no decision yet. */
export function needsConsentBanner(): boolean {
    return isEuTimezone() && getConsent() === null;
}

/** Accept / reject all at once (the banner's two buttons). */
export function acceptAll(): ConsentRecord {
    return setConsent({ analytics: true, marketing: true });
}

export function rejectAll(): ConsentRecord {
    return setConsent({ analytics: false, marketing: false });
}
