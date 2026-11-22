export const institutionDetailFields = ['tagline', 'location', 'country', 'institutionType', 'founded', 'address', 'highlights', 'students', 'latitude', 'longitude', 'socialProfiles'] as const;
export const programDetailFields = ['institutionName', 'degree', 'duration', 'durationUnit', 'tuition', 'currency', 'intakes', 'requirements', 'curriculum', 'careers', 'funding', 'updatedAt'] as const;
export const detailTextFields = [...institutionDetailFields, ...programDetailFields] as const;
const directoryLiquidFields = new Set<string>(['title', 'summary', 'body', 'byline', 'publishedAt', ...detailTextFields]);
export function directoryLiquidField(expression: unknown): string | undefined {
    const field = typeof expression === 'string' ? /^\{\{ record\.([a-zA-Z][\w]*) \}\}$/.exec(expression)?.[1] : undefined;
    return field && directoryLiquidFields.has(field) ? field : undefined;
}
export type DetailTextField = typeof detailTextFields[number];
export const numericDetailFields = ['duration', 'tuition', 'founded', 'students'] as const;
export const dateDetailFields = ['publishedAt', 'updatedAt'] as const;
const sourceValueFields = new Set<string>([...numericDetailFields, ...dateDetailFields]);
export function isSourceDetailField(field: string): boolean {
    return sourceValueFields.has(field);
}

export const detailFieldLabels: Record<DetailTextField, string> = {
    students: 'Students', latitude: 'Latitude', longitude: 'Longitude', socialProfiles: 'Social profiles',
    tagline: 'Tagline',
    location: 'Location',
    country: 'Country',
    institutionType: 'Institution type',
    founded: 'Founded',
    address: 'Street address',
    highlights: 'Highlights',
    institutionName: 'Institution name',
    degree: 'Degree',
    duration: 'Duration',
    durationUnit: 'Duration unit',
    tuition: 'Tuition',
    currency: 'Currency',
    intakes: 'Intakes',
    requirements: 'Entry requirements',
    curriculum: 'Curriculum',
    careers: 'Careers',
    funding: 'Funding',
    updatedAt: 'Last updated date',
};
