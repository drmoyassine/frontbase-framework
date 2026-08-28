/**
 * edgeConstants registry tests —
 * Validates the shared provider registry that all edge components consume.
 *
 * Covers:
 * - PROVIDER_CONFIGS completeness + structure
 * - PROVIDER_ICONS completeness
 * - KNOWN_EDGE_PROVIDERS consistency
 * - PROVIDER_RESOURCE_LABELS completeness
 * - GPU_TYPE_COLORS / GPU_TYPE_LABELS alignment
 * - CatalogModel type shape
 * - fetchGPUCatalog / deployGPUModel API helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    API_BASE,
    PROVIDER_ICONS,
    PROVIDER_CONFIGS,
    KNOWN_EDGE_PROVIDERS,
    PROVIDER_RESOURCE_LABELS,
    GPU_TYPE_COLORS,
    GPU_TYPE_LABELS,
    fetchGPUCatalog,
    deployGPUModel,
} from '@/components/dashboard/settings/shared/edgeConstants';
import type { CatalogModel, ProviderConfig } from '@/components/dashboard/settings/shared/edgeConstants';

// =============================================================================
// Provider Registry — completeness & structure
// =============================================================================

describe('PROVIDER_CONFIGS', () => {
    // Core deploy/data providers that must always exist (mirrors the backend
    // provider_tester registry). PROVIDER_CONFIGS may also carry additional
    // AI/email providers (openai, anthropic, ollama, resend, mailgun).
    const ALL_PROVIDERS = [
        'cloudflare', 'supabase', 'upstash', 'vercel', 'netlify', 'deno',
        'neon', 'postgres', 'mysql', 'wordpress_rest', 'turso',
    ];

    it('has all core providers', () => {
        const keys = Object.keys(PROVIDER_CONFIGS);
        for (const p of ALL_PROVIDERS) {
            expect(keys).toContain(p);
        }
        expect(keys.length).toBeGreaterThanOrEqual(ALL_PROVIDERS.length);
    });

    it.each(ALL_PROVIDERS)('%s has required fields', (provider) => {
        const cfg = PROVIDER_CONFIGS[provider];
        expect(cfg).toBeDefined();
        expect(cfg.label).toBeTruthy();
        expect(cfg.defaultName).toBeTruthy();
        expect(cfg.fields.length).toBeGreaterThan(0);
    });

    it.each(ALL_PROVIDERS)('%s fields have key, label, placeholder', (provider) => {
        const cfg = PROVIDER_CONFIGS[provider];
        for (const field of cfg.fields) {
            expect(field.key).toBeTruthy();
            expect(field.label).toBeTruthy();
            expect(field.placeholder).toBeTruthy();
        }
    });

    it('credential providers have at least one required field', () => {
        const credProviders = ['cloudflare', 'supabase', 'vercel', 'netlify', 'deno', 'neon'];
        for (const p of credProviders) {
            const required = PROVIDER_CONFIGS[p].fields.filter(f => f.required);
            expect(required.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('password fields use type "password"', () => {
        for (const [key, cfg] of Object.entries(PROVIDER_CONFIGS)) {
            const sensitiveFields = cfg.fields.filter(f =>
                f.key.includes('token') || f.key.includes('password') || f.key.includes('api_key') || f.key.includes('access_token')
            );
            for (const f of sensitiveFields) {
                expect(f.type, `${key}.${f.key} should be password type`).toBe('password');
            }
        }
    });
});

// =============================================================================
// PROVIDER_ICONS
// =============================================================================

describe('PROVIDER_ICONS', () => {
    it('has all deployable providers', () => {
        for (const provider of KNOWN_EDGE_PROVIDERS) {
            expect(PROVIDER_ICONS[provider], `Missing icon for ${provider}`).toBeDefined();
        }
    });

    it('includes docker', () => {
        expect(PROVIDER_ICONS.docker).toBeDefined();
    });

    it('all icons are defined React components', () => {
        for (const [key, icon] of Object.entries(PROVIDER_ICONS)) {
            expect(icon, `${key} icon must be defined`).toBeTruthy();
        }
    });
});

// =============================================================================
// KNOWN_EDGE_PROVIDERS vs PROVIDER_RESOURCE_LABELS alignment
// =============================================================================

describe('KNOWN_EDGE_PROVIDERS', () => {
    it('is a Set of 5 deployable providers', () => {
        expect(KNOWN_EDGE_PROVIDERS.size).toBe(5);
        expect(KNOWN_EDGE_PROVIDERS.has('cloudflare')).toBe(true);
        expect(KNOWN_EDGE_PROVIDERS.has('supabase')).toBe(true);
        expect(KNOWN_EDGE_PROVIDERS.has('vercel')).toBe(true);
        expect(KNOWN_EDGE_PROVIDERS.has('netlify')).toBe(true);
        expect(KNOWN_EDGE_PROVIDERS.has('deno')).toBe(true);
    });

    it('does NOT include non-edge providers', () => {
        expect(KNOWN_EDGE_PROVIDERS.has('postgres')).toBe(false);
        expect(KNOWN_EDGE_PROVIDERS.has('mysql')).toBe(false);
        expect(KNOWN_EDGE_PROVIDERS.has('turso')).toBe(false);
        expect(KNOWN_EDGE_PROVIDERS.has('docker')).toBe(false);
    });

    it('every KNOWN_EDGE_PROVIDER has a matching PROVIDER_CONFIGS entry', () => {
        for (const p of KNOWN_EDGE_PROVIDERS) {
            expect(PROVIDER_CONFIGS[p], `${p} missing from PROVIDER_CONFIGS`).toBeDefined();
        }
    });
});

describe('PROVIDER_RESOURCE_LABELS', () => {
    it('has entries for all KNOWN_EDGE_PROVIDERS', () => {
        for (const p of KNOWN_EDGE_PROVIDERS) {
            expect(PROVIDER_RESOURCE_LABELS[p], `Missing label for ${p}`).toBeDefined();
            expect(PROVIDER_RESOURCE_LABELS[p].inputLabel).toBeTruthy();
        }
    });

    it('cloudflare suffix is .workers.dev', () => {
        expect(PROVIDER_RESOURCE_LABELS.cloudflare.urlSuffix).toBe('.workers.dev');
    });

    it('supabase has no suffix (function URL is derived from project)', () => {
        expect(PROVIDER_RESOURCE_LABELS.supabase.urlSuffix).toBe('');
    });

    it('vercel suffix is .vercel.app', () => {
        expect(PROVIDER_RESOURCE_LABELS.vercel.urlSuffix).toBe('.vercel.app');
    });

    it('netlify suffix is .netlify.app', () => {
        expect(PROVIDER_RESOURCE_LABELS.netlify.urlSuffix).toBe('.netlify.app');
    });

    it('deno suffix is .deno.dev', () => {
        expect(PROVIDER_RESOURCE_LABELS.deno.urlSuffix).toBe('.deno.dev');
    });
});

// =============================================================================
// GPU Type Colors / Labels alignment
// =============================================================================

describe('GPU_TYPE_COLORS / GPU_TYPE_LABELS', () => {
    it('every color key has a matching label', () => {
        for (const key of Object.keys(GPU_TYPE_COLORS)) {
            expect(GPU_TYPE_LABELS[key], `GPU_TYPE_LABELS missing '${key}'`).toBeTruthy();
        }
    });

    it('labels include expected model types', () => {
        expect(GPU_TYPE_LABELS.llm).toContain('Text Generation');
        expect(GPU_TYPE_LABELS.embedder).toContain('Embeddings');
        expect(GPU_TYPE_LABELS.stt).toContain('Speech-to-Text');
        expect(GPU_TYPE_LABELS.tts).toContain('Text-to-Speech');
        expect(GPU_TYPE_LABELS.image_gen).toContain('Image Gen');
    });

    it('colors contain valid Tailwind classes', () => {
        for (const [key, val] of Object.entries(GPU_TYPE_COLORS)) {
            expect(val, `${key} colors should include bg-`).toContain('bg-');
            expect(val, `${key} colors should include text-`).toContain('text-');
        }
    });
});

// =============================================================================
// API_BASE
// =============================================================================

describe('API_BASE', () => {
    it('is empty string (Vite proxy)', () => {
        expect(API_BASE).toBe('');
    });
});

// =============================================================================
// GPU API Helpers — fetch / deploy
// =============================================================================

describe('fetchGPUCatalog', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('calls correct endpoint and returns parsed JSON', async () => {
        const mockData = { models_by_type: { llm: [] }, total: 0 };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockData),
        });
        vi.stubGlobal('fetch', mockFetch);

        const result = await fetchGPUCatalog('prov-1');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/edge-gpu/catalog?provider_id=prov-1')
        );
        expect(result).toEqual(mockData);

        vi.unstubAllGlobals();
    });

    it('throws when response is not ok', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({}),
        });
        vi.stubGlobal('fetch', mockFetch);

        await expect(fetchGPUCatalog('prov-1')).rejects.toThrow('Failed to fetch model catalog');

        vi.unstubAllGlobals();
    });
});

describe('deployGPUModel', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('POSTs to /api/edge-gpu/ with JSON body', async () => {
        const mockResult = { id: 'gpu-1', name: 'llama' };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockResult),
        });
        vi.stubGlobal('fetch', mockFetch);

        const payload = { name: 'llama', model_type: 'llm', provider: 'workers_ai' };
        const result = await deployGPUModel(payload);

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/edge-gpu/'),
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
        );
        expect(result).toEqual(mockResult);

        vi.unstubAllGlobals();
    });

    it('throws with detail message on failure', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ detail: 'Engine not found' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        await expect(deployGPUModel({})).rejects.toThrow('Engine not found');

        vi.unstubAllGlobals();
    });

    it('throws fallback message when no detail in error response', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            json: () => Promise.reject(new Error('parse error')),
        });
        vi.stubGlobal('fetch', mockFetch);

        await expect(deployGPUModel({})).rejects.toThrow('Failed to deploy model');

        vi.unstubAllGlobals();
    });
});

// =============================================================================
// Cross-registry consistency
// =============================================================================

describe('Cross-registry consistency', () => {
    it('every KNOWN_EDGE_PROVIDER has an icon, config, and resource label', () => {
        for (const p of KNOWN_EDGE_PROVIDERS) {
            expect(PROVIDER_ICONS[p], `${p}: missing icon`).toBeDefined();
            expect(PROVIDER_CONFIGS[p], `${p}: missing config`).toBeDefined();
            expect(PROVIDER_RESOURCE_LABELS[p], `${p}: missing resource label`).toBeDefined();
        }
    });

    it('no PROVIDER_CONFIGS entry is missing a label', () => {
        for (const [key, cfg] of Object.entries(PROVIDER_CONFIGS)) {
            expect(cfg.label, `${key} missing label`).toBeTruthy();
        }
    });

    it('PROVIDER_CONFIGS labels are unique per non-alias provider', () => {
        // wordpress, wordpress_rest, wordpress_graphql intentionally share the 'WordPress' label
        const aliasProviders = new Set(['wordpress_rest', 'wordpress_graphql']);
        const labels = Object.entries(PROVIDER_CONFIGS)
            .filter(([key]) => !aliasProviders.has(key))
            .map(([, c]) => c.label);
        const unique = new Set(labels);
        expect(unique.size).toBe(labels.length);
    });
});
