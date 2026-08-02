/**
 * Neon resource strategy.
 *
 * discover: resolves the caller's org (unless org_id is already stored on
 * the Connected Account), lists projects (limit=50, scoped to that org
 * when known), and best-effort fetches each project's pooled
 * connection_uri. Ported 1:1 from the product reference
 * (app/services/provider_discovery.py :: _discover_neon).
 *
 * No createResource, no listEngines — Neon does not expose either op in
 * the product contract.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    DiscoveredResource,
} from '../types.js';
import { guardedExternalFetch } from '../../../../external-http.js';
import type { CompatFetch } from '../../../../external-http.js';

const NEON_API = 'https://console.neon.tech/api/v2';

export function createNeonResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'neon',

        async discover(credentials: Record<string, unknown>): Promise<DiscoveryResult> {
            const apiKey = String(credentials.api_key ?? '');
            if (!apiKey) {
                return { success: false, detail: 'Credentials not available' };
            }
            const headers: Record<string, string> = {
                Authorization: `Bearer ${apiKey}`,
            };

            // 1. Resolve org_id if the Connected Account didn't store one.
            //    Best-effort: any failure (network, redirect, non-200, empty
            //    org list) just falls through to an unscoped project fetch,
            //    matching the product's httpx flow.
            let orgId = String(credentials.org_id ?? '');
            if (!orgId) {
                try {
                    const orgResp = await guardedExternalFetch(
                        externalFetch,
                        `${NEON_API}/users/me/organizations`,
                        { headers },
                    );
                    if (orgResp.ok) {
                        const orgData = (await orgResp.json().catch(() => ({}))) as {
                            organizations?: Array<{ id?: unknown }>;
                        };
                        const orgs = Array.isArray(orgData?.organizations) ? orgData.organizations : [];
                        if (orgs.length > 0 && orgs[0]?.id != null) {
                            orgId = String(orgs[0].id);
                        }
                    }
                } catch {
                    // best-effort: proceed without org_id
                }
            }

            // 2. Fetch projects (limit=50, scoped to org when known).
            //    Neon's API key may be org-scoped; including org_id matches
            //    the product query and disambiguates personal vs org projects.
            const projectsUrl = new URL(`${NEON_API}/projects`);
            projectsUrl.searchParams.set('limit', '50');
            if (orgId) {
                projectsUrl.searchParams.set('org_id', orgId);
            }

            let projectsResp: Response;
            try {
                projectsResp = await guardedExternalFetch(
                    externalFetch,
                    projectsUrl.toString(),
                    { headers },
                );
            } catch (e) {
                return {
                    success: false,
                    detail: `Neon discovery failed: ${(e as Error).message}`,
                };
            }

            if (!projectsResp.ok) {
                const body = await projectsResp.text().catch(() => '');
                return {
                    success: false,
                    detail: `Neon API error: ${projectsResp.status} — ${body.slice(0, 200)}`,
                };
            }

            const data = (await projectsResp.json().catch(() => ({}))) as {
                projects?: Array<Record<string, unknown>>;
            };
            const projects = Array.isArray(data?.projects) ? data.projects : [];

            // 3. Best-effort connection_uri per project. The Neon API mints a
            //    pooled URI for a given role+database; failures leave the field
            //    empty (the project is still surfaced, just without a URI).
            const resources: DiscoveredResource[] = [];
            for (const p of projects) {
                const projectId = String(p.id ?? '');
                let connectionUri = '';
                if (projectId) {
                    try {
                        const connUrl = new URL(
                            `${NEON_API}/projects/${encodeURIComponent(projectId)}/connection_uri`,
                        );
                        connUrl.searchParams.set('role_name', 'neondb_owner');
                        connUrl.searchParams.set('database_name', 'neondb');
                        const connResp = await guardedExternalFetch(
                            externalFetch,
                            connUrl.toString(),
                            { headers },
                        );
                        if (connResp.ok) {
                            const connData = (await connResp.json().catch(() => ({}))) as {
                                uri?: unknown;
                            };
                            if (typeof connData?.uri === 'string') {
                                connectionUri = connData.uri;
                            }
                        }
                    } catch {
                        // best-effort: leave connection_uri empty
                    }
                }

                resources.push({
                    id: projectId,
                    name: String(p.name ?? ''),
                    type: 'neon_project',
                    // Product maps Neon's `region_id` API field → resource `region`.
                    region: String(p.region_id ?? ''),
                    pg_version: String(p.pg_version ?? ''),
                    connection_uri: connectionUri,
                });
            }

            return { success: true, resources };
        },
    };
}
