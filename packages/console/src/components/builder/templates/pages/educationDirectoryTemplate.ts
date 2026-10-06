import type { ComponentTemplate } from '../types';

export interface EducationListing {
    title: string;
    path: string;
    kind: string;
    city?: string;
    summary?: string;
    programCount?: number;
    institutionTitle?: string;
    degree?: string;
    cover?: string;
    coverAlt?: string;
}

export interface EducationDirectoryOptions {
    brand?: string;
    destination?: string;
    heading?: string;
    introduction?: string;
    whatsappUrl?: string;
    email?: string;
    listings?: EducationListing[];
    directoryPath?: string;
}

// Imported text must stay text: never interpret source content as Liquid code.
export function directoryLiteral(value: string): string {
    return value.replace(/\{(?=[{%])/g, '{\u200b');
}

const text = (value: string, className?: string): ComponentTemplate => ({
    type: 'Text', props: { text: directoryLiteral(value), className },
});
const link = (label: string, href: string, className?: string): ComponentTemplate => ({
    type: 'Link', props: { text: directoryLiteral(label), href, className },
});

/** Public image reference rendered through the existing editable Image primitive. */
export function directoryCoverImage(src: string | undefined, alt: string, height = '200px'): ComponentTemplate | null {
    if (!src || /[{}\x00-\x20\\]/.test(src)) return null;
    try {
        const url = new URL(src);
        if (url.protocol !== 'https:' || url.username || url.password || /[{}\x00-\x20\\]/.test(decodeURIComponent(src))) return null;
    } catch { return null; }
    return { type: 'Image', props: { src, alt: directoryLiteral(alt), width: '100%', height, objectFit: 'contain', borderRadius: '10px', className: 'directory-cover' } };
}

/** Editable primitives; data/query ownership stays with the consumer project. */
export function educationDirectoryTemplate(options: EducationDirectoryOptions = {}): ComponentTemplate {
    const destination = options.destination || 'your next destination';
    const directoryPath = options.directoryPath || '/explore/';
    const decodedDirectoryPath = decodeURIComponent(directoryPath);
    if (!directoryPath.startsWith('/') || directoryPath.startsWith('//') || /[\\?#\s]/.test(directoryPath)
        || decodedDirectoryPath.startsWith('//') || /[\\?#{}\x00-\x20]/.test(decodedDirectoryPath) || decodedDirectoryPath.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid directory index path');
    const contacts: ComponentTemplate[] = [];
    if (options.whatsappUrl && /^https:\/\/wa\.me\/[0-9]+$/.test(options.whatsappUrl)) {
        contacts.push(link('Chat on WhatsApp', options.whatsappUrl, 'directory-primary'));
    }
    if (options.email && /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(options.email)) {
        contacts.push(link('Email a counselor', `mailto:${options.email}`, 'directory-secondary'));
    }
    const cards = (options.listings || []).map((record): ComponentTemplate => {
        const decodedPath = decodeURIComponent(record.path);
        if (!record.path.startsWith('/') || record.path.startsWith('//') || /[\\?#\s]/.test(record.path)
            || /[\\\x00-\x1f]/.test(decodedPath) || decodedPath.split('/').some(segment => segment === '.' || segment === '..')) {
            throw new Error('Directory links require a reviewed local path');
        }
        const cover = directoryCoverImage(record.cover, record.coverAlt || record.title);
        return {
            type: 'Container', props: { className: 'directory-card' },
            styles: { display: 'flex', flexDirection: 'column', gap: '16px', padding: '28px', border: '1px solid #d6e0d8', borderRadius: '15px', backgroundColor: '#ffffff' },
            children: [
                text(record.kind, 'directory-eyebrow'),
                ...(cover ? [cover] : []),
                { type: 'Heading', props: { text: directoryLiteral(record.title), level: 'h3' } },
                text(record.city || 'Location to be confirmed', 'directory-location'),
                ...(record.kind === 'institution' && record.programCount !== undefined
                    ? [text(record.programCount === 0 ? 'No linked programs yet' : `${record.programCount.toLocaleString()} ${record.programCount === 1 ? 'program' : 'programs'}`, 'directory-program-count')] : []),
                ...(record.institutionTitle ? [text(record.institutionTitle, 'directory-owner')] : []),
                ...(record.degree ? [text(record.degree, 'directory-location')] : []),
                ...(record.summary ? [text(record.summary, 'directory-summary')] : []),
                link(record.kind === 'institution' ? 'View institution & programs →' : record.kind === 'program' ? 'View program →' : 'Explore this listing →', record.path, 'directory-card-link'),
            ],
        };
    });
    return {
        type: 'Container', props: { className: 'education-directory', templateId: 'education-directory' },
        styles: { backgroundColor: '#f5f7f4', color: '#153b35', minHeight: '100vh' },
        children: [
            { type: 'Container', props: { className: 'directory-nav' }, children: [
                link(options.brand || 'Study directory', '/', 'directory-brand'),
                link('Institutions', directoryPath + '?type=institution', 'directory-nav-link'),
                link('Programs', directoryPath + '?type=program', 'directory-nav-link'),
                ...(contacts.length ? [contacts[0]] : []),
            ], styles: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '24px', padding: '24px 40px' } },
            { type: 'Container', props: { className: 'directory-hero' }, children: [
                text(`STUDY IN ${destination.toUpperCase()}`, 'directory-eyebrow'),
                { type: 'Heading', props: { level: 'h1', text: directoryLiteral(options.heading || `A clearer path to studying in ${destination}.`) } },
                text(options.introduction || 'Explore institutions and programs, compare your options, and talk to a counselor about your next step.', 'directory-introduction'),
                { type: 'Container', props: { className: 'directory-actions' }, children: [link('Explore institutions', directoryPath + '?type=institution', 'directory-primary'), link('Find a program', directoryPath + '?type=program', 'directory-secondary')] },
            ], styles: { padding: '64px 32px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#e9f0e8' } },
            { type: 'Container', props: { className: 'directory-section', anchor: 'directory' }, styles: { padding: '48px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }, children: [
                { type: 'Heading', props: { level: 'h2', text: 'Find your institution' } },
                text('Choose a city, explore institutions and discover their programs.', 'directory-introduction'),
                { type: 'Container', props: { className: 'directory-grid' }, styles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '24px' }, children: cards.length ? cards : [
                    text('Connect a collection to add your listings. The Repeater data controls select the datasource, table, fields and filters.'),
                    { type: 'Repeater', props: { layout: 'grid', columns: 3, gap: '24px' }, children: [
                        { type: 'Container', props: { className: 'directory-card' }, children: [
                            { type: 'Heading', props: { text: '{{ record.program_name }}', level: 'h3' } },
                            { type: 'Text', props: { text: '{{ record.institution_name }}' } },
                            { type: 'Text', props: { text: '{{ record.city_name }}' } },
                        ] },
                    ] },
                ] },
            ] },
            { type: 'Container', props: { className: 'directory-guidance' }, styles: { padding: '40px', display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#e2ebe2' }, children: [
                { type: 'Heading', props: { text: 'You do not have to figure it out alone.', level: 'h2' } },
                text('Talk through your goals, entry requirements and application options with a counselor.'),
                { type: 'Container', props: { className: 'directory-actions' }, children: contacts },
            ] },
        ],
    };
}
