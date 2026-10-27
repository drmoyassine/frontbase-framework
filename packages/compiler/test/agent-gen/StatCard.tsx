import { z } from 'zod';

export const Schema = z.object({
    label: z.string().describe('Label describing what the statistic measures'),
    value: z.number().describe('The numeric statistic value'),
    suffix: z.string().optional().describe('Optional suffix appended to the value, e.g. % or +'),
    color: z.enum(['red', 'green', 'blue']).default('green').describe('Accent color for the stat card'),
});

export type Props = z.infer<typeof Schema>;

export function StatCard(props: Props): null {
    return null;
}
