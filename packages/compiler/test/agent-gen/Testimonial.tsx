import { z } from 'zod';

export const Schema = z.object({
    quote: z.string().describe('The testimonial quote text'),
    author: z.object({
        name: z.string().describe("Author's display name"),
        role: z.string().describe("Author's job role or title"),
        avatarUrl: z.string().url().describe('URL to the author avatar image'),
    }).describe('Person who gave the testimonial'),
    rating: z.number().default(5).describe('Star rating from 1 to 5'),
});

export type Props = z.infer<typeof Schema>;

export function Testimonial(props: Props): null {
    return null;
}
