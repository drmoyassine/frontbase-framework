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

export function useSystemEdgeUrl(): string | undefined {
    const { data: engines = [] } = useEdgeEngines();
    // Prefer an active system engine; pick the first match.
    const system = engines.find((e) => e.is_system && e.is_active);
    if (system?.url) return system.url;
    // Fall back to any system engine if none is active.
    const anySystem = engines.find((e) => e.is_system);
    return anySystem?.url ?? undefined;
}
