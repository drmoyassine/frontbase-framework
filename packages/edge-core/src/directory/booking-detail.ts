import { serializeCondition } from '../conditions.js';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';
import { directoryQueryBindingSchema } from './bindings.js';
import { detailFieldLabels, type DetailTextField } from './detail-fields.js';

type DetailRole = 'institution' | 'program';
const previewPath = '/preview-record/';

function bookingDetail(role: DetailRole, sourcePath = previewPath, prior?: PageComponent): PageComponent[] {
    const prefix = 'bfx-' + role + '-';
    const node = (id: string, type: string, props: Record<string, unknown>, styles: PageComponent['styles'] = {}, children?: PageComponent[]): PageComponent => ({
        id: prefix + id, type, props, styles, ...(children ? { children } : {}),
    });
    const query = (id: string, collection: DetailRole, children: PageComponent[]) => node(id, 'Container', {
        directoryQuery: directoryQueryBindingSchema.parse({ version: 1, queryId: 'directory.' + collection + '.detail', params: { path: sourcePath } }),
        hideWhenNoRecords: true,
    }, { minWidth: '0' }, children);
    const stack = { display: 'flex', flexDirection: 'column' };
    const panel = { ...stack, gap: '16px', boxSizing: 'border-box', minWidth: '0', padding: 'clamp(16px, 3vw, 28px)', backgroundColor: '#ffffff', border: '1px solid #dbe2ea', borderRadius: '16px' };
    const labelStyle = { margin: '0', fontSize: '1.25rem', lineHeight: '1.35', overflowWrap: 'anywhere' };
    const isInstitution = role === 'institution';
    const boundText = (id: string, field: DetailTextField, styles: PageComponent['styles'] = {}) =>
        node(id, 'Text', { text: '', recordBindings: { text: field }, _layerName: detailFieldLabels[field] },
            { overflowWrap: 'anywhere', ...styles });
    const fact = (field: DetailTextField, unit?: DetailTextField) => node('fact-' + field, 'Container', {
        _layerName: detailFieldLabels[field], recordBindings: { sectionText: field },
    }, { ...stack, gap: '4px', width: 'auto', minWidth: '0' }, [
        node('label-' + field, 'Text', { text: detailFieldLabels[field] }, { fontSize: '0.875rem', color: '#475569' }),
        node('value-' + field, 'Container', {}, { display: 'flex', flexWrap: 'wrap', gap: '6px', fontWeight: '600' },
            [boundText(field, field), ...(unit ? [boundText(unit, unit)] : [])]),
    ]);
    const section = (field: DetailTextField) => node('section-' + field, 'Container', {
        _layerName: detailFieldLabels[field], recordBindings: { sectionText: field },
    }, panel, [
        node('heading-' + field, 'Heading', { text: detailFieldLabels[field], level: '2' }, labelStyle),
        boundText('text-' + field, field, { lineHeight: '1.75', whiteSpace: 'pre-wrap' }),
    ]);
    const action = node('action', 'Link', { text: isInstitution ? 'Book consultation' : 'Apply',
        href: '{{ page.settings.ctaHref }}', underline: false, _layerName: 'Primary action' },
    { display: 'inline-block', inlineSize: 'fit-content', maxInlineSize: '100%', padding: '12px 20px', borderRadius: '10px', backgroundColor: '#123052', color: '#ffffff', fontWeight: '600', overflowWrap: 'anywhere' });
    action.visibilityCondition = serializeCondition({ left: { kind: 'variable', path: 'page.settings.ctaHref' }, operator: 'is_set' });
    const browse = node('browse-programs', 'Link', { text: 'Browse programs', href: '#' + prefix + 'related', underline: false,
        directoryResultsFor: prefix + 'related', _layerName: 'Browse programs' }, action.styles);
    if (isInstitution) action.styles = { ...action.styles, color: '#123052', backgroundColor: '#eef4fa' };
    const defaultCover = node('3', 'Gallery', { coverSrc: '', media: [], coverHeight: 350, radius: 16, hideWhenUnavailable: true,
        _layerName: 'Cover and gallery', recordBindings: { src: 'cover', alt: 'coverAlt', altFallback: 'title', media: 'gallery' } }, { minWidth: '0' });
    const defaultTitle = node('4', 'Heading', { level: '1', text: 'Record title', recordBindings: { text: 'title' } },
        { margin: '0', fontSize: 'clamp(1.75rem, 4vw, 3rem)', lineHeight: '1.18', overflowWrap: 'anywhere' });
    const defaultBody = node('5', 'Paragraph', { text: 'Record description', recordBindings: { text: 'body', fallbackText: 'summary' } },
        { margin: '0', lineHeight: '1.75', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    const [oldCover, oldTitle, oldBody] = prior?.children?.[0]?.children ?? [];
    const cover = oldCover ? { ...defaultCover, ...oldCover, styles: { ...defaultCover.styles, ...oldCover.styles } } : defaultCover;
    const title = oldTitle ? { ...oldTitle, styles: { ...defaultTitle.styles, ...oldTitle.styles } } : defaultTitle;
    const body = oldBody ? { ...oldBody, props: { ...oldBody.props, recordBindings: defaultBody.props!.recordBindings }, styles: { ...defaultBody.styles, ...oldBody.styles } } : defaultBody;
    const identity = node('identity', 'Container', { _layerName: 'Record identity' },
        { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', minWidth: '0', width: 'auto', flex: '1 1 360px' }, [
            node('logo', 'Image', { src: '', alt: '', width: '64px', height: '64px', objectFit: 'contain',
                recordBindings: { src: 'logo', hideWhenEmpty: true }, _layerName: 'Record logo' },
            { width: '64px', height: '64px', flexShrink: '0', padding: '4px', borderRadius: '12px' }),
            node('title-group', 'Container', {}, { flex: '1 1 220px', minWidth: '0' }, [
                title, boundText('subtitle', isInstitution ? 'tagline' : 'institutionName', { color: '#475569' }),
            ]),
        ]);
    const header = node('header', 'Container', { _layerName: 'Identity and primary action' },
        { ...panel, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }, [
        identity,
        node('header-facts', 'Container', { _layerName: 'Key facts and action' },
            { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'clamp(12px, 2vw, 22px)', minWidth: '0', width: 'auto', flex: '0 1 auto' },
            isInstitution ? [fact('location'), fact('institutionType'), browse, action] : [
                fact('degree'), fact('duration', 'durationUnit'),
                node('priced-tuition', 'Container', { _layerName: 'Tuition with currency', recordBindings: { sectionText: 'currency' } }, { width: 'auto' }, [fact('tuition', 'currency')]),
                action,
            ]),
    ]);
    const overview = node('overview', 'Container', { _layerName: isInstitution ? 'About' : 'Overview',
        recordBindings: { sectionText: 'body', fallbackText: 'summary' } }, { ...panel, flex: '2 1 500px', width: 'auto' }, [
        node('overview-title', 'Heading', { text: isInstitution ? 'About' : 'Overview', level: '2' }, labelStyle),
        { ...body, styles: { ...body.styles, maxWidth: '75ch' } },
    ]);
    const secondary = section(isInstitution ? 'address' : 'intakes');
    secondary.styles = { ...secondary.styles, flex: '1 1 230px', width: 'auto' };
    const detail = query('1', role, [node('2', 'Container', { ...prior?.children?.[0]?.props, _layerName: 'Detail layout' },
        { ...stack, minWidth: '0', gap: 'clamp(14px, 2.5vw, 24px)' }, [
            cover, header, node('sections', 'Container', { _layerName: 'Detail sections' },
                { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 'clamp(16px, 3vw, 28px)', minWidth: '0' }, [overview, secondary]),
            ...(isInstitution ? [
                section('highlights'), fact('founded'),
                node('website', 'Link', { text: 'Visit the institution website', href: '', recordBindings: { href: 'website', hideWhenEmpty: true } },
                    { fontWeight: '600', overflowWrap: 'anywhere' }),
            ] : [section('requirements'), section('curriculum'), section('careers'), section('funding')]),
        ])]);
    if (prior) detail.props = { ...prior.props, ...detail.props };

    const related = isInstitution
        ? node('related', 'Repeater', { _layerName: 'Programs at this institution', directoryQuery: {
            version: 1, queryId: 'directory.program.list', params: { limit: 12 },
        }, hideWhenNoRecords: true, layout: 'grid', columns: 3 }, { minWidth: '0' }, [
            node('program-card', 'Container', {}, panel, [
                node('program-link', 'Link', { text: 'Program', href: '', recordBindings: { text: 'title', href: 'originalPath' } }, { ...labelStyle, fontWeight: '700' }),
                node('program-summary', 'Paragraph', { text: '', recordBindings: { text: 'summary' } }, { margin: '0', lineHeight: '1.6', overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: '3', overflow: 'hidden' }),
            ]),
        ])
        : query('related', 'institution', [
            node('institution-panel', 'Container', { _layerName: 'Offered by' }, panel, [
                node('institution-heading', 'Heading', { text: 'Offered by', level: '2' }, labelStyle),
                node('institution-link', 'Link', { text: 'Institution', href: '', recordBindings: { text: 'title', href: 'originalPath' } }, { overflowWrap: 'anywhere', fontWeight: '700' }),
            ]),
        ]);
    return [node('page', 'Container', { _layerName: isInstitution ? 'Institution detail' : 'Program detail' },
        { ...stack, width: '100%', maxWidth: '1160px', boxSizing: 'border-box', minWidth: '0', margin: '0 auto', padding: 'clamp(16px, 4vw, 44px)', gap: 'clamp(16px, 3vw, 28px)', textAlign: 'start' }, [
            detail, ...(isInstitution ? [node('programs-heading', 'Heading', { text: 'Programs at this institution', level: '2',
                directoryResultsFor: related.id }, labelStyle)] : []), related,
        ])];
}

export function createBookingDetail(role: DetailRole): PageComponent[] {
    return bookingDetail(role);
}

/** Upgrade only the installed starter shape. Preserve other top-level authored blocks and the
 * record fields' IDs. A rebuilt or extended detail card needs an ordinary manual edit. */
export function upgradeBookingDetail(layout: PageLayoutData): PageLayoutData | undefined {
    const marker = layout.root?.bookingForX as { version?: number; role?: string } | undefined;
    const role = marker?.role;
    if (marker?.version !== 1 || (role !== 'institution' && role !== 'program')) return;
    const prefix = 'bfx-' + role + '-';
    const old = layout.content.find(node => node.id === prefix + '1');
    if (!old || old.type !== 'Container' || old.binding || old.versions?.length || old.visibilityCondition ||
        layout.content.some(node => node.id === prefix + 'page') || old.children?.length !== 1) return;
    const query = directoryQueryBindingSchema.safeParse(old.props?.directoryQuery);
    if (!query.success || query.data.queryId !== ('directory.' + role + '.detail') || !('path' in query.data.params)) return;
    const card = old.children[0]!;
    if (card.id !== prefix + '2' || card.type !== 'Container' || card.versions?.length || card.binding || card.visibilityCondition ||
        card.children?.length !== 3 || !card.children.every((child, index) =>
            child.id === prefix + (index + 3) && child.type === ['Image', 'Heading', 'Paragraph'][index] && !child.children?.length)) return;
    const bodyBinding = card.children[2]!.props?.recordBindings;
    if (JSON.stringify(bodyBinding) !== '{"text":"body"}') return;
    const replacement = bookingDetail(role, query.data.params.path, old);
    return { ...layout, content: layout.content.flatMap(node => node === old ? replacement : [node]) };
}
