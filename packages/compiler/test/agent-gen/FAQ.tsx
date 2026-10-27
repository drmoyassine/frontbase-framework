import { z } from 'zod';

export const Schema = z.object({
    items: z.array(z.object({
        question: z.string().describe('The frequently asked question'),
        answer: z.string().describe('The answer to the question'),
    })).default([]).describe('List of FAQ entries'),
    contactEmail: z.string().email().optional().describe('Optional contact email shown when an answer does not apply'),
});

export type Props = z.infer<typeof Schema>;

export function FAQ(props: Props): null {
    return null;
}
