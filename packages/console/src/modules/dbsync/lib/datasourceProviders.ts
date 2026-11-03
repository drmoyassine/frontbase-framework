import { PROVIDER_CONFIGS } from '@/components/dashboard/settings/shared/edgeConstants';
import type { DiscoveredResource } from '@/components/dashboard/settings/shared/AccountResourcePicker';

export const DATABASE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, config]) => config.capabilities?.includes('database') || config.capabilities?.includes('cms'))
    .map(([key, config]) => ({
        key,
        label: key === 'cloudflare' ? 'Cloudflare D1' : key === 'supabase' ? 'Supabase / PostgREST' : config.label,
        unavailable: key === 'mysql' || key === 'postgres',
    }));

export const DATASOURCE_RESOURCE_TYPES: Record<string, string> = {
    cloudflare: 'd1', d1: 'd1', supabase: 'supabase_project', neon: 'neon_project',
    turso: 'turso_db', google_sheets: 'google_sheet',
};

/** Persist the selected resource alongside its account using the existing adapter fields. */
export function datasourceResourceConfig(kind: string, resource: DiscoveredResource) {
    switch (kind) {
        case 'cloudflare':
        case 'd1':
            return { database_id: resource.id, account_id: resource.account_id };
        case 'supabase':
            return { project_ref: resource.id };
        case 'neon':
            return { project_id: resource.id };
        case 'turso':
            return { db_id: resource.id, db_name: resource.name };
        case 'google_sheets':
            return { spreadsheetId: resource.spreadsheetId, webAppUrl: resource.webAppUrl };
        default:
            return { api_url: resource.api_url, base_url: resource.api_url, username: resource.username };
    }
}
