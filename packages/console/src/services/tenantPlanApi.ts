import { tenantsGetMyPlan, tenantsGetMyAddons, plansListPublicPlans } from '@/client';
import type { Plan, PlanLimits } from './adminPlansApi';

export interface MyPlanRequest {
    id: string;
    from_plan: string;
    to_plan: string;
    direction: 'upgrade' | 'downgrade';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    note?: string | null;
    admin_note?: string | null;
    created_at: string;
    reviewed_at?: string | null;
}

export interface MyPlanResponse {
    plan: Plan | null;
    limits: PlanLimits;
    usage: Record<string, number>;
    pending_request: MyPlanRequest | null;
}

export interface PublicPricingPlan {
    name: string;
    price: string;
    period: string;
    description: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    highlighted: boolean;
    badge: string;
}

export const tenantPlanApi = {
    getMyPlan: async (): Promise<MyPlanResponse> => {
        const { data } = await tenantsGetMyPlan({ throwOnError: true });
        return data as unknown as MyPlanResponse;
    },

    getMyAddons: async (): Promise<{ addons: Record<string, number> }> => {
        const { data } = await tenantsGetMyAddons({ throwOnError: true });
        return data as unknown as { addons: Record<string, number> };
    },
    listPublicPlans: async (): Promise<{ plans: PublicPricingPlan[]; detailed: Plan[] }> => {
        const { data } = await plansListPublicPlans({ throwOnError: true });
        return data as unknown as { plans: PublicPricingPlan[]; detailed: Plan[] };
    },
};
