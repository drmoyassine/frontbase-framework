/**
 * Edge Inspector — shared types, constants, and helpers.
 */

import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';

// ─── API Response Types ─────────────────────────────────────────────────────

export interface SourceSnapshotResponse {
    success: boolean;
    files: Record<string, string>;
    file_count: number;
    total_size: number;
}

/** Hierarchical file tree node for the inspector nav panel. */
export interface HierNode {
    rootFiles: string[];       // Files directly in this dir
    subdirs: Map<string, HierNode>;
}

export interface InspectSettingsResponse {
    success: boolean;
    settings: {
        // CF-specific
        compatibility_date?: string;
        compatibility_flags?: string[];
        usage_model?: string;
        bindings?: Array<{ type: string; name: string;[key: string]: any }>;
        routes?: Array<{ type: string; pattern: string }>;
        cron_triggers?: Array<{ cron: string; created_on?: string }>;
        placement?: Record<string, any>;
        tail_consumers?: any[];
        // Supabase-specific
        verify_jwt?: boolean;
        entrypoint_path?: string;
        status?: string;
        version?: number;
        import_map?: boolean;
        import_map_path?: string;
        // Generic catch-all
        [key: string]: any;
    };
}

export interface InspectSecretsResponse {
    success: boolean;
    secrets: string[];
    imported_notice?: string;
}

export interface DomainInfo {
    id: string;
    domain: string;
    status: string;           // 'active' | 'pending' | 'error'
    ssl_status: string;
    verification_type: string;
    verification_value: string;
    dns_target: string;
    dns_records?: { type: string; name: string; content: string }[];
    provider: string;
    created_at: string;
}

export interface InspectDomainsResponse {
    success: boolean;
    domains: DomainInfo[] | null;
    detail: string;
}

// ─── Navigation Types ───────────────────────────────────────────────────────

export type NavSection = 'files' | 'secrets' | 'settings' | 'logs' | 'domains' | 'agents';
export type SelectedItem = { section: NavSection; key: string };

// ─── Props Types ────────────────────────────────────────────────────────────

export interface EdgeInspectorDialogProps {
    engine: EdgeEngine;
    providerId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const API_BASE = '';

export const PROVIDER_LABELS: Record<string, string> = {
    cloudflare: 'Cloudflare', supabase: 'Supabase', vercel: 'Vercel',
    netlify: 'Netlify', deno: 'Deno Deploy', upstash: 'Upstash',
};

export interface EndpointDef {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    dynamic?: boolean;
}

export const LITE_ENDPOINTS: EndpointDef[] = [
    { method: 'GET', path: '/api/health', description: 'Health check' },
    { method: 'GET', path: '/api/openapi.json', description: 'OpenAPI 3.1 spec' },
    { method: 'GET', path: '/api/docs', description: 'Swagger UI' },
    { method: 'POST', path: '/api/deploy', description: 'Receive deployment config' },
    { method: 'POST', path: '/api/execute', description: 'Execute workflow action' },
    { method: 'POST', path: '/api/webhook/:name', description: 'Incoming webhooks (API key auth)' },
    { method: 'GET', path: '/api/executions', description: 'List workflow executions' },
];

const FULL_EXTRA_ENDPOINTS: EndpointDef[] = [
    { method: 'POST', path: '/api/import', description: 'Receive published pages' },
    { method: 'POST', path: '/api/data/execute', description: 'Data query proxy (DataRequest)' },
    { method: 'GET', path: '/api/cache/stats', description: 'Cache statistics' },
    { method: 'POST', path: '/api/cache/invalidate', description: 'Invalidate cached pages' },
    { method: 'GET', path: '/:slug', description: 'SSR page rendering', dynamic: true },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function extractWorkerName(engine: EdgeEngine): string {
    try {
        const cfg = typeof engine.engine_config === 'string'
            ? JSON.parse(engine.engine_config)
            : engine.engine_config;
        if (cfg?.worker_name) return cfg.worker_name;
    } catch { /* fallback */ }
    return engine.name.replace(/^(Cloudflare|CF):\s*/i, '').trim();
}

export function getEndpointsForAdapter(adapterType: string): EndpointDef[] {
    const isFullAdapter = adapterType === 'full';
    return isFullAdapter ? [...LITE_ENDPOINTS, ...FULL_EXTRA_ENDPOINTS] : LITE_ENDPOINTS;
}

export function getWorkerBaseUrl(engine: EdgeEngine): string {
    if (!engine.url) return '';
    const url = engine.url.startsWith('http') ? engine.url : `https://${engine.url}`;
    return url.replace(/\/$/, '');
}

export function getOpenApiInfo(
    spec: any, path: string, method: string
): { summary?: string; requestBody?: any; responses?: any; parameters?: any } | null {
    if (!spec?.paths) return null;
    const pathObj = spec.paths[path] || spec.paths[path.replace(/:[\w]+/g, '{$1}')];
    if (!pathObj) return null;
    const op = pathObj[method.toLowerCase()];
    if (!op) return null;
    return {
        summary: op.summary || op.description,
        requestBody: op.requestBody,
        responses: op.responses,
        parameters: op.parameters,
    };
}

export async function inspectFetch<T>(endpoint: string, providerId: string, workerName: string): Promise<T> {
    const resp = await fetch(`${API_BASE}/api/cloudflare/inspect/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, worker_name: workerName }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.detail || `Failed to fetch ${endpoint}`);
    return data;
}

/** Engine-based inspect fetch — works for ALL providers (CF, Supabase, Deno). */
export async function engineInspectFetch<T>(engineId: string, panel: 'source' | 'settings' | 'secrets' | 'domains'): Promise<T> {
    const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/${panel}`);
    const data = await resp.json();
    // If provider doesn't support this panel, return the data for the caller to handle
    if (data.supported === false) throw new Error(data.detail || `${panel} not supported for this provider`);
    if (!resp.ok || !data.success) throw new Error(data.detail || `Failed to fetch ${panel}`);
    return data;
}
