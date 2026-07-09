import { z } from 'zod';

export const Schema = z.object({
    members: z.array(z.object({
        name: z.string().describe("Team member's display name"),
        role: z.string().describe("Member's role or title"),
        socials: z.object({
            twitter: z.string().optional().describe('Optional Twitter handle or profile URL'),
            linkedin: z.string().optional().describe('Optional LinkedIn profile URL'),
        }).describe('Social profile links for the member'),
    })).default([]).describe('Team members to display in the grid'),
});

export type Props = z.infer<typeof Schema>;

export function TeamGrid(props: Props): null {
    return null;
}
