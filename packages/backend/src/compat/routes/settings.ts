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
import {
    zAdminInviteRequest,
    zGeneralSettings,
    zPrivacySettingsOutput,
    zSecuritySettings,
    zRedisSettings,
} from '../zod.gen.js';

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

export function registerSettingsRoutes(
    app: App,
    kvFor: (t: string) => KeyValueStore,
    invites: CommunityInviteStore,
    secretCipher: SecretCipher,
    externalFetch: CompatFetch,
    now: () => string,
): void {
    const domainRoutes: [string, string][] = [
        ['general', '/api/settings/general'],
        ['privacy', '/api/settings/privacy/'],
        ['security', '/api/settings/security/'],
        ['redis', '/api/settings/redis/'],
    ];

    for (const [domain, path] of domainRoutes) {
        app.get(path, async (c) => {
            const stored = await kvFor(c.get('tenant')).getJson(domain, DEFAULTS[domain]);
            if (domain === 'redis') {
                const { redis_token_ciphertext: _ciphertext, ...safe } = stored as Record<string, unknown>;
                return c.json({ ...DEFAULTS.redis as object, ...safe, redis_token: '' });
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
                const persisted = {
                    ...input,
                    redis_token: '',
                    redis_token_ciphertext: tokenCiphertext ?? null,
                };
                await kvFor(c.get('tenant')).setJson(domain, persisted, now());
                const { redis_token_ciphertext: _ciphertext, ...safe } = persisted;
                return c.json(safe);
            }
            await kvFor(c.get('tenant')).setJson(domain, body, now());
            return c.json(body);
        });
    }

    // POST /api/settings/redis/test/
    app.post('/api/settings/redis/test/', async (c) => {
        const redisSettings = await kvFor(c.get('tenant')).getJson<Record<string, unknown>>('redis', {});
        const redisUrl = typeof redisSettings.redis_url === 'string' ? redisSettings.redis_url : '';
        const ciphertext = typeof redisSettings.redis_token_ciphertext === 'string'
            ? redisSettings.redis_token_ciphertext
            : '';
        if (!redisSettings.redis_enabled || !redisUrl || !ciphertext) {
            return c.json({ success: false, message: 'Redis is not configured' });
        }
        if (!secretCipher.isEncrypted(ciphertext)) throw new Error('secret_not_encrypted');
        const token = await secretCipher.decrypt(ciphertext);
        try {
            const response = await guardedExternalFetch(
                externalFetch,
                `${redisUrl.replace(/\/+$/, '')}/ping`,
                { headers: { authorization: `Bearer ${token}` } },
            );
            const payload = await response.json().catch(() => null) as { result?: unknown } | null;
            const success = response.ok && String(payload?.result ?? '').toUpperCase() === 'PONG';
            return c.json({
                success,
                message: success ? 'Redis connection test successful' : 'Redis connection failed',
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
        await kvFor(c.get('tenant')).getJson('general', DEFAULTS['general']);
        return c.json({
            valid: true,
            tier: 'community',
            features: ['all_features_enabled'],
            message: 'Community license valid',
        });
    });

    // POST /api/settings/invites
    app.post('/api/settings/invites', async (c) => {
        const parsed = zAdminInviteRequest.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json({ detail: 'validation_failed' }, 422);
        const invite = await invites.create(c.get('tenant'), {
            email: parsed.data.email,
            role: parsed.data.role === 'member' ? 'editor' : parsed.data.role,
        }, now());
        const inviteUrl = `/accept-invite?token=${encodeURIComponent(invite.token)}`;
        return c.json({
            success: true,
            message: `Invitation created for ${invite.email}: ${inviteUrl}`,
            token: invite.token,
            invite_url: inviteUrl,
        });
    });
}
