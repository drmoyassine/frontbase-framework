export const institutionDetailFields = ['tagline', 'location', 'institutionType', 'founded', 'address', 'highlights'] as const;
export const programDetailFields = ['institutionName', 'degree', 'duration', 'durationUnit', 'tuition', 'currency', 'intakes', 'requirements', 'curriculum', 'careers', 'funding'] as const;
export const detailTextFields = [...institutionDetailFields, ...programDetailFields] as const;
export type DetailTextField = typeof detailTextFields[number];
export const numericDetailFields = ['duration', 'tuition', 'founded'] as const;

export const detailFieldLabels: Record<DetailTextField, string> = {
    tagline: 'Tagline',
    location: 'Location',
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
};
