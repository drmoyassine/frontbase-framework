import { z } from 'zod';

export const Schema = z.object({
    heading: z.string().describe('Call-to-action heading text'),
    body: z.string().describe('Supporting body copy under the heading'),
    buttonText: z.string().default('Get Started').describe('Label for the action button'),
    dismissed: z.boolean().nullable().describe('Whether the call-to-action has been dismissed by the user'),
    buttonStyle: z.enum(['primary', 'secondary', 'ghost']).default('primary').describe('Visual style of the action button'),
});

export type Props = z.infer<typeof Schema>;

export function CallToAction(props: Props): null {
    return null;
}
