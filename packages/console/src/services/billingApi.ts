import { billingCreateCheckout, billingCreatePortal } from '@/client';

export const billingApi = {
    createCheckoutSession: async (plan_slug: string, add_ons?: Array<{ addon_type: string, quantity: number }>): Promise<{ url: string }> => {
        const { data } = await billingCreateCheckout({ body: { plan_slug, add_ons }, throwOnError: true });
        return data as { url: string };
    },

    createPortalSession: async (): Promise<{ url: string }> => {
        const { data } = await billingCreatePortal({ throwOnError: true });
        return data as { url: string };
    }
};
