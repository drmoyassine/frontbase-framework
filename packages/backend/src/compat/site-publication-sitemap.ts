import type { SitePublicationArtifact } from '@frontbase/edge-core/directory/publication';

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

/** One reviewed capture only. Never query canonical data or current templates. */
export function capturedSiteSitemap(artifact: SitePublicationArtifact): string {
    const paths = [...(artifact.templates.some(template => template.role === 'directory') ? [artifact.configuration.routes.directory] : []),
        ...(artifact.records.articles.length ? [artifact.configuration.routes.blog] : []),
        ...artifact.records.institutions.map(row => row.originalPath),
        ...artifact.records.programs.map(row => row.originalPath),
        ...artifact.records.articles.map(row => row.originalPath)];
    const seen = new Set<string>();
    const urls = paths.filter(path => {
        const identity = decodeURIComponent(path).replace(/\/$/, '') || '/';
        if (seen.has(identity)) return false;
        seen.add(identity); return true;
    }).map(path => `<url><loc>${xml(new URL(path, artifact.configuration.site.origin).href)}</loc></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}
