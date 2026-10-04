/** Loopback-only consumer draft, rendered by the unchanged Frontbase engine. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createEngine, directProvider } from '../../packages/edge-core/dist/index.js';

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--data')) throw new Error('Provide --data <protected pilot projection JSON>');
const data = JSON.parse(await readFile(value('--data'), 'utf8'));
const port = Number(args.includes('--port') ? value('--port') : 4387);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
const templatePath = fileURLToPath(new URL('../../packages/console/src/components/builder/templates/pages/educationDirectoryTemplate.ts', import.meta.url));
const bundle = await build({ entryPoints: [templatePath], bundle: true, write: false, platform: 'node', format: 'esm' });
const { educationDirectoryTemplate, directoryLiteral } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const css = await readFile(new URL('./pilot.css', import.meta.url), 'utf8');
const studioScript = await readFile(new URL('./pilot-studio.js', import.meta.url), 'utf8');
const html = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const indexed = new Map();
for (const row of data.rows) {
    if (!row.path.startsWith('/') || row.path.startsWith('//') || /[\\?#\s]/.test(row.path) || row.path.split('/').some(p => ['.', '..'].includes(p))) {
        throw new Error('Unsafe local projection path');
    }
    if (indexed.has(row.path)) throw new Error('Duplicate projection path: ' + row.path);
    indexed.set(row.path, row);
}
const listingKinds = new Set(['program', 'institution', 'pathway', 'city']);
const cities = [...new Set(data.rows.filter(r => listingKinds.has(r.kind)).map(r => r.city).filter(Boolean))].sort();
const defaults = { scope: 'expanded', kind: 'institution', city: '', q: '', degree: '', intake: '', institution: '', sort: 'name', page: 1, size: 12,
    brand: 'Studygram · USA', heading: 'Your next chapter starts in the USA.',
    introduction: 'Explore programs and institutions across the United States. Find an option that fits your goals, then plan your application with a counselor.' };

function selection(url, parent = null) {
    const p = url.searchParams;
    const clean = (key, max) => (p.get(key) || defaults[key] || '').replace(/[\x00-\x1f]/g, '').slice(0, max);
    const options = { scope: p.get('scope') === 'wordpress' ? 'wordpress' : 'expanded',
        kind: parent ? 'program' : listingKinds.has(p.get('type') || p.get('kind')) ? p.get('type') || p.get('kind') : p.get('kind') === 'all' ? 'all' : defaults.kind, city: clean('city', 160),
        degree: clean('degree', 160), intake: clean('intake', 50), institution: clean('institution', 300),
        sort: p.get('sort') === 'latest' ? 'latest' : 'name',
        q: clean('q', 160), brand: clean('brand', 80), heading: clean('heading', 160), introduction: clean('introduction', 500),
        page: Math.max(1, Math.min(1000, Number.parseInt(p.get('page'), 10) || 1)),
        size: [12, 24, 48].includes(Number(p.get('size'))) ? Number(p.get('size')) : 12 };
    const rows = data.rows.filter(r => listingKinds.has(r.kind)
        && (options.scope !== 'wordpress' || r.origin === 'wordpress')
        && (options.kind === 'all' || r.kind === options.kind)
        && (!parent || r.institution_path === parent.path || parent.kind === 'city' && r.city === parent.city)
        && (!options.institution || r.institution_path === options.institution)
        && (!options.degree || r.degree === options.degree)
        && (!options.intake || r.intakes?.includes(options.intake))
        && (!options.city || r.city === options.city)
        && (!options.q || (r.title + ' ' + r.summary + ' ' + r.city + ' ' + (r.institution_title || '')).toLowerCase().includes(options.q.toLowerCase())))
        .sort((a, b) => options.sort === 'latest' ? String(b.modified_at || '').localeCompare(String(a.modified_at || '')) || a.title.localeCompare(b.title) : a.title.localeCompare(b.title));
    options.page = Math.min(options.page, Math.max(1, Math.ceil(rows.length / options.size)));
    return { options, total: rows.length, rows: rows.slice((options.page - 1) * options.size, options.page * options.size) };
}

function expand(template, prefix = 'directory') {
    let count = 0;
    const visit = (component) => ({ ...component, id: `${prefix}-${++count}`,
        props: structuredClone(component.props || {}), styles: structuredClone(component.styles || {}),
        children: (component.children || []).map(visit) });
    return visit(template);
}

const contacts = { whatsappUrl: 'https://wa.me/96550775711', email: 'counselor@studygram.me' };
const text = (value, className) => ({ type: 'Text', props: { text: directoryLiteral(value), className } });
const heading = (value, level = 'h2') => ({ type: 'Heading', props: { text: directoryLiteral(value), level } });
const link = (label, href, className) => ({ type: 'Link', props: { text: directoryLiteral(label), href, className } });
const group = (className, children, anchor) => ({ type: 'Container', props: { className, anchor }, children });
const card = row => ({ ...row, summary: row.summary === row.institution_title ? '' : row.summary,
    programCount: row.program_count, institutionTitle: row.institution_title });
function cards(rows) {
    return educationDirectoryTemplate({ listings: rows.map(card) }).children[2].children[2];
}
function pagination(url, s) {
    return group('directory-actions', [-1, 1].flatMap(delta => {
        if (delta < 0 && s.options.page === 1 || delta > 0 && s.options.page * s.options.size >= s.total) return [];
        const target = new URL(url); target.searchParams.set('page', String(s.options.page + delta));
        return [link(delta < 0 ? '← Previous' : 'Next →', target.pathname + target.search + (indexed.get(url.pathname)?.kind === 'institution' ? '#programs' : ''))];
    }));
}
function count(s) { return text(`${s.total.toLocaleString()} ${s.options.kind === 'all' ? s.total === 1 ? 'listing' : 'listings' : s.options.kind + (s.total === 1 ? '' : 's')} · page ${s.options.page} of ${Math.max(1, Math.ceil(s.total / s.options.size))}`, 'directory-count'); }
function home(url) {
    const s = selection(url);
    const template = educationDirectoryTemplate({ ...contacts, brand: s.options.brand, destination: 'the USA',
        heading: s.options.heading, introduction: s.options.introduction, listings: s.rows.map(row => ({ ...card(row), programCount: s.options.scope === 'wordpress' ? row.original_program_count : row.program_count })) });
    template.children[2].children[0] = heading(s.options.kind === 'institution' ? 'Explore USA institutions' : s.options.kind === 'program' ? 'Find your program' : 'Explore USA ' + (s.options.kind === 'all' ? 'listings' : s.options.kind + 's'));
    template.children[2].children[1] = text('Search by city or institution, then open a listing to explore its details.', 'directory-introduction');
    // Empty filters show a real empty state, rather than the builder's unbound Repeater.
    if (!s.rows.length) template.children[2].children[2].children = [{ type: 'Text', props: { text: 'No listings match these filters. Try another city or program.' } }];
    template.children[2].children.splice(2, 0, count(s));
    template.children[2].children.push(pagination(url, s));
    if (url.pathname === '/explore/') template.children.splice(1, 1, group('directory-search-heading', [text('USA EDUCATION DIRECTORY', 'directory-eyebrow'), heading('A place for your next chapter.', 'h1')]));
    return { title: 'Study in the USA | Studygram draft', slug: 'home', description: s.options.introduction,
        cssBundle: css, layout: { root: {}, content: [expand(template)] } };
}

function detail(row, url) {
    const literal = directoryLiteral;
    const s = selection(url, row);
    const institutions = (row.institution_paths || []).map(path => indexed.get(path)).filter(Boolean);
    const content = [{ type: 'Link', props: { text: '← Explore USA institutions', href: '/explore/?type=institution', className: 'directory-brand' } },
        { type: 'Text', props: { text: literal(row.kind + (row.city ? ' · ' + row.city : '')), className: 'directory-eyebrow' } },
        { type: 'Heading', props: { level: 'h1', text: literal(row.title) } },
        ...(row.kind === 'program' && institutions.length === 1 ? [link(institutions[0].title, institutions[0].path, 'directory-owner')] : []),
        ...(row.kind === 'institution' ? [group('directory-tabs', [link('Profile', '#profile'), link(`Programs (${s.total.toLocaleString()})`, '#programs')])] : []),
        ...(row.summary ? [{ type: 'Text', props: { text: literal(row.summary), className: 'directory-introduction' } }] : []),
        group('directory-facts', [
            ...(row.city ? [group('directory-fact', [text('City', 'directory-eyebrow'), row.city_path ? link(row.city, row.city_path) : text(row.city)])] : []),
            ...(row.degree ? [group('directory-fact', [text('Degree level', 'directory-eyebrow'), text(row.degree)])] : []),
            ...Object.entries(row.facts || {}).map(([label, value]) => group('directory-fact', [text(label, 'directory-eyebrow'), text(value)])),
            ...(row.intakes?.length ? [group('directory-fact', [text('Intakes', 'directory-eyebrow'), text(row.intakes.join(', '))])] : []),
        ]),
        heading(row.kind === 'institution' ? 'About the institution' : 'About this program'),
        ...(row.body ? [{ type: 'Text', props: { text: literal(row.body), className: 'directory-body' } }] : [
            { type: 'Text', props: { text: 'Detailed program information is pending reconciliation. Ask a counselor for current entry requirements and availability.' } },
        ]),
        ...(row.requirements ? [heading('Admission requirements'), text(row.requirements, 'directory-body')] : []),
        ...(row.origin === 'wordpress' ? [text('Recovered WordPress information. Fees, dates and requirements need confirmation before publication.', 'directory-note')] : []),
        ...(institutions.length && row.kind !== 'program' ? [{ type: 'Heading', props: { text: 'Related institutions', level: 'h2' } },
            ...institutions.map(institution => ({ type: 'Link', props: { text: literal(institution.title), href: institution.path } }))] : []),
        ...(['institution', 'city'].includes(row.kind) ? [group('directory-program-section', [heading('Programs at ' + row.title), count(s),
            ...(s.rows.length ? [cards(s.rows)] : [text('No programs match these filters.')]), pagination(url, s)], 'programs')] : []),
        { type: 'Container', props: { className: 'directory-actions' }, children: [
            { type: 'Link', props: { text: 'Chat on WhatsApp', href: contacts.whatsappUrl, className: 'directory-primary' } },
            { type: 'Link', props: { text: 'Email a counselor', href: `mailto:${contacts.email}`, className: 'directory-secondary' } },
        ] }];
    return { title: row.title, slug: row.path.slice(1, -1), description: row.summary,
        cssBundle: css, layout: { root: {}, content: [expand({ type: 'Container', props: { className: 'directory-detail', anchor: 'profile' }, children: content })] } };
}

// Local GET search adapter. Reusable cards/detail content remain engine components;
// production query bindings and the builder's filter authoring are still separate acceptance work.
function filters(url, parent = null) {
    const { options: o } = selection(url, parent);
    const opt = (value, label, selected) => `<option value="${html(value)}"${value === selected ? ' selected' : ''}>${html(label)}</option>`;
    const select = (label, key, values, empty) => `<label>${label}<select name="${key}">${opt('', empty, o[key])}${values.map(v => opt(v, v, o[key])).join('')}</select></label>`;
    const programs = data.rows.filter(r => r.kind === 'program' && (!parent || (parent.kind === 'city' ? r.city === parent.city : r.institution_path === parent.path)));
    const degrees = [...new Set(programs.map(r => r.degree).filter(Boolean))].sort();
    const intakes = [...new Set(programs.flatMap(r => r.intakes || []))].sort();
    const institutionControl = o.kind === 'program' && !parent ? `<label>Institution<select name="institution">${opt('', 'All institutions', o.institution)}${data.rows.filter(r => r.kind === 'institution').sort((a,b) => a.title.localeCompare(b.title)).map(r => opt(r.path, r.title, o.institution)).join('')}</select></label>` : '';
    const tabs = parent ? '' : `<nav class="directory-tabs" aria-label="Directory collection">${['institution', 'program', 'pathway'].map(k => {
        const target = new URL(url); target.pathname = '/explore/'; target.searchParams.delete('kind'); target.searchParams.set('type', k);
        for (const key of ['page', 'degree', 'intake', 'institution']) target.searchParams.delete(key);
        return `<a href="${html(target.pathname + target.search)}"${o.kind === k ? ' aria-current="page"' : ''}>${k === 'institution' ? 'Institutions' : k === 'program' ? 'Programs' : 'Pathways'}</a>`;
    }).join('')}</nav>`;
    return `${tabs}<form class="directory-filters" action="${html(url.pathname)}${parent ? '#programs' : ''}" method="get" aria-label="Filter directory"><input type="hidden" name="type" value="${html(o.kind)}"><input type="hidden" name="scope" value="${o.scope}"><input type="hidden" name="size" value="${o.size}"><label>Search<input name="q" value="${html(o.q)}" placeholder="Program or institution"></label>${parent ? '' : select('City', 'city', cities, 'All USA cities')}${institutionControl}${o.kind === 'program' ? select('Degree level', 'degree', degrees, 'All degree levels') + select('Intake', 'intake', intakes, 'All intakes') : ''}<label>Sort<select name="sort">${opt('name', 'Name A–Z', o.sort)}${opt('latest', 'Latest source update', o.sort)}</select></label><button type="submit">Search</button><a href="${html(url.pathname)}?type=${o.kind}&scope=${o.scope}${parent ? '#programs' : ''}">Clear filters</a></form>`;
}

function studio(url) {
    const s = selection(url);
    const input = (label, key, long = false) => `<label>${label}${long ? `<textarea name="${key}">${html(s.options[key])}</textarea>` : `<input name="${key}" value="${html(s.options[key])}">`}</label>`;
    const option = (name, current, label = name) => `<option value="${html(name)}"${name === current ? ' selected' : ''}>${html(label)}</option>`;
    const source = data.reconciliation.listing_matches;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>USA pilot · Frontbase draft studio</title><link rel="stylesheet" href="/__draft/style.css"></head><body class="studio"><header class="studio-header"><strong>Frontbase <span>USA pilot</span></strong><a href="/" target="_blank" rel="noopener">Open site preview ↗</a></header><main class="studio-layout"><aside><span class="studio-eyebrow">LOCAL DRAFT · SNAPSHOT DATA</span><h1>Build your USA directory</h1><p>Select the catalog, refine the collection and preview the site. Changes stay in this draft.</p><form id="controls" action="/__draft/" method="get"><section><h2>01 · Select data</h2><label>Database<input readonly value="Studygram DB · USA (country 22)"></label><label>Catalog scope<select name="scope">${option('expanded', s.options.scope, 'Expanded Supabase catalog + WordPress')}${option('wordpress', s.options.scope, 'Original WordPress listings')}</select></label><label>Collection<select name="kind">${option('all', s.options.kind, 'All listings')}${[...listingKinds].map(k => option(k, s.options.kind, k === 'city' ? 'Cities' : k[0].toUpperCase() + k.slice(1) + 's')).join('')}</select></label><label>City<select name="city">${option('', s.options.city, 'All USA cities')}${cities.map(c => option(c, s.options.city)).join('')}</select></label>${input('Search titles or institutions', 'q')}<label>Cards per page<select name="size">${[12, 24, 48].map(n => option(String(n), String(s.options.size))).join('')}</select></label></section><section><h2>02 · Shape the page</h2>${input('Brand', 'brand')}${input('Hero heading', 'heading')}${input('Introduction', 'introduction', true)}</section><button type="submit">Apply & preview</button></form><a id="export" class="studio-export" href="/__draft/layout.json${html(url.search)}" download="usa-directory-layout.json">Download Frontbase layout</a><section class="studio-preflight"><h2>03 · Publication preflight</h2><ul><li>✓ ${data.catalog_counts.programs.toLocaleString()} USA programs inventoried in Supabase</li><li>✓ 310 published WordPress listings preserved in private Supabase staging</li><li>✓ Original stored listing paths used by the draft</li><li>Review: ${source.institution.unmapped || 0} institution links, ${source.program.unmapped || 0} program URL gaps, ${source.pathway.unmapped || 0} pathways</li><li>Review: ${data.excluded_catalog_rows.length} catalog country/URL conflicts</li><li>Pending: media, full SEO, forms and final content reconciliation</li></ul><p>Production publication is blocked until reconciliation and route/SEO acceptance pass. The draft is noindex and listens only on this computer.</p><button disabled>Publish · checks pending</button></section><small>WordPress snapshot: ${html(data.captured_at)}<br>Supabase snapshot: ${html(data.supabase_captured_at)}<br>No live connection or database keys in this preview.</small></aside><section class="studio-preview"><div class="preview-toolbar"><span id="preview-count">${s.total.toLocaleString()} selected listings</span><span>Desktop / responsive preview</span></div><iframe id="preview" title="Frontbase USA site preview" src="/${html(url.search)}"></iframe></section></main><script src="/__draft/studio.js" defer></script></body></html>`;
}

const manifest = { version: 'usa-local-draft-1', queries: {}, pages: {} };
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'builder',
    resolvePublishedPage: async (path, request) => path === '/' || path === '/explore/' ? home(new URL(request.url)) : indexed.has(path) ? detail(indexed.get(path), new URL(request.url)) : null });
const security = { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'" };
const server = createServer(async (req, res) => {
    try {
        for (const [key, value] of Object.entries(security)) res.setHeader(key, value);
        if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403); return res.end('Unsupported host'); }
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { allow: 'GET, HEAD' }); return res.end(); }
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        let body, type = 'text/html; charset=utf-8', status = 200;
        if (url.pathname === '/__draft/' || url.pathname === '/__draft') body = studio(url);
        else if (url.pathname === '/__draft/style.css') { body = css; type = 'text/css; charset=utf-8'; }
        else if (url.pathname === '/__draft/studio.js') { body = studioScript; type = 'text/javascript; charset=utf-8'; }
        else if (url.pathname === '/__draft/layout.json') { body = JSON.stringify({ ...home(url), draftDataSelection: selection(url).options, publicationApproved: false }, null, 2); type = 'application/json'; }
        else if (url.pathname === '/__draft/status.json') { body = JSON.stringify({ catalog: data.catalog_counts, reconciliation: data.reconciliation, selected: selection(url).total, exclusions: data.excluded_catalog_rows, localDraft: true }); type = 'application/json'; }
        else if (url.pathname === '/robots.txt') { body = 'User-agent: *\nDisallow: /\n'; type = 'text/plain'; }
        else if (url.pathname === '/static/react/hydrate.js') { body = '// Static local preview; no database hydration or keys.\n'; type = 'text/javascript'; }
        else {
            const response = await engine.fetch(new Request(url));
            body = await response.text(); status = response.status; type = response.headers.get('content-type') || type;
            if (type.includes('text/html')) {
                body = body.replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">');
                const row = indexed.get(url.pathname);
                const anchor = ['institution', 'city'].includes(row?.kind) ? 'programs' : ['/', '/explore/'].includes(url.pathname) ? 'directory' : null;
                if (anchor) body = body.replace(new RegExp(`(<div\\b[^>]*\\bid="${anchor}"[^>]*>)`), (_, opening) => opening + filters(url, row && row.kind !== 'page' ? row : null));
            }
        }
        res.writeHead(status, { 'content-type': type });
        res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
        console.error('Local pilot error:', error);
        res.writeHead(500, { 'content-type': 'text/plain' }); res.end('Local draft error');
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Frontbase USA draft: http://127.0.0.1:${port}/__draft/`));
