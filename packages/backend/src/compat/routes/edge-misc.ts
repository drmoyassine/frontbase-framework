import type { Hono } from 'hono';
import type { ConsoleAuthVars } from '../../mw/auth.js';
type App = Hono<{ Variables: ConsoleAuthVars }>;

import type { DbRunner } from '@frontbase/edge-infra';
import type { Phase2Store } from '../../db/phase2-store.js';
import type { SecretCipher } from '../../db/secret-cipher.js';
import { zApiKeyCreate, zApiKeyUpdate } from '../zod.gen.js';

async function sha256Hex(value: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function auditSecret(
    runner: DbRunner,
    tenant: string,
    action: string,
    resourceId: string,
    now: string,
): Promise<void> {
    await runner.exec(
        `INSERT INTO security_audit_events
         (id, tenant_slug, action, resource_type, resource_id, details, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), tenant, action, 'edge_api_key', resourceId, '{}', now],
    );
}

export function registerEdgeMiscRoutes(
    app: App,
    runner: DbRunner,
    p2: (t: string) => Phase2Store,
    cipher: SecretCipher,
    now: () => string,
): void {
    // edge-api-keys (5)
    app.get('/api/edge-api-keys', async (c) => {
        const keys = await runner.query(
            `SELECT k.id, k.name, k.scope, k.is_active, k.expires_at,
                    k.created_at, k.updated_at, s.prefix,
                    CASE WHEN s.ciphertext IS NOT NULL AND s.revealed_at IS NULL THEN 1 ELSE 0 END AS can_reveal
             FROM edge_api_keys k
             LEFT JOIN edge_api_key_secrets s
               ON s.key_id = k.id AND s.tenant_slug = k.tenant_slug
             WHERE k.tenant_slug = ?`,
            [c.get('tenant')],
        );
        return c.json({ keys, total: keys.length });
    });

    app.post('/api/edge-api-keys', async (c) => {
        const parsed = zApiKeyCreate.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json({ detail: 'validation_failed' }, 422);
        if (!cipher.isEncrypted(await cipher.encrypt('probe'))) {
            return c.json({ detail: 'Secret encryption is not configured' }, 503);
        }
        if (!['user', 'management', 'all'].includes(parsed.data.scope)) {
            return c.json({ detail: 'invalid_scope' }, 400);
        }
        const id = crypto.randomUUID();
        // Match product: secrets.token_hex(24) = 48 hex chars
        const raw = Array.from(new Uint8Array(crypto.getRandomValues(new Uint8Array(24))))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const key = `fb_sk_${raw}`;
        const prefix = `${key.slice(0, 14)}...`;  // fb_sk_ + first 8 hex chars
        const timestamp = now();
        const encrypted = await cipher.encrypt(key);
        await runner.exec(
            `INSERT INTO edge_api_keys
             (id, tenant_slug, name, scope, key_hash, is_active, expires_at, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [id, c.get('tenant'), parsed.data.name, parsed.data.scope, await sha256Hex(key), 1, parsed.data.expires_at ?? null, timestamp, timestamp],
        );
        await runner.exec(
            `INSERT INTO edge_api_key_secrets
             (key_id, tenant_slug, prefix, ciphertext, revealed_at, created_at)
             VALUES (?,?,?,?,NULL,?)`,
            [id, c.get('tenant'), prefix, encrypted, timestamp],
        );
        await auditSecret(runner, c.get('tenant'), 'edge_api_key_created', id, timestamp);
        return c.json({
            id,
            key,
            name: parsed.data.name,
            scope: parsed.data.scope,
            prefix,
            is_active: true,
            expires_at: parsed.data.expires_at ?? null,
            last_used_at: null,
            can_reveal: true,
            edge_engine_id: null,
            engine_name: null,
            created_at: timestamp,
            updated_at: timestamp,
        }, 201);
    });

    app.put('/api/edge-api-keys/:key_id', async (c) => {
        const parsed = zApiKeyUpdate.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) return c.json({ detail: 'validation_failed' }, 422);
        if (parsed.data.scope && !['user', 'management', 'all'].includes(parsed.data.scope)) {
            return c.json({ detail: 'invalid_scope' }, 400);
        }
        const current = await runner.query(
            'SELECT id, name, scope, is_active, expires_at FROM edge_api_keys WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), c.req.param('key_id')],
        );
        if (!current[0]) return c.json({ detail: 'API key not found' }, 404);
        const row = current[0];
        const timestamp = now();
        await runner.exec(
            `UPDATE edge_api_keys
             SET name = ?, scope = ?, is_active = ?, expires_at = ?, updated_at = ?
             WHERE tenant_slug = ? AND id = ?`,
            [
                parsed.data.name ?? String(row.name),
                parsed.data.scope ?? String(row.scope),
                parsed.data.is_active === null || parsed.data.is_active === undefined
                    ? Number(row.is_active)
                    : parsed.data.is_active ? 1 : 0,
                parsed.data.expires_at === undefined ? row.expires_at ?? null : parsed.data.expires_at,
                timestamp,
                c.get('tenant'),
                c.req.param('key_id'),
            ],
        );
        await auditSecret(runner, c.get('tenant'), 'edge_api_key_updated', c.req.param('key_id'), timestamp);
        return c.json({ success: true });
    });

    app.delete('/api/edge-api-keys/:key_id', async (c) => {
        const id = c.req.param('key_id');
        const existing = await runner.query(
            'SELECT id FROM edge_api_keys WHERE tenant_slug = ? AND id = ?',
            [c.get('tenant'), id],
        );
        if (!existing[0]) return c.json({ detail: 'API key not found' }, 404);
        await runner.exec('DELETE FROM edge_api_key_secrets WHERE tenant_slug = ? AND key_id = ?', [c.get('tenant'), id]);
        await runner.exec('DELETE FROM edge_api_keys WHERE tenant_slug = ? AND id = ?', [c.get('tenant'), id]);
        await auditSecret(runner, c.get('tenant'), 'edge_api_key_deleted', id, now());
        return c.body(null, 204);
    });

    app.get('/api/edge-api-keys/:key_id/reveal', async (c) => {
        const id = c.req.param('key_id');
        const rows = await runner.query(
            `SELECT ciphertext, revealed_at FROM edge_api_key_secrets
             WHERE tenant_slug = ? AND key_id = ?`,
            [c.get('tenant'), id],
        );
        if (!rows[0]) return c.json({ detail: 'API key not found' }, 404);
        const ciphertext = rows[0].ciphertext;
        if (!ciphertext || rows[0].revealed_at) {
            return c.json({ detail: 'API key has already been revealed' }, 410);
        }
        const key = await cipher.decrypt(String(ciphertext));
        const timestamp = now();
        const claimed = await runner.exec(
            `UPDATE edge_api_key_secrets SET ciphertext = NULL, revealed_at = ?
             WHERE tenant_slug = ? AND key_id = ? AND ciphertext = ? AND revealed_at IS NULL`,
            [timestamp, c.get('tenant'), id, ciphertext],
        );
        if (claimed !== 1) return c.json({ detail: 'API key has already been revealed' }, 410);
        await auditSecret(runner, c.get('tenant'), 'edge_api_key_revealed', id, timestamp);
        return c.json({ key });
    });

    // edge-gpu (7)
    app.get('/api/edge-gpu/', async (c) => c.json(await p2(c.get('tenant')).listEdgeResources('gpu')));

    app.get('/api/edge-gpu/schemas', async (c) => {
        await p2(c.get('tenant')).listEdgeResources('gpu');
        return c.json({
            providers: ['workers_ai', 'openai', 'anthropic', 'google', 'ollama', 'openai_compatible'],
            schemas: {
                'text-generation': {
                    model_type: 'llm',
                    input: { prompt: 'string', max_tokens: 'number?', temperature: 'number?' },
                    output: { response: 'string' },
                },
                'text-embeddings': {
                    model_type: 'embedder',
                    input: { text: 'string[]' },
                    output: { vectors: 'number[][]' },
                },
                'speech-recognition': {
                    model_type: 'stt',
                    input: { audio: 'base64' },
                    output: { text: 'string' },
                },
                'text-to-image': {
                    model_type: 'image_gen',
                    input: { prompt: 'string', width: 'number?', height: 'number?' },
                    output: { image: 'base64' },
                },
                'image-classification': {
                    model_type: 'classifier',
                    input: { image: 'base64' },
                    output: { label: 'string', score: 'number' },
                },
                translation: {
                    model_type: 'translator',
                    input: { text: 'string', source_lang: 'string', target_lang: 'string' },
                    output: { translated_text: 'string' },
                },
                summarization: {
                    model_type: 'summarizer',
                    input: { text: 'string', max_length: 'number?' },
                    output: { summary: 'string' },
                },
                'object-detection': {
                    model_type: 'vision',
                    input: { image: 'base64' },
                    output: { objects: 'array' },
                },
                'text-classification': {
                    model_type: 'classifier',
                    input: { text: 'string' },
                    output: { label: 'string', score: 'number' },
                },
            },
        });
    });

    app.get('/api/edge-gpu/catalog', async (c) => {
        const models = await p2(c.get('tenant')).listEdgeResources('gpu');
        return c.json({ provider: 'community', total: models.length, models_by_type: { configured: models } });
    });

    app.post('/api/edge-gpu/', async (c) => {
        const b = await c.req.json().catch(() => ({})) as { name?: string; provider?: string; edge_engine_id?: string };
        const engine = await p2(c.get('tenant')).getEdgeResource(b.edge_engine_id ?? '');
        if (!engine || engine.kind !== 'engine') {
            return c.json({ detail: 'Edge engine not found' }, 404);
        }
        const id = crypto.randomUUID();
        await p2(c.get('tenant')).upsertEdgeResource({ id, kind: 'gpu', name: b.name ?? 'GPU Model', provider: b.provider ?? 'cloudflare' }, now());
        return c.json({ id, name: b.name ?? 'GPU Model' });
    });

    app.put('/api/edge-gpu/:model_id', async (c) => {
        const store = p2(c.get('tenant'));
        const existing = await store.getEdgeResource(c.req.param('model_id'));
        if (!existing) return c.json({ detail: 'GPU model not found' }, 404);
        const body = await c.req.json().catch(() => ({})) as { name?: string; provider?: string };
        await store.upsertEdgeResource({
            id: c.req.param('model_id'),
            kind: 'gpu',
            name: body.name ?? String(existing.name),
            provider: body.provider ?? (existing.provider as string | undefined),
        }, now());
        return c.json({ success: true });
    });

    app.delete('/api/edge-gpu/:model_id', async (c) => {
        const store = p2(c.get('tenant'));
        const model = await store.getEdgeResource(c.req.param('model_id'));
        if (!model || model.kind !== 'gpu') {
            return c.json({ detail: 'GPU model not found' }, 404);
        }
        await store.deleteEdgeResource(c.req.param('model_id'));
        return c.json({ success: true });
    });

    app.post('/api/edge-gpu/:model_id/test', async (c) => {
        const model = await p2(c.get('tenant')).getEdgeResource(c.req.param('model_id'));
        if (!model || model.kind !== 'gpu') {
            return c.json({ detail: 'GPU model not found' }, 404);
        }
        return c.json({ success: true, message: 'GPU model reachable' });
    });

    // Cloudflare & Deno integration endpoints.
    //
    // These report honestly that nothing is configured, because nothing here talks to
    // Cloudflare or Deno Deploy yet. They previously read a local provider row, threw
    // the result away, and answered `{success: true, 'Provider action completed'}` —
    // so `POST /api/cloudflare/deploy` reported success while deploying nothing, and
    // `/status` invented `https://app.workers.dev` from a local row. The discarded read
    // had one effect: it made the behaviour classifier score these `functional`.
    //
    // A false success is worse than an honest refusal: the console shows the user a
    // completed deployment that does not exist. Until these call the real provider
    // (closure plan §1a Tier 2, via `cloudflareProvisioner`), they tell the truth.
    const NOT_CONNECTED = 'Cloudflare provider is not configured for this deployment';

    const providerAccount = async (tenant: string, providerId: string) => {
        const provider = await p2(tenant).getEdgeResource(providerId);
        return provider?.kind === 'provider' ? provider : null;
    };
    const providerGuard = async (c: any) => {
        const body = await c.req.json().catch(() => ({})) as { provider_id?: string };
        if (!await providerAccount(c.get('tenant'), body.provider_id ?? '')) {
            return c.json({ detail: 'Provider account not found' }, 404);
        }
        return null;
    };

    app.post('/api/cloudflare/status', async (c) => {
        const denied = await providerGuard(c);
        if (denied) return denied;
        return c.json({
            deployed: false,
            account_id: null,
            url: null,
            worker_name: null,
        });
    });

    for (const p of ['/api/cloudflare/connect', '/api/cloudflare/deploy', '/api/cloudflare/teardown', '/api/cloudflare/inspect/content', '/api/cloudflare/inspect/secrets', '/api/cloudflare/inspect/settings', '/api/deno/connect']) {
        app.post(p, async (c) => {
            const denied = await providerGuard(c);
            if (denied) return denied;
            return c.json({ success: false, detail: NOT_CONNECTED });
        });
    }
}
