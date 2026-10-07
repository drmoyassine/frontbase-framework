/**
 * Workstream C (swarm2, quality-usability) — deterministic synthetic dataset.
 *
 * Every value below is invented fixture data for an ephemeral local SQLite
 * database. Nothing here is real pilot content: no canonical row, credential,
 * recovered asset URL or production identifier is used. Media URLs point at the
 * reserved fixture origin `https://media.fixture.test/...`, which the test
 * run intercepts in the browser (nothing is ever fetched from the network).
 *
 * Shape constraints mirror the publication v1 capture contract: at most 48
 * records per collection, 1 MiB serialized artifact, 7 templates, HTTPS raster
 * media URLs, original WordPress-style public paths.
 */

export const TENANT = '_root';
export const ADMIN = {
    email: process.env.PILOT_QUALITY_ADMIN_EMAIL ?? 'quality-fixture@example.invalid',
    password: process.env.PILOT_QUALITY_ADMIN_PASSWORD ?? 'quality fixture passphrase only',
};
export const SESSION_SECRET = 'pilot-quality-fixture-session-secret-not-for-deployment';
/** Reserved fixture media origin — intercepted by Playwright, never fetched. */
export const MEDIA_ORIGIN = 'https://media.fixture.test';
/** 1x1 transparent PNG served for every fulfilled fixture media request. */
export const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const CITY_COUNTRY_SCOPE = 22;

export interface CityRow { id: number; title: string; country: number }
export interface InstitutionRow {
    id: number; title: string; wp_url: string; city_id: number; country: number;
    summary: string; body: string | null; cover: string | null; cover_alt: string; logo: string | null;
}
export interface ProgramRow {
    id: number; title: string; wp_url: string; institution_id: number; country: number;
    summary: string; body: string | null; cover: string | null; cover_alt: string; logo: string | null;
}

export const cities: CityRow[] = [
    { id: 2801, title: 'Allentown', country: CITY_COUNTRY_SCOPE },
    { id: 2802, title: 'Bethlehem', country: CITY_COUNTRY_SCOPE },
    { id: 2803, title: 'Long Branch City With A Deliberately Extended Municipal Name For Reflow Checks', country: CITY_COUNTRY_SCOPE },
];

const paragraph = (text: string): string => text;
/** Long, realistic multi-sentence institution/program body text (plain string per capture contract). */
const longBody = (topic: string, sentences = 12): string =>
    Array.from({ length: sentences }, (_, i) =>
        paragraph(`${topic} fixture sentence ${i + 1}: admissions teams publish requirement summaries that must wrap correctly at phone widths, keep readable line lengths on tablets, and never overflow the detail container on desktop; this repeated filler provides deterministic length for reflow and contrast checks without resembling any real catalog description.`),
    ).join('\n\n');

const filler = (index: number, label: string): string =>
    `${label} Fixture Record ${index} With A Moderately Long Title For Card Wrapping Checks`;

export const institutions: InstitutionRow[] = [
    {
        id: 5101, title: 'Fixture Muhlenberg Sample College', wp_url: '/fixture-muhlenberg-sample-college/', city_id: 2801, country: CITY_COUNTRY_SCOPE,
        summary: 'A synthetic liberal-arts college used to verify detail-page layout with present media, a long summary and a long body.',
        body: longBody('Institution body'),
        cover: `${MEDIA_ORIGIN}/covers/institution-5101.png`, cover_alt: 'Fixture campus quad photograph', logo: `${MEDIA_ORIGIN}/logos/institution-5101.png`,
    },
    {
        id: 5102, title: 'International Academy of Advanced Liberal Studies Professional Excellence and Applied Graduate Research for Returning Adult Learners Seeking Flexible Degree Completion Pathways', wp_url: '/international-academy-advanced-liberal-studies/', city_id: 2802, country: CITY_COUNTRY_SCOPE,
        summary: 'Deliberately very long title fixture: card headings, detail H1s and breadcrumb-free navigation must wrap without horizontal overflow at 320/375/768/1280 and keep heading order intact.',
        body: longBody('Long-title institution body', 8),
        cover: null, cover_alt: '', logo: null,
    },
    {
        id: 5103, title: 'Fixture Polytechnic Institute', wp_url: '/fixture-polytechnic-institute/', city_id: 2801, country: CITY_COUNTRY_SCOPE,
        summary: 'Synthetic institution carrying thirty programs to exercise related-program lists, truncation at the configured page size and repeated card structures.',
        body: longBody('Polytechnic body', 6),
        cover: null, cover_alt: '', logo: null,
    },
    {
        id: 5104, title: 'Fixture Lakeside Community College', wp_url: '/fixture-lakeside-community-college/', city_id: 2802, country: CITY_COUNTRY_SCOPE,
        summary: 'Community college fixture with an empty summary and no media, verifying the collapsed empty-cover behavior and bare-card layout.',
        body: null, cover: null, cover_alt: '', logo: null,
    },
    ...Array.from({ length: 10 }, (_, i): InstitutionRow => {
        const id = 5105 + i;
        const covered = id === 5106 || id === 5110;
        return {
            id, title: filler(i + 1, 'Synthetic Study Center'), wp_url: `/fixture-study-center-${id}/`, city_id: i % 2 ? 2801 : 2803, country: CITY_COUNTRY_SCOPE,
            summary: `Synthetic study center ${id} summary used to fill the first directory page and push later records onto page two of the configured pagination.`,
            body: i % 3 === 0 ? longBody(`Study center ${id} body`, 4) : null,
            cover: covered ? `${MEDIA_ORIGIN}/covers/institution-${id}.png` : null,
            cover_alt: covered ? `Synthetic campus image ${id}` : '', logo: null,
        };
    }),
];

/** Programs 7101..7130 belong to the many-program institution 5103. */
const manyPrograms: ProgramRow[] = Array.from({ length: 30 }, (_, i): ProgramRow => {
    const id = 7101 + i;
    const long = id === 7103;
    return {
        id, title: long
            ? 'Bachelor of Science in Integrated Environmental Systems Engineering Sustainability Leadership and Community Resilience Planning for a Changing Climate'
            : `${['Bachelor', 'Master', 'Certificate', 'Associate', 'Diploma'][i % 5]} Program Fixture ${id} in Synthetic Discipline ${i + 1}`,
        wp_url: `/fixture-polytechnic/program-${id}/`, institution_id: 5103, country: CITY_COUNTRY_SCOPE,
        summary: long
            ? 'Deliberately long program title fixture: the list card, the related-programs card on the institution page and the detail H1 must all wrap cleanly with no horizontal overflow and no clipped focus indicators.'
            : `Synthetic program ${id} description verifying list cards, detail navigation and the related-programs truncation at the configured page size.`,
        body: id === 7104 ? longBody('Program body', 10) : id % 4 === 0 ? longBody(`Program ${id} body`, 3) : null,
        cover: id === 7101 ? `${MEDIA_ORIGIN}/covers/program-7101.png` : id === 7105 ? `${MEDIA_ORIGIN}/broken/missing-cover-7105.png` : null,
        cover_alt: id === 7101 ? 'Synthetic laboratory cover' : id === 7105 ? 'Intentionally broken fixture cover' : '',
        logo: null,
    };
});

/** Programs 7131..7146 belong to assorted institutions (16 more → 46 total, under the 48 cap). */
const spreadPrograms: ProgramRow[] = Array.from({ length: 16 }, (_, i): ProgramRow => {
    const id = 7131 + i;
    const institution = institutions[i % institutions.length]!;
    return {
        id, title: `${['Film', 'Music', 'Nursing', 'Data', 'Language'][i % 5]} Studies Fixture Program ${id}`,
        wp_url: `/fixture-program-${id}/`, institution_id: institution.id, country: CITY_COUNTRY_SCOPE,
        summary: `Spread program ${id} assigned to institution ${institution.id} so institution pages show varied related-program content.`,
        body: i === 0 ? longBody('Spread program body', 5) : null,
        cover: i === 0 ? `${MEDIA_ORIGIN}/covers/program-7131.png` : null,
        cover_alt: i === 0 ? 'Synthetic studio cover' : '', logo: null,
    };
});

export const programs: ProgramRow[] = [...manyPrograms, ...spreadPrograms];

export interface FixtureArticle {
    id: string; revision: number; title: string; originalPath: string; excerpt: string;
    body: unknown; language: string; byline: string | null; publishedAt: string | null;
    coverUrl: string | null; coverAlt: string; reviewNote: string;
}

export const articles: FixtureArticle[] = [
    {
        id: 'a0000000-0000-4000-8000-000000000001', revision: 3,
        title: 'Fixture Announcement: A Deliberately Long Synthetic Headline For Heading Order And Reflow Checks On The Article Detail Page',
        originalPath: '/blog/fixture-announcement-long-headline/',
        excerpt: 'Synthetic announcement article with present media, byline, date and a long structured body used for detail-page accessibility and image checks.',
        language: 'en', byline: 'Fixture Newsroom Author', publishedAt: '2025-04-19T09:12:43Z',
        coverUrl: `${MEDIA_ORIGIN}/covers/announcement.png`, coverAlt: 'Synthetic graduation ceremony photograph',
        reviewNote: 'SYNTHETIC FIXTURE REVIEW NOTE — NOT REAL CONTENT',
        body: [
            { kind: 'paragraph', runs: [{ text: 'This synthetic announcement exists to exercise article detail rendering with realistic length. It is fixture content created for the pilot quality workstream and describes no real event, person or institution.' }] },
            { kind: 'heading', level: 2, runs: [{ text: 'Program highlights' }] },
            ...Array.from({ length: 6 }, (_, i) => ({ kind: 'paragraph', runs: [{ text: `Fixture highlight paragraph ${i + 1}: the paragraph text is intentionally repetitive so that reflow, contrast and focus checks see consistent typography across several screens of content at phone widths.` }] })),
            { kind: 'heading', level: 3, runs: [{ text: 'Quotes from synthetic participants' }] },
            { kind: 'quote', runs: [{ text: 'This is a synthetic blockquote verifying quote styling, line height and contrast against the page background.' }] },
            ...Array.from({ length: 4 }, (_, i) => ({ kind: 'list_item', runs: [{ text: `Synthetic list item ${i + 1} with a wrapped sentence long enough to occupy more than one line at tablet width.` }] })),
            { kind: 'paragraph', runs: [{ text: 'The body also carries an in-text link to verify safe link rendering: ' }, { text: 'the fixture program page', href: 'https://fixture-usa.invalid/fixture-polytechnic/program-7101/' }, { text: ' is a synthetic destination that is never fetched.' }] },
            { kind: 'heading', level: 2, runs: [{ text: 'Closing notes' }] },
            ...Array.from({ length: 5 }, (_, i) => ({ kind: 'paragraph', runs: [{ text: `Closing synthetic paragraph ${i + 1}: repeated deterministic filler keeps the detail page long enough to test scroll-linked layout stability and keyboard traversal past the first viewport.` }] })),
        ],
    },
    {
        id: 'a0000000-0000-4000-8000-000000000002', revision: 1,
        title: 'Short fixture note without cover media',
        originalPath: '/blog/fixture-short-note/',
        excerpt: 'Minimal synthetic article with no cover, no byline and no date to verify the collapsed empty-cover behavior on article list and detail.',
        language: 'en', byline: null, publishedAt: null,
        coverUrl: null, coverAlt: '',
        reviewNote: 'SYNTHETIC FIXTURE REVIEW NOTE — NOT REAL CONTENT',
        body: [{ kind: 'paragraph', runs: [{ text: 'A deliberately short synthetic note verifying text-only article rendering when optional media and metadata are absent.' }] }],
    },
];

export interface DirectoryPaths {
    directory: string; blog: string;
    institutionPaths: string[]; programPaths: string[]; articlePaths: string[];
}

export const institutionPath = (row: Pick<InstitutionRow, 'wp_url'>): string => row.wp_url;
export const programPath = (row: Pick<ProgramRow, 'wp_url'>): string => row.wp_url;

export const fixturePaths: DirectoryPaths = {
    directory: '/explore/',
    blog: '/blog/',
    institutionPaths: institutions.map(institutionPath),
    programPaths: programs.map(programPath),
    articlePaths: articles.map(article => article.originalPath),
};

/**
 * Deterministic capture selection: every synthetic row (14 institutions, 46
 * programs) — above the configured page size of 12 on purpose, so pagination
 * (page=2) carries real content while staying under the 48-record v1 cap.
 */
export const preparedInstitutionPaths = institutions.map(institutionPath);
export const preparedProgramPaths = programs.map(programPath);

export const templatePageIds = {
    directory: '00000000-0000-4000-8000-0000000000c1',
    institution: '00000000-0000-4000-8000-0000000000c2',
    program: '00000000-0000-4000-8000-0000000000c3',
    articleIndex: '00000000-0000-4000-8000-0000000000c4',
    article: '00000000-0000-4000-8000-0000000000c5',
} as const;

export const DATASOURCE_ID = 'fixture_ds_sqlite';

/** Contacts PRESENT variant (the actively reviewed synthetic capture). */
export const contactsPresent = { email: 'counselor@fixture-usa.invalid', whatsapp: 'https://wa.me/15550001234' };
/** Contacts ABSENT variant (prepared only; rendered through the private render endpoint). */
export const contactsAbsent = { email: '', whatsapp: '' };
