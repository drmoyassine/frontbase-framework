import { directoryLayoutQueries, projectDirectoryRecords, type SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import type { PageLayoutLike } from '@/lib/builder/iframeTypes';

/** Resolve registered authoring requests before the shared SW/network renderer. */
export async function loadDirectoryCanvas(layout: PageLayoutLike, saved: SiteConfigurationDraft, signal: AbortSignal): Promise<PageLayoutLike> {
    const rows = new Map<string, Record<string, unknown>[]>();
    for (const { id, binding } of directoryLayoutQueries(layout)) {
        const [, role, mode] = binding.queryId.split('.');
        const response = await fetch('/api/project/site-configuration/preview/', { method: 'POST', credentials: 'include', signal,
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: saved.revision, role, mode, params: binding.params }) });
        if (!response.ok) throw new Error('Directory preview unavailable; reload shared settings and check the query.');
        const result = await response.json();
        if (result.revision !== saved.revision || result.queryId !== binding.queryId || !Array.isArray(result.rows)) throw new Error('Directory preview revision mismatch');
        rows.set(id, result.rows);
    }
    return projectDirectoryRecords(layout, rows);
}
