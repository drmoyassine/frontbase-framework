import { z } from 'zod';

export const Schema = z.object({
    flags: z.object({
        darkMode: z.boolean().default(false).describe('Enable dark mode across the app'),
        betaFeatures: z.boolean().default(false).describe('Expose unfinished beta features to users'),
        analytics: z.boolean().default(false).describe('Enable product analytics tracking'),
        maintenanceMode: z.boolean().default(false).describe('Put the app into maintenance mode'),
        signupOpen: z.boolean().default(false).describe('Allow new user sign-ups'),
    }).describe('Feature flag switches'),
    version: z.number().describe('Schema version number for these flags'),
});

export type Props = z.infer<typeof Schema>;

export function FeatureFlags(props: Props): null {
    return null;
}
