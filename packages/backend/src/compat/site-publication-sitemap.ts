import type { PublicationVersion } from './publication-version.js';
import { publicationPaths } from './publication-version.js';

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

/** One reviewed capture only. Never query canonical data or current templates. */
export function capturedSiteSitemap(artifact: PublicationVersion): string {
    const paths = artifact.schemaVersion===1?[...(artifact.templates.some(template=>template.role==='directory')?[artifact.configuration.routes.directory]:[]),...(artifact.records.articles.length?[artifact.configuration.routes.blog]:[]),...[...artifact.records.institutions,...artifact.records.programs,...artifact.records.articles].map(row=>row.originalPath)]:publicationPaths(artifact);
    const seen = new Set<string>();
    const urls = paths.filter(path => {
        const identity = decodeURIComponent(path).replace(/\/$/, '') || '/';
        if (seen.has(identity)) return false;
        seen.add(identity); return true;
    }).map(path => `<url><loc>${xml(new URL(path, artifact.configuration.site.origin).href)}</loc></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}
