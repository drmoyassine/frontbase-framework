import { directoryBrowsingSchema, directoryBrowsingStateSchema } from '../../directory/browsing.js';
import { escapeHtml } from './lib/utils.js';

/** Native GET browsing: no hydration, credentials, datasource access or arbitrary form target. */
export function renderDirectoryBrowsing(props: Record<string, unknown>): string {
    const options = directoryBrowsingSchema.parse(props.directoryBrowsing);
    if (props.directoryBrowsingState === undefined) return '<p>Visitor browsing controls appear in the prepared site preview.</p>';
    const [state] = directoryBrowsingStateSchema.parse(props.directoryBrowsingState);
    const action = state.previewHash ? '/api/project/site-configuration/publication/render/' : state.path;
    const base = new URLSearchParams(state.previewHash ? { hash: state.previewHash, path: state.path } : {});
    const href = (collection: 'institution' | 'program' | null, page: number, q = state.q) => {
        const params = new URLSearchParams(base);
        if (collection) params.set('type', collection);
        if (q) params.set('q', q);
        if (page > 1) params.set('page', String(page));
        return escapeHtml(action + (params.size ? '?' + params.toString() : ''));
    };
    const pill = 'display:inline-flex;align-items:center;justify-content:center;padding:10px 18px;border:1px solid hsl(var(--border));border-radius:10px;text-decoration:none;white-space:nowrap';
    const link = (label: string, collection: typeof state.collection, page: number, current = false) =>
        `<a href="${href(collection, page)}"${current ? ' aria-current="page"' : ''} style="${pill};background:${current ? 'hsl(var(--primary))' : 'hsl(var(--background))'};color:${current ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'}">${label}</a>`;
    const tabs = options.tabs && state.collection ? `<nav aria-label="Directory collections" style="display:flex;flex-wrap:wrap;gap:10px">${link('Institutions', 'institution', 1, state.collection === 'institution')}${link('Programs', 'program', 1, state.collection === 'program')}</nav>` : '';
    const hidden = new URLSearchParams(base);
    if (state.collection) hidden.set('type', state.collection);
    const search = options.search && state.searchEnabled ? `<form method="get" action="${escapeHtml(action)}" role="search" aria-label="Search directory" style="display:flex;flex-wrap:wrap;align-items:end;gap:10px">${[...hidden].map(([key,value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('')}<label style="flex:1 1 220px;min-width:0;color:hsl(var(--foreground))">Search by title<input type="search" name="q" maxlength="100" value="${escapeHtml(state.q)}" placeholder="${state.collection === 'program' ? 'Find a program' : state.collection === 'institution' ? 'Find an institution' : 'Find an article'}" style="display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:11px 14px;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--background));color:hsl(var(--foreground))"></label><button type="submit" style="${pill};background:hsl(var(--primary));color:hsl(var(--primary-foreground));cursor:pointer;font:inherit">Search</button></form>` : '';
    const pager = options.pagination ? `<nav aria-label="Directory pages" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">${state.page > 1 ? link('Previous', state.collection, state.page - 1) : ''}<span aria-live="polite" style="color:hsl(var(--muted-foreground))">Page ${state.page}</span>${state.hasNext ? link('Next', state.collection, state.page + 1) : ''}</nav>` : '';
    return `<section class="fb-directory-browsing" aria-label="Browse directory">${[tabs, search, pager].filter(Boolean).map(html => `<div style="margin-bottom:18px">${html}</div>`).join('')}</section>`;
}
