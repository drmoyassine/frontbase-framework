/**
 * Builds the synthetic template SOURCE (exporter input) for the education
 * directory template. Destination-specific values are deliberately absent:
 * they arrive only through the destination binding manifest at install time.
 */
import { templateConfigurationDefaults, templateLayouts } from './layouts.mjs';
import { exportTemplateArtifact } from './artifact.mjs';

export const REQUIRED_CAPABILITIES = [
    { id: 'sql.datasource', required: true, resolveVia: 'connect a SQL datasource in /frontbase-admin (Data Studio connections); Supabase, Postgres, Neon, SQLite, Turso and D1 kinds are accepted by directory preview' },
    { id: 'storage.object', required: false, resolveVia: 'connect object storage in /frontbase-admin only when covers/logos are used; records carry https image URLs', note: 'optional for this template' },
    { id: 'publication.runtime', required: false, resolveVia: 'pending first-swarm publication activation controls; clean-install publish/rollback proof is blocked, not bypassed', note: 'preview-only until activation controls ship' },
];

/** Every gap a fresh destination must bind, by configuration path. */
export const DESTINATION_BINDINGS = [
    'datasourceId',
    'site.name', 'site.destination', 'site.origin', 'site.locale',
    'contacts.email', 'contacts.whatsapp',
    'routes.directory', 'routes.blog',
    'collections.institution.table', 'collections.institution.scope',
    'collections.program.table', 'collections.program.scope',
    'collections.city.table', 'collections.city.scope',
    'collections.article.table', 'collections.article.scope',
    'pages.institution.detailPath', 'pages.program.detailPath', 'pages.article.detailPath',
];

export function buildTemplateSource(version, detailSamplePaths) {
    return {
        templateId: 'education-directory',
        templateVersion: version,
        createdAt: '2026-10-07T12:00:00Z',
        source: 'education-template-proof synthetic fixtures',
        requiredCapabilities: REQUIRED_CAPABILITIES,
        destinationBindings: DESTINATION_BINDINGS,
        configuration: templateConfigurationDefaults(),
        pages: templateLayouts(version, detailSamplePaths),
        notes: 'Editable saved layouts carry directoryQuery/recordBindings/siteBindings only; no rows, credentials, approvals, pointers, captures, users or recovery data.',
    };
}

export function buildArtifact(version, detailSamplePaths) {
    return exportTemplateArtifact(buildTemplateSource(version, detailSamplePaths));
}
