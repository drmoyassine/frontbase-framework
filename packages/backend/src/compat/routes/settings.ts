/**
 * CF-22 P2 Wave 1 — the `settings` tag (12 ops). Each domain (general/privacy/
 * security/redis) is one JSON blob in the existing `settings` table (KeyValueStore);
 * GET returns stored-or-default, PUT validates against the vendored Zod and stores.
 * Action endpoints (redis/test, telemetry, validate-license, invites) return the
 * product's ack shapes — community edition has no Redis/license/email, so they
 * report not-configured / accepted gracefully (conformant, not invented).
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { KeyValueStore } from '../store.js';
import { zGeneralSettings, zPrivacySettingsOutput, zSecuritySettings, zRedisSettings } from '../zod.gen.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const DEFAULTS: Record<string, unknown> = {
    general: { siteName: 'Frontbase', siteUrl: '', defaultLanguage: 'en', timezone: 'UTC' },
    privacy: { enableVisitorTracking: false, requireCookieConsent: false, ga4MeasurementId: '', gtmContainerId: '', cookieExpiryDays: 365, advancedVariables: {}, cookieVariables: {}, customHeadHtml: '' },
    security: { full_ip_retention_days: 30 },
    redis: { redis_url: '', redis_token: '', redis_type: 'upstash', redis_enabled: false, cache_ttl_data: 300, cache_ttl_count: 300 },
};
const VALIDATORS: Record<string, (x: unknown) => { success: boolean }> = {
    general: (x) => zGeneralSettings.safeParse(x),
    privacy: (x) => zPrivacySettingsOutput.safeParse(x),
    security: (x) => zSecuritySettings.safeParse(x),
    redis: (x) => zRedisSettings.safeParse(x),
};

export function registerSettingsRoutes(app: App, kvFor: (t: string) => KeyValueStore, now: () => string): void {
    const domainRoutes: [string, string][] = [
        ['general', '/api/settings/general'],
        ['privacy', '/api/settings/privacy/'],
        ['security', '/api/settings/security/'],
        ['redis', '/api/settings/redis/'],
    ];
    for (const [domain, path] of domainRoutes) {
        app.get(path, async (c) => {
            const stored = await kvFor(c.get('tenant')).getJson(domain, DEFAULTS[domain]);
            return c.json({ ...DEFAULTS[domain] as object, ...(stored as object) });
        });
        app.put(path, async (c) => {
            const body = await c.req.json().catch(() => null);
            const parsed = VALIDATORS[domain]?.(body) ?? { success: false };
            if (!parsed.success) return c.json({ detail: 'validation_failed' }, 422);
            await kvFor(c.get('tenant')).setJson(domain, body, now());
            return c.json(body);
        });
    }

    // POST /api/settings/redis/test/ — no Redis in the framework worker.
    app.post('/api/settings/redis/test/', (c) => c.json({ success: false, message: 'Redis is not configured on this deployment' }));
    // POST /api/settings/telemetry — accept (community telemetry is opt-in/no-op).
    app.post('/api/settings/telemetry', (c) => c.json({ success: true, message: 'Telemetry received' }));
    // POST /api/settings/validate-license — community needs no license.
    app.post('/api/settings/validate-license', (c) => c.json({ valid: false, tier: 'community', features: [], message: 'No license required for the community edition' }));
    // POST /api/settings/invites — community is single-tenant; invites unsupported.
    app.post('/api/settings/invites', (c) => c.json({ success: false, message: 'Invites are not available in the community edition' }));
}
