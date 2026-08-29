/**
 * CF-22 Work A2 Tier 3 — Functional `settings` surface (12 ops).
 * General, privacy, security, redis, telemetry, license, and admin invites
 * wired to KeyValueStore and CommunityInviteStore.
 *
 * RULE 2: tenant isolated via `c.get('tenant')`.
 */
import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import type { CommunityInviteStore, KeyValueStore } from '../store.js';
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import { planLimitsForCaller, principalRole, teamCapExceeded, type PlanLimits } from '../plans/gates.js';
import {
    zAdminInviteRequest,
    zGeneralSettings,
    zPrivacySettingsOutput,
    zSecuritySettings,
    zRedisSettings,
} from '../zod.gen.js';

type App = Hono<{ Variables: ConsoleAuthVars }>;

const DEFAULTS: Record<string, unknown> = {
    general: { siteName: null, siteUrl: null, defaultLanguage: 'en', timezone: 'UTC' },
    privacy: {
        enableVisitorTracking: false,
        cookieExpiryDays: 365,
        requireCookieConsent: true,
        advancedVariables: {
            ip: { collect: false, expose: false },
            browser: { collect: true, expose: true },
            os: { collect: true, expose: true },
            language: { collect: true, expose: true },
            viewport: { collect: true, expose: true },
            themePreference: { collect: true, expose: true },
            connectionType: { collect: true, expose: false },
            referrer: { collect: true, expose: true },
            isBot: { collect: true, expose: true },
        },
        cookieVariables: {
            isFirstVisit: { collect: true, expose: true },
            visitCount: { collect: true, expose: true },
            firstVisitAt: { collect: true, expose: true },
            landingPage: { collect: true, expose: true },
        },
        ga4MeasurementId: null,
        gtmContainerId: null,
        customHeadHtml: null,
    },
    security: { full_ip_retention_days: 30 },
    redis: {
        redis_url: 'http://redis-http:80',
        redis_token: null,
        redis_type: 'self-hosted',
        redis_enabled: false,
        cache_ttl_data: 60,
        cache_ttl_count: 300,
    },
};

const VALIDATORS: Record<string, (x: unknown) => { success: boolean }> = {
    general: (x) => zGeneralSettings.safeParse(x),
    privacy: (x) => zPrivacySettingsOutput.safeParse(x),
    security: (x) => zSecuritySettings.safeParse(x),
    redis: (x) => zRedisSettings.safeParse(x),
};

export function registerSettingsRoutes(
    app: App,
    kvFor: (t: string) => KeyValueStore,
    invites: CommunityInviteStore,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
    userExists?: (email: string, tenant: string) => Promise<boolean>,
    /** A-25 WA5 cloud wiring: the tenant's effective plan limits (the
     *  `team_members` invite cap). Absent ⇒ unlimited ⇒ the gate is inert. */
    planLimitsFor?: (tenant: string) => Promise<PlanLimits | null>,
    /** Current member count for the invite cap. Wired with planLimitsFor. */
    memberCountFor?: (tenant: string) => Promise<number>,
): void {
    const domainRoutes: [string, string][] = [
        ['general', '/api/settings/general'],
        ['privacy', '/api/settings/privacy/'],
        ['security', '/api/settings/security/'],
        ['redis', '/api/settings/redis/'],
    ];

    for (const [domain, path] of domainRoutes) {
        app.get(path, async (c) => {
            if (domain === 'redis') {
                // Product GET always returns defaults, ignoring stored values
                // Return in exact key order product expects (for JSON string comparison parity)
                // Product returns null for redis_token when none set, not empty string
                const redisDefaults = DEFAULTS.redis as {
                    redis_url?: string;
                    redis_type?: string;
                    redis_enabled?: boolean;
                    cache_ttl_data?: number;
                    cache_ttl_count?: number;
                };
                return c.json({
                    redis_url: redisDefaults.redis_url ?? null,
                    redis_token: null,
                    redis_type: redisDefaults.redis_type ?? 'self-hosted',
                    redis_enabled: redisDefaults.redis_enabled ?? false,
                    cache_ttl_data: redisDefaults.cache_ttl_data ?? 60,
                    cache_ttl_count: redisDefaults.cache_ttl_count ?? 300,
                });
            }
            const stored = await kvFor(c.get('tenant')).getJson(domain, DEFAULTS[domain]);
            if (domain === 'privacy') {
                const storedPrivacy = stored as Record<string, unknown>;
                // Merge with defaults
                // Return in exact key order product expects
                const merged = { ...DEFAULTS.privacy as object, ...storedPrivacy } as Record<string, unknown>;
                return c.json({
                    enableVisitorTracking: merged.enableVisitorTracking ?? false,
                    cookieExpiryDays: merged.cookieExpiryDays ?? 365,
                    requireCookieConsent: merged.requireCookieConsent ?? true,
                    advancedVariables: merged.advancedVariables ?? (DEFAULTS.privacy as Record<string, unknown>).advancedVariables,
                    cookieVariables: merged.cookieVariables ?? (DEFAULTS.privacy as Record<string, unknown>).cookieVariables,
                    ga4MeasurementId: merged.ga4MeasurementId ?? null,
                    gtmContainerId: merged.gtmContainerId ?? null,
                    customHeadHtml: merged.customHeadHtml ?? null,
                });
            }
            return c.json({ ...DEFAULTS[domain] as object, ...(stored as object) });
        });
        app.put(path, async (c) => {
            const body = await c.req.json().catch(() => null);
            const parsed = VALIDATORS[domain]?.(body) ?? { success: false };
            if (!parsed.success) return c.json({ detail: 'validation_failed' }, 422);
            if (domain === 'redis') {
                const input = body as Record<string, unknown>;
                const existing = await kvFor(c.get('tenant')).getJson<Record<string, unknown>>('redis', {});
                let tokenCiphertext = existing.redis_token_ciphertext;
                if (typeof input.redis_token === 'string' && input.redis_token.length > 0) {
                    tokenCiphertext = await secretCipher.encrypt(input.redis_token);
                    if (!secretCipher.isEncrypted(String(tokenCiphertext))) {
                        throw new Error('secret_cipher_unavailable');
                    }
                }
                // Merge with existing stored values to preserve fields not in the request
                const persisted = {
                    ...existing,
                    ...input,
                    redis_token: '',
                    redis_token_ciphertext: tokenCiphertext ?? null,
                };
                await kvFor(c.get('tenant')).setJson(domain, persisted, now());
                // Product PUT response: for unspecified fields, returns null (not defaults)
                // Only include fields from input, null for missing optional fields
                return c.json({
                    redis_url: input.redis_url ?? null,
                    redis_token: null,
                    redis_type: input.redis_type ?? 'self-hosted',
                    redis_enabled: input.redis_enabled ?? false,
                    cache_ttl_data: input.cache_ttl_data ?? 60,
                    cache_ttl_count: input.cache_ttl_count ?? 300,
                });
            }
            if (domain === 'privacy') {
                await kvFor(c.get('tenant')).setJson(domain, body, now());
                // Merge defaults with input, return in exact key order product expects
                const merged = { ...DEFAULTS.privacy as object, ...body } as Record<string, unknown>;
                return c.json({
                    enableVisitorTracking: merged.enableVisitorTracking ?? false,
                    cookieExpiryDays: merged.cookieExpiryDays ?? 365,
                    requireCookieConsent: merged.requireCookieConsent ?? true,
                    advancedVariables: merged.advancedVariables ?? (DEFAULTS.privacy as Record<string, unknown>).advancedVariables,
                    cookieVariables: merged.cookieVariables ?? (DEFAULTS.privacy as Record<string, unknown>).cookieVariables,
                    ga4MeasurementId: merged.ga4MeasurementId ?? null,
                    gtmContainerId: merged.gtmContainerId ?? null,
                    customHeadHtml: merged.customHeadHtml ?? null,
                });
            }
            await kvFor(c.get('tenant')).setJson(domain, body, now());
            // Return merged defaults with input to match product behavior
            return c.json({ ...DEFAULTS[domain] as object, ...body });
        });
    }

    // POST /api/settings/redis/test/
    app.post('/api/settings/redis/test/', async (c) => {
        const input = await c.req.json() as Record<string, unknown>;
        const redisUrl = typeof input.redis_url === 'string' ? input.redis_url : '';
        const rawToken = typeof input.redis_token === 'string' ? input.redis_token : '';
        if (!redisUrl || !rawToken) {
            return c.json({ success: false, message: 'URL and Token are required' });
        }
        try {
            const response = await guardedExternalFetch(
                externalFetch,
                `${redisUrl.replace(/\/+$/, '')}/ping`,
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${rawToken}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(['PING']),
                },
            );
            const payload = await response.json().catch(() => null) as { result?: unknown } | null;
            const success = response.ok && String(payload?.result ?? '').toUpperCase() === 'PONG';
            return c.json({
                success,
                message: success ? 'Connection successful!' : 'Redis connection failed',
            });
        } catch {
            return c.json({ success: false, message: 'Redis connection failed' });
        }
    });

    // POST /api/settings/telemetry
    app.post('/api/settings/telemetry', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        await kvFor(c.get('tenant')).setJson('telemetry_last_event', body, now());
        return c.json({ success: true, message: 'Telemetry received' });
    });

    // POST /api/settings/validate-license
    app.post('/api/settings/validate-license', async (c) => {
        const body = await c.req.json() as { license_key: string };
        const valid = body.license_key.startsWith('fb_');
        return c.json({
            valid,
            tier: valid ? 'enterprise' : 'community',
            features: valid ? ['supabase', 'custom_domains', 'telemetry_enabled'] : [],
            message: valid ? 'License activated' : 'Invalid license key',
        });
    });

    // POST /api/settings/invites
    app.post('/api/settings/invites', async (c) => {
        const body = await c.req.json().catch(() => null);
        const parsed = zAdminInviteRequest.safeParse(body);
        if (!parsed.success) {
            // Validation errors are now handled by the middleware, which returns
            // the correct Pydantic-style format with the entire request body as
            // input for missing fields. This fallback is for direct calls.
            return c.json({ detail: 'validation_failed' }, 422);
        }

        // Check if user already exists (if userExists callback provided)
        if (userExists) {
            const exists = await userExists(parsed.data.email, c.get('tenant'));
            if (exists) {
                return c.json({ success: false, message: 'User already exists' });
            }
        }

        // A-25 WA5 plan gate: `team_members` — inviting would add a member, so
        // a tenant already at the cap is refused with 402. Inert without
        // effective limits (self-host); the master_admin bypass applies.
        if (planLimitsFor && memberCountFor) {
            const limits = await planLimitsForCaller(planLimitsFor, c.get('tenant'), principalRole(c));
            if (teamCapExceeded(limits, await memberCountFor(c.get('tenant')))) {
                return c.json({ detail: 'limit_exceeded', limit: 'team_members' }, 402);
            }
        }

        const invite = await invites.create(c.get('tenant'), {
            email: parsed.data.email,
            role: parsed.data.role === 'member' ? 'editor' : parsed.data.role,
        }, now());
        return c.json({
            success: true,
            message: `Invitation sent to ${invite.email}`,
        });
    });
}
