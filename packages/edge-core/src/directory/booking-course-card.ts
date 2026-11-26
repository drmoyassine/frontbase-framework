import { serializeCondition } from '../conditions.js';
import type { PageComponent, PageLayoutData } from '../ssr/types.js';

/** A normal Builder subtree for both directory and Saved View repeaters. */
export function createBookingCourseCard(id: string, savedView = false): PageComponent {
    const node = (key: string, type: string, props: Record<string, unknown>, styles: PageComponent['styles'] = {}, children?: PageComponent[]): PageComponent =>
        ({ id: key ? id + '-' + key : id, type, props, styles, ...(children ? { children } : {}) });
    const bind = (property: string, field: string, options = {}) => savedView
        ? { [property]: '{{ record.' + field + ' }}' }
        : { recordBindings: { [property]: field, ...options } };
    const present = (field: string) => serializeCondition({ left: { kind: 'variable', path: 'record.' + field }, operator: 'is_set' });
    const muted = { color: '#475569', fontSize: '0.875rem', overflowWrap: 'anywhere' };
    const row = { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 6px', minWidth: '0' };
    const text = (field: string, label: string, styles: PageComponent['styles'] = muted, format?: 'number') => ({
        ...node(field, 'Text', { _layerName: label, text: '', ...bind('text', field, { hideWhenEmpty: true, ...(format ? { format } : {}) }) }, styles),
        ...(savedView ? { visibilityCondition: present(field) } : {}),
    });
    const fact = (field: string, label: string, values: PageComponent[]) => ({
        ...node(field + '-fact', 'Container', {
            _layerName: label, ...(!savedView ? { recordBindings: { sectionText: field } } : {}),
        }, row, [node(field + '-label', 'Text', { text: label }, { ...muted, fontWeight: '600' }), ...values]),
        ...(savedView ? { visibilityCondition: present(field) } : {}),
    });
    const logo = node('logo', 'Image', {
        _layerName: 'Institution logo', src: '', alt: '', width: '44px', height: '44px', objectFit: 'contain',
        ...bind('src', 'logo', { hideWhenEmpty: true }),
    }, { flexShrink: '0', borderRadius: '6px' });
    const intakes = node('intakes', 'Badge', {
        _layerName: 'Intake badges', text: '', variant: 'outline', splitValues: true, valueSeparator: ',',
        ...bind('text', 'intakes', { hideWhenEmpty: true }),
    });
    return node('', 'Container', { _layerName: 'Course card' }, {
        display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0', height: '100%',
        padding: '18px', border: '1px solid #dbe2ea', borderTop: '4px solid var(--fb-template-primary, #123052)',
        borderRadius: '12px', backgroundColor: '#ffffff', color: '#0f172a', boxShadow: '0 2px 6px #0f172a0a',
    }, [
        node('title', 'Link', {
            _layerName: 'Course title and link', text: 'Course', href: '',
            ...(savedView ? { ...bind('text', 'title'), ...bind('href', 'originalPath') } : { recordBindings: { text: 'title', href: 'originalPath' } }),
        }, { fontSize: '1.125rem', fontWeight: '700', lineHeight: '1.35', overflowWrap: 'anywhere', color: '#123052' }),
        node('institution', 'Container', { _layerName: 'Institution and location' }, { ...row, alignItems: 'center', gap: '10px' }, [
            { ...logo, ...(savedView ? { visibilityCondition: present('logo') } : {}) },
            node('identity', 'Container', {}, { flex: '1 1 120px', minWidth: '0' }, [
                text('institutionName', 'Institution name', { ...muted, fontWeight: '600' }),
                node('location', 'Container', { _layerName: 'City and country' }, row, [
                    { ...text('location', 'City'), id: id + '-city' }, text('country', 'Country'),
                ]),
            ]),
        ]),
        fact('degree', 'Degree', [text('degree', 'Degree')]),
        fact('duration', 'Duration', [text('duration', 'Duration'), text('durationUnit', 'Duration unit')]),
        fact('tuition', 'Tuition', [text('tuition', 'Tuition', muted, 'number'), text('currency', 'Currency')]),
        fact('intakes', 'Intakes', [intakes]),
    ]);
}

/** Preview the card upgrade in the Builder draft while retaining the installed queries and versions. */
export function upgradeBookingCourseCards(layout: PageLayoutData): PageLayoutData | undefined {
    const marker = layout.root?.bookingForX as { version?: number; role?: string } | undefined;
    if (marker?.version !== 1 || !['home', 'directory', 'institution'].includes(marker.role ?? '')) return;
    let changed = false;
    const replace = (children: PageComponent[] | undefined, types: string[], savedView = false) => {
        const card = children?.[0];
        if (!card || children?.length !== 1 || card.type !== 'Container' || card.versions?.length
            || card.children?.map(node => node.type).join() !== types.join()) return children;
        changed = true;
        return [createBookingCourseCard(card.id, savedView)];
    };
    const walk = (nodes: PageComponent[]): PageComponent[] => nodes.map(node => {
        if (node.type === 'Repeater') {
            const query = node.props?.directoryQuery as { queryId?: string } | undefined;
            if (query?.queryId === 'directory.program.list') {
                const types = marker.role === 'home' ? ['Image', 'Heading', 'Text', 'Link'] : ['Link', 'Paragraph'];
                return { ...node, children: replace(node.children, types) };
            }
            if (marker.role === 'directory' && node.versions?.length) {
                return { ...node, versions: node.versions.map(version => {
                    if (version.id !== 'programs') return version;
                    const children = replace(version.overrides.children, ['Image', 'Heading', 'Paragraph', 'Link'], true);
                    return children === version.overrides.children ? version : { ...version, overrides: { ...version.overrides, children } };
                }) };
            }
        }
        return node.children ? { ...node, children: walk(node.children) } : node;
    });
    const content = walk(layout.content);
    return changed ? { ...layout, content } : undefined;
}
