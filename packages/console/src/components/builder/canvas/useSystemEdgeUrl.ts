/**
 * useSystemEdgeUrl — resolve the CF-22 system edge worker URL (the self-aware
 * edge with `is_system === true`).
 *
 * In production the console is served from the system-edge worker, so a
 * relative `/builder/api/reRender` POST is same-origin and Just Works. In Vite
 * dev (:5173) `/builder` is not proxied, so we fall back to the absolute system
 * edge URL if one is configured (the same `engine.url` EmbedCodeDialog /
 * EdgePublishDialog use). Cross-origin fetch requires CORS + SameSite=None on
 * `fb_session`; see openQuestions.
 *
 * Returns undefined until the system edge is identified, in which case the
 * bridge uses the relative (same-origin) URL.
 */

import { useEdgeEngines } from '@/hooks/useEdgeInfrastructure';
import { resolveEngineOrigin } from '@/lib/edgeUtils';

export function useSystemEdgeUrl(): string | undefined {
    const { data: engines = [] } = useEdgeEngines();
    // Prefer an active system engine; pick the first match. Fall back to any
    // system engine if none is active.
    const system = engines.find((e) => e.is_system && e.is_active)
        ?? engines.find((e) => e.is_system);
    // Resolve through resolveEngineOrigin(isSystem) — NEVER hand back the raw
    // stored url: the backend synthesizes the system engine's url from the
    // REQUEST origin, which behind a TLS-terminating proxy (Easypanel, nginx →
    // plain HTTP) is http:// — fetching it from the https console is blocked
    // mixed content. In production it resolves to the browser origin (same
    // host the console is served from); in Vite dev it still prefers the
    // configured engine URL.
    if (!system) return undefined;
    const resolved = resolveEngineOrigin(system.url, undefined, undefined, true);
    return resolved || undefined;
}
