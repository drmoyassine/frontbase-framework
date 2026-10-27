import {
    tenantAdminListTenants, tenantAdminGetTenant, tenantAdminCreateTenant,
    tenantAdminCreateTenantUser, tenantAdminUpdateTenant, tenantAdminDeleteTenant,
} from '@/client';

export interface TenantAdminUser {
    id: string;
    user_id: string;
    email: string;
    role: string;
    created_at: string;
}

export interface ActiveResources {
    pages: number;
    workflows: number;
    app_users: number;
}

export interface UsageStats {
    executions_current: number;
    executions_limit: number;
    executions_percentage: number;
}

export interface TenantAdminResponse {
    id: string;
    slug: string;
    name: string;
    plan: string;
    status: string;
    member_count: number;
    created_at: string;
    owner_email?: string | null;
    owner_last_login_at?: string | null;
    project_count: number;
    active_resources?: ActiveResources;
    usage_stats?: UsageStats;
}

export interface TenantAdminDetailResponse extends TenantAdminResponse {
    members: TenantAdminUser[];
    project_id?: string | null;
}

export interface CreateTenantPayload {
    slug: string;
    name: string;
    plan: string;
}

export interface CreateTenantUserPayload {
    email: string;
    password?: string;
    username?: string;
    role?: string;
}

export const tenantAdminApi = {
    listTenants: async (): Promise<{ tenants: TenantAdminResponse[] }> => {
        const { data } = await tenantAdminListTenants({ throwOnError: true });
        return data as unknown as { tenants: TenantAdminResponse[] };
    },

    getTenant: async (tenantId: string): Promise<{ tenant: TenantAdminDetailResponse }> => {
        const { data } = await tenantAdminGetTenant({ path: { tenant_id: tenantId }, throwOnError: true });
        return data as unknown as { tenant: TenantAdminDetailResponse };
    },

    createTenant: async (payload: CreateTenantPayload): Promise<{ tenant: TenantAdminResponse & { project_id?: string } }> => {
        const { data } = await tenantAdminCreateTenant({ body: payload, throwOnError: true });
        return data as unknown as { tenant: TenantAdminResponse & { project_id?: string } };
    },

    createTenantUser: async (tenantId: string, payload: CreateTenantUserPayload): Promise<{ user: any }> => {
        const { data } = await tenantAdminCreateTenantUser({ path: { tenant_id: tenantId }, body: payload, throwOnError: true });
        return data as unknown as { user: any };
    },

    updateTenant: async (tenantId: string, payload: Partial<CreateTenantPayload> & { status?: string }): Promise<{ success: boolean; tenant: any }> => {
        const { data } = await tenantAdminUpdateTenant({ path: { tenant_id: tenantId }, body: payload, throwOnError: true });
        return data as unknown as { success: boolean; tenant: any };
    },

    deleteTenant: async (tenantId: string): Promise<{ success: boolean; message: string }> => {
        const { data } = await tenantAdminDeleteTenant({ path: { tenant_id: tenantId }, throwOnError: true });
        return data as unknown as { success: boolean; message: string };
    }
};
