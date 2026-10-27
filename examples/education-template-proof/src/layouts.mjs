/**
 * Synthetic education-directory template layouts (workstream B prototype).
 *
 * These mirror the editable-node grammar the framework already enforces
 * (directoryQuery / recordBindings / siteBindings on existing primitives).
 * Node ids are deterministic (`tpl-*`) so an upgrade can tell template-owned
 * nodes from owner-added or owner-customized ones. Nothing here is fetched
 * data, a credential, or a first-swarm generator edit: this file is example
 * tooling that produces a proposed artifact input.
 */

const query = (queryId, params = {}) => ({ version: 1, queryId, params });

const coverImage = (id, altField = 'title') => ({
    id,
    type: 'Image',
    props: { src: '', alt: '', width: '100%', height: '180px', objectFit: 'cover', borderRadius: '12px', recordBindings: { src: 'cover', alt: altField, hideWhenEmpty: true } },
});

const card = (prefix, extraText = 'summary') => ({
    id: `${prefix}-card`,
    type: 'Container',
    props: { className: 'directory-card', templateNodeId: `${prefix}-card` },
    styles: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', border: '1px solid #dbe2ea', borderRadius: '16px' },
    children: [
        coverImage(`${prefix}-cover`),
        { id: `${prefix}-title`, type: 'Heading', props: { text: 'Record title', level: '3', templateNodeId: `${prefix}-title`, recordBindings: { text: 'title' } } },
        { id: `${prefix}-summary`, type: 'Paragraph', props: { text: 'Record description', templateNodeId: `${prefix}-summary`, recordBindings: { text: extraText } } },
        { id: `${prefix}-link`, type: 'Link', props: { text: 'View details', href: '', templateNodeId: `${prefix}-link`, recordBindings: { href: 'originalPath' } } },
    ],
});

const repeater = (prefix, queryId) => ({
    id: `${prefix}-list`,
    type: 'Repeater',
    props: { columns: 3, layout: 'grid', templateNodeId: `${prefix}-list`, directoryQuery: query(queryId) },
    children: [card(prefix)],
});

/** Directory index: site bindings + institution/program card lists. */
function directoryLayout(version) {
    const headingText = version >= 2 ? 'Find your institution or program' : 'Find your institution';
    const cardRadius = version >= 2 ? '18px' : '16px';
    const institutions = repeater('tpl-directory-institution', 'directory.institution.list');
    const programs = repeater('tpl-directory-program', 'directory.program.list');
    for (const list of [institutions, programs]) list.children[0].styles.borderRadius = cardRadius;
    return {
        root: { siteConfiguration: { version: 1, role: 'directory' } },
        content: [
            { id: 'tpl-directory-site-name', type: 'Text', props: { text: 'Site name', templateNodeId: 'tpl-directory-site-name', siteBindings: { text: 'site.name' } } },
            { id: 'tpl-directory-heading', type: 'Heading', props: { text: headingText, level: '2', templateNodeId: 'tpl-directory-heading' } },
            institutions,
            programs,
            ...(version >= 2 ? [{ id: 'tpl-directory-footer-note', type: 'Text', props: { text: 'Updated directory footer (template v2)', templateNodeId: 'tpl-directory-footer-note' } }] : []),
        ],
    };
}

/** Detail page for one role via its preserved original path. */
function detailLayout(role, queryId, samplePath, opts = {}) {
    const prefix = `tpl-${role}`;
    const editorial = Boolean(opts.editorial);
    const children = [
        coverImage(`${prefix}-cover`, editorial ? 'coverAlt' : 'title'),
        { id: `${prefix}-title`, type: 'Heading', props: { text: 'Record title', level: '1', templateNodeId: `${prefix}-title`, recordBindings: { text: 'title' } } },
    ];
    if (editorial) {
        children.push(
            { id: `${prefix}-byline`, type: 'Paragraph', props: { text: 'Byline', templateNodeId: `${prefix}-byline`, recordBindings: { text: 'byline' } } },
            { id: `${prefix}-published`, type: 'Paragraph', props: { text: 'Published', templateNodeId: `${prefix}-published`, recordBindings: { text: 'publishedAt' } } },
        );
    }
    children.push(
        editorial
            ? { id: `${prefix}-body`, type: 'Container', props: { templateNodeId: `${prefix}-body`, recordBindings: { blocks: 'body' } } }
            : { id: `${prefix}-body`, type: 'Paragraph', props: { text: 'Record body', templateNodeId: `${prefix}-body`, recordBindings: { text: 'body' } } },
    );
    return {
        root: { siteConfiguration: { version: 1, role } },
        content: [{
            id: `${prefix}-detail`,
            type: 'Container',
            props: { templateNodeId: `${prefix}-detail`, directoryQuery: query(queryId, { path: samplePath }) },
            children,
        }],
    };
}

/** Article index: editorial cards with byline/date bindings. */
function articleIndexLayout() {
    const prefix = 'tpl-article-index';
    return {
        root: { siteConfiguration: { version: 1, role: 'article-index' } },
        content: [{
            id: `${prefix}-list`,
            type: 'Repeater',
            props: { columns: 3, layout: 'grid', templateNodeId: `${prefix}-list`, directoryQuery: query('directory.article.list') },
            children: [{
                id: `${prefix}-card`,
                type: 'Container',
                props: { className: 'directory-card', templateNodeId: `${prefix}-card` },
                children: [
                    coverImage(`${prefix}-cover`, 'coverAlt'),
                    { id: `${prefix}-title`, type: 'Heading', props: { text: 'Record title', level: '3', templateNodeId: `${prefix}-title`, recordBindings: { text: 'title' } } },
                    { id: `${prefix}-byline`, type: 'Paragraph', props: { text: 'Byline', templateNodeId: `${prefix}-byline`, recordBindings: { text: 'byline' } } },
                    { id: `${prefix}-link`, type: 'Link', props: { text: 'Read article', href: '', templateNodeId: `${prefix}-link`, recordBindings: { href: 'originalPath' } } },
                ],
            }],
        }],
    };
}

/** The five role layouts a template artifact carries. */
export function templateLayouts(version = 1, detailSamplePaths = { institution: '/institution-sample/', program: '/program-sample/', article: '/blog/sample/' }) {
    return [
        { role: 'directory', slug: 'explore', name: 'Directory index', layout: directoryLayout(version) },
        { role: 'institution', slug: 'institutions', name: 'Institution detail', layout: detailLayout('institution', 'directory.institution.detail', detailSamplePaths.institution) },
        { role: 'program', slug: 'programs', name: 'Program detail', layout: detailLayout('program', 'directory.program.detail', detailSamplePaths.program) },
        { role: 'article-index', slug: 'blog', name: 'Article index', layout: articleIndexLayout() },
        { role: 'article', slug: 'articles', name: 'Article detail', layout: detailLayout('article', 'directory.article.detail', detailSamplePaths.article, { editorial: true }) },
    ];
}

/** Configuration defaults a fresh destination starts from (destination rebinds identity/tables). */
export function templateConfigurationDefaults() {
    const fields = (extra = {}) => ({
        id: 'id', title: 'title', originalPath: 'original_path', summary: 'summary', body: 'body', cover: 'cover', logo: '', gallery: '', cityId: '', institutionId: '',
        contentRole: '', sourceOrigin: '', byline: '', publishedAt: '', coverAlt: '', ...extra,
    });
    return {
        version: 1,
        template: 'education-directory',
        site: { name: '', destination: '', origin: '', locale: 'en' },
        datasourceId: '',
        collections: {
            institution: { table: 'education_institutions', fields: fields({ cityId: 'city' }), scope: { field: 'country', value: '' } },
            program: { table: 'education_programs', fields: fields({ institutionId: 'institution' }), scope: { field: 'country', value: '' } },
            city: { table: 'education_cities', fields: { id: 'id', title: 'title', originalPath: '', summary: '', body: '', cover: '', logo: '', gallery: '', cityId: '', institutionId: '', contentRole: '', sourceOrigin: '', byline: '', publishedAt: '', coverAlt: '' }, scope: { field: 'country', value: '' } },
            article: { table: '', fields: fields({ summary: '', contentRole: 'kind', sourceOrigin: 'origin', byline: 'byline', publishedAt: 'published_at', coverAlt: 'cover_alt' }), scope: { field: 'country', value: '' } },
            pathway: { table: '', fields: fields(), scope: { field: 'country', value: '' } },
        },
        browsing: { defaultCollection: 'institution', pageSize: 12, search: true, cityFilter: true, degreeFilter: true, intakeFilter: true, sort: 'name' },
        routes: { directory: '/explore/', blog: '/blog/', preserveOriginalPaths: true },
        contacts: { email: '', whatsapp: '' },
    };
}
