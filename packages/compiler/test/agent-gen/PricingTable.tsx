import { z } from 'zod';

export const Schema = z.object({
    billingCycle: z.enum(['monthly', 'yearly']).default('monthly').describe('Selected billing cycle for displayed prices'),
    plans: z.array(z.object({
        name: z.string().describe('Plan name'),
        price: z.number().describe('Plan price in the selected billing cycle'),
        features: z.array(z.string()).default([]).describe('Features included in the plan'),
        highlighted: z.boolean().describe('Whether this plan is highlighted as the recommended option'),
    })).default([]).describe('Available pricing plans'),
});

export type Props = z.infer<typeof Schema>;

export function PricingTable(props: Props): null {
    return null;
}
