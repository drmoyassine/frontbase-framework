import {
    adminPlansListPlans, adminPlansGetLimitRegistry, adminPlansCreatePlan,
    adminPlansUpdatePlan, adminPlansDeletePlan, adminPlansListTenantAddons,
    adminPlansGrantTenantAddon, adminPlansRevokeTenantAddon,
    adminPlansListAddons, adminPlansUpdateAddon,
} from '@/client';

export interface PlanLimits {
    [key: string]: number | boolean;
}

export interface Plan {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    infra_mode: 'managed' | 'byo';
    price_display?: string | null;
    price_period?: string | null;
    price_cents?: number;
    limits: PlanLimits;
    features: string[];
    gateway_metadata?: Record<string, string>;
    is_public: boolean;
    is_active: boolean;
    is_default: boolean;
    highlighted: boolean;
    badge?: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
    tenant_count?: number;
}

export interface LimitDef {
    key: string;
    label: string;
    kind: 'int' | 'bool';
    category: 'capacity' | 'operational' | 'agent' | 'feature';
    scope: 'project' | 'tenant';
    unit: string | null;
    default: number | boolean;
}

export type PlanWritePayload = Partial<Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'tenant_count'>>;

export const adminPlansApi = {
    listPlans: async (): Promise<{ plans: Plan[] }> => {
        const { data } = await adminPlansListPlans({ throwOnError: true });
        return data as unknown as { plans: Plan[] };
    },
    getLimitRegistry: async (): Promise<{ limits: LimitDef[] }> => {
        const { data } = await adminPlansGetLimitRegistry({ throwOnError: true });
        return data as unknown as { limits: LimitDef[] };
    },
    createPlan: async (payload: PlanWritePayload): Promise<{ plan: Plan }> => {
        const { data } = await adminPlansCreatePlan({ body: payload as never, throwOnError: true });
        return data as unknown as { plan: Plan };
    },
    updatePlan: async (planId: string, payload: PlanWritePayload): Promise<{ plan: Plan }> => {
        const { data } = await adminPlansUpdatePlan({ path: { plan_id: planId }, body: payload as never, throwOnError: true });
        return data as unknown as { plan: Plan };
    },
    deletePlan: async (planId: string): Promise<{ success: boolean; message: string }> => {
        const { data } = await adminPlansDeletePlan({ path: { plan_id: planId }, throwOnError: true });
        return data as unknown as { success: boolean; message: string };
    },

    listTenantAddons: async (tenantId: string): Promise<{ addons: TenantAddonEntry[] }> => {
        const { data } = await adminPlansListTenantAddons({ query: { tenant_id: tenantId }, throwOnError: true });
        return data as unknown as { addons: TenantAddonEntry[] };
    },
    grantTenantAddon: async (tenantId: string, addonType: string, quantity: number): Promise<{ addon: TenantAddonEntry }> => {
        const { data } = await adminPlansGrantTenantAddon({ body: { tenant_id: tenantId, addon_type: addonType, quantity }, throwOnError: true });
        return data as unknown as { addon: TenantAddonEntry };
    },
    revokeTenantAddon: async (addonId: string): Promise<{ success: boolean }> => {
        const { data } = await adminPlansRevokeTenantAddon({ path: { addon_id: addonId }, throwOnError: true });
        return data as unknown as { success: boolean };
    },

    listAddons: async (): Promise<AddonConfig[]> => {
        const { data } = await adminPlansListAddons({ throwOnError: true });
        return data as unknown as AddonConfig[];
    },
    updateAddon: async (addonId: string, payload: Partial<AddonConfig>): Promise<AddonConfig> => {
        const { data } = await adminPlansUpdateAddon({ path: { addon_id: addonId }, body: payload as never, throwOnError: true });
        return data as unknown as AddonConfig;
    },
};

export interface AddonConfig {
    id: string;
    name: string;
    description: string | null;
    quota_display: string | null;
    price_cents: number;
    is_active: boolean;
}

export interface TenantAddonEntry {
    id: string;
    tenant_id: string;
    addon_type: string;
    quantity: number;
    status: string;
}
