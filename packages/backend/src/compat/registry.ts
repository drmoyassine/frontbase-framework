/**
 * CF-22 — the IMPLEMENTED registry: which vendored community ops have real
 * framework handlers (vs. 501 stubs). Drives `x-implemented` in the emitted spec
 * and the burn-down count in the drift gate.
 *
 * P1: `variables` (6). P2 Wave 1: Meta (3), settings (12), Themes (3), project (3),
 * security-events (2). P2 Waves 2–5 grow this set until it equals productOps().
 */
import { opKey } from './spec.js';

/** Op keys implemented by real handlers. */
export const IMPLEMENTED: Set<string> = new Set([
    // P1 — variables (6)
    opKey('GET', '/api/variables/'),
    opKey('POST', '/api/variables/'),
    opKey('GET', '/api/variables/registry/'),
    opKey('GET', '/api/variables/{variable_id}'),
    opKey('PUT', '/api/variables/{variable_id}/'),
    opKey('DELETE', '/api/variables/{variable_id}/'),

    // P2 Wave 1 — Meta (3) [unauthenticated health]
    opKey('GET', '/'),
    opKey('GET', '/health'),
    opKey('GET', '/api/queue/health'),

    // P2 Wave 1 — settings (12)
    opKey('GET', '/api/settings/general'),
    opKey('PUT', '/api/settings/general'),
    opKey('GET', '/api/settings/privacy/'),
    opKey('PUT', '/api/settings/privacy/'),
    opKey('GET', '/api/settings/security/'),
    opKey('PUT', '/api/settings/security/'),
    opKey('GET', '/api/settings/redis/'),
    opKey('PUT', '/api/settings/redis/'),
    opKey('POST', '/api/settings/redis/test/'),
    opKey('POST', '/api/settings/telemetry'),
    opKey('POST', '/api/settings/validate-license'),
    opKey('POST', '/api/settings/invites'),

    // P2 Wave 1 — Themes (3)
    opKey('GET', '/api/themes/'),
    opKey('POST', '/api/themes/'),
    opKey('DELETE', '/api/themes/{theme_id}'),

    // P2 Wave 1 — project (3)
    opKey('GET', '/api/project/'),
    opKey('PUT', '/api/project/'),
    opKey('POST', '/api/project/assets/upload/'),

    // P2 Wave 1 — security-events (2)
    opKey('GET', '/api/security-events/'),
    opKey('GET', '/api/security-events/summary'),

    // P2 Wave 1b — pages (17)
    opKey('GET', '/api/pages/'),
    opKey('POST', '/api/pages/'),
    opKey('GET', '/api/pages/homepage/'),
    opKey('GET', '/api/pages/public/{slug}/'),
    opKey('GET', '/api/pages/{page_id}/'),
    opKey('PUT', '/api/pages/{page_id}/'),
    opKey('PUT', '/api/pages/{page_id}/layout/'),
    opKey('DELETE', '/api/pages/{page_id}/'),
    opKey('DELETE', '/api/pages/{page_id}/permanent/'),
    opKey('POST', '/api/pages/{page_id}/restore/'),
    opKey('POST', '/api/pages/{page_id}/publish-batch/'),
    opKey('POST', '/api/pages/{page_id}/publish/{engine_id}/'),
    opKey('POST', '/api/pages/{page_id}/unpublish/{engine_id}/'),
    opKey('GET', '/api/pages/{page_id}/versions/'),
    opKey('POST', '/api/pages/{page_id}/versions/'),
    opKey('GET', '/api/pages/{page_id}/versions/{version_id}/'),
    opKey('POST', '/api/pages/{page_id}/rollback/'),

    // P2 Wave 1b — database (10)
    opKey('GET', '/api/database/connections/'),
    opKey('POST', '/api/database/test-supabase/'),
    opKey('POST', '/api/database/connect-supabase/'),
    opKey('DELETE', '/api/database/disconnect-supabase/'),
    opKey('GET', '/api/database/tables/'),
    opKey('GET', '/api/database/supabase-tables/'),
    opKey('GET', '/api/database/table-data/{table_name}/'),
    opKey('GET', '/api/database/table-schema/{table_name}/'),
    opKey('POST', '/api/database/advanced-query/'),
    opKey('POST', '/api/database/distinct-values/'),

    // P2 Wave 1b — rls (14)
    opKey('GET', '/api/database/rls/policies/'),
    opKey('GET', '/api/database/rls/tables/'),
    opKey('GET', '/api/database/rls/policies/{table_name}'),
    opKey('POST', '/api/database/rls/policies/'),
    opKey('PUT', '/api/database/rls/policies/{table_name}/{policy_name}'),
    opKey('DELETE', '/api/database/rls/policies/{table_name}/{policy_name}'),
    opKey('POST', '/api/database/rls/tables/{table_name}/toggle/'),
    opKey('POST', '/api/database/rls/batch/'),
    opKey('POST', '/api/database/rls/bulk-delete/'),
    opKey('GET', '/api/database/rls/metadata/'),
    opKey('GET', '/api/database/rls/metadata/{table_name}/{policy_name}'),
    opKey('POST', '/api/database/rls/metadata/'),
    opKey('DELETE', '/api/database/rls/metadata/{table_name}/{policy_name}'),
    opKey('POST', '/api/database/rls/metadata/verify/'),
]);
