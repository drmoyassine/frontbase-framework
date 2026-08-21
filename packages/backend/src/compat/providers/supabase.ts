/**
 * Supabase provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's connect-time enrichment (supabase_management.py +
 * edge_providers.py:292-331) and the adapter resolution (supabase_adapter.py
 * + credential_resolver.get_datasource_credentials) into the framework worker.
 *
 * Enrichment (connect): PAT + project_ref → fetch anon_key + service_role_key
 *   (GET /v1/projects/{ref}/api-keys) + jwt_secret (GET /v1/projects/{ref}/postgrest)
 *   + derive api_url = https://{ref}.supabase.co. Best-effort; failures return
 *   the input unchanged so connect still succeeds with the bare token.
 *
 * Resolution (datasource → runner): { api_url|project_ref, service_role_key|anon_key }
 *   → { url, serviceKey, jwt?, schema? } as expected by supabaseRunner.
 */
import { guardedExternalFetch, type CompatFetch } from '../external-http.js';
import type { DatasourceResolver, ProviderEnricher } from './types.js';

const SUPABASE_API = 'https://api.supabase.com/v1';

/**
 * Resolve a stored Supabase config into the supabaseRunner shape.
 * PURE. Favors explicit service_role_key; falls back to anon_key; derives the
 * project URL from project_ref when api_url is absent.
 */
export const resolveSupabase: DatasourceResolver = (config) => {
    const serviceKey = String(config.serviceKey ?? config.service_role_key ?? config.anon_key ?? '');
    const rawUrl = String(config.url ?? config.api_url ?? '').replace(/\/+$/, '');
    const projectRef = String(config.project_ref ?? config.ref ?? '');
    const url = rawUrl || (projectRef ? `https://${projectRef}.supabase.co` : '');
    const resolved: Record<string, unknown> = { url, serviceKey };
    // Carry the public anon key through (connect-time enrichment stores both)
    // so policy-split consumers can send it for anonymous traffic — the
    // published-page RPC proxy uses it for unauthenticated callers while
    // authenticated console/preview calls keep the service-role key.
    const anonKey = String(config.anonKey ?? config.anon_key ?? '');
    if (anonKey && anonKey !== serviceKey) resolved.anonKey = anonKey;
    // `jwt` here means a JWT *token* to send as the Bearer (defaults to serviceKey,
    // which is itself a valid JWT). Do NOT map `jwt_secret` — that is the project's
    // raw signing SECRET (from /v1/projects/{ref}/postgrest), used server-side to
    // sign tokens; sending it as a Bearer makes PostgREST try to decode it as a JWT
    // → "Expected 3 parts; got 1". Only honor an explicit caller-provided JWT token.
    const jwt = config.jwt;
    if (jwt) resolved.jwt = String(jwt);
    const schema = config.schema;
    if (schema) resolved.schema = String(schema);
    // Carry project_ref through so downstream (e.g. management calls) can use it.
    if (projectRef) resolved.project_ref = projectRef;
    return resolved;
};

interface ApiKeyRow { name?: string; api_key?: string }

/**
 * Connect-time enrichment. Fetches anon/service_role keys + jwt_secret and
 * merges them into the config. Defensive: any fetch/parse failure is swallowed
 * and the original config is returned (best-effort, matching the product).
 */
export const enrichSupabase: ProviderEnricher = async (config, externalFetch) => {
    const accessToken = String(config.access_token ?? '');
    const projectRef = String(config.project_ref ?? config.ref ?? '');
    if (!accessToken || !projectRef) return config; // nothing to enrich without both
    // Idempotent: already-enriched accounts (connect-time OR a prior lazy enrich)
    // have the service_role_key — skip the fetch. Keeps lazy enrichment on the read
    // path from refetching on every query.
    if (config.service_role_key) return config;

    const merged: Record<string, unknown> = {
        ...config,
        api_url: config.api_url ?? `https://${projectRef}.supabase.co`,
        project_ref: projectRef,
    };

    // GET /v1/projects/{ref}/api-keys → [{name, api_key}, ...]
    try {
        const resp = await guardedExternalFetch(externalFetch, `${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/api-keys`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
            const keys = await resp.json() as ApiKeyRow[];
            if (Array.isArray(keys)) {
                for (const k of keys) {
                    const name = String(k?.name ?? '').toLowerCase();
                    if (name.includes('anon')) merged.anon_key = String(k.api_key ?? '');
                    else if (name.includes('service')) merged.service_role_key = String(k.api_key ?? '');
                }
            }
        }
    } catch {
        // best-effort — swallow
    }

    // GET /v1/projects/{ref}/postgrest → { jwt_secret }
    try {
        const resp = await guardedExternalFetch(externalFetch, `${SUPABASE_API}/projects/${encodeURIComponent(projectRef)}/postgrest`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (resp.ok) {
            const data = await resp.json() as { jwt_secret?: string };
            if (data?.jwt_secret) merged.jwt_secret = String(data.jwt_secret);
        }
    } catch {
        // best-effort — swallow
    }

    return merged;
};
