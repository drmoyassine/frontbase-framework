import {
    adminAgentsGetAgentConfig, adminAgentsUpdateAgentConfig,
    adminAgentsGetProfileConfigs, adminAgentsUpdateProfileConfig,
    adminAgentsListAgentProviders, adminAgentsSetDefaultAgentProvider,
    adminAgentsGetAnalytics, adminAgentsListBalances,
    adminAgentsGrantCredits, adminAgentsResetTenantDaily, adminAgentsResetAllDaily,
} from '@/client';

/** Workspace Agent credit balance snapshot (admin / tenant views share this shape). */
export interface AgentCreditBalance {
    daily_remaining: number;
    daily_limit: number;
    monthly_remaining: number;
    monthly_limit: number;
    daily_resets_at: string;
    monthly_resets_at: string;
    total_consumed: number;
    bonus_daily?: number;
    bonus_monthly?: number;
    daily_last_reset_at?: string | null;
    monthly_last_reset_at?: string | null;
}

export interface AgentProvider {
    id: string;
    name: string;
    provider: string;
    is_active: boolean;
    is_workspace_default: boolean;
    has_credentials: boolean;
    created_at: string;
}

export interface AgentGlobalConfig {
    enabled: boolean;
    quota_exceeded_action: 'block' | 'warn';
    default_provider?: AgentProvider | null;
}

/** Per-profile Workspace Agent config — system prompt, generation params, permissions, tools. */
export interface AgentProfileConfig {
    system_prompt: string | null;
    temperature: number | null;
    max_tokens: number | null;
    top_p: number | null;
    model_id: string | null;
    provider_id: string | null;
    permissions: Record<string, string[]>;
    excluded_tools: string[];
}

export type WorkspaceProfileName = 'workspace' | 'support';

export interface AgentProfileConfigUpdate {
    system_prompt?: string | null;
    temperature?: number | null;
    max_tokens?: number | null;
    top_p?: number | null;
    model_id?: string | null;
    provider_id?: string | null;
    permissions?: Record<string, string[]>;
    excluded_tools?: string[];
}

export interface AgentBalanceRow extends AgentCreditBalance {
    tenant_id: string;
    tenant_name: string;
}

export interface AgentAnalytics {
    period: string;
    total_consumed: number;
    quota_exhausted: number;
    errors: number;
    active_tenants: number;
    avg_credits_per_tenant: number;
    top_tenants: { tenant_id: string; tenant_name: string; consumed: number }[];
    daily_series: { date: string; credits: number }[];
    provider_usage: { key: string; credits: number }[];
    model_usage: { model: string; credits: number }[];
}

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export const adminAgentsApi = {
    getConfig: async (): Promise<AgentGlobalConfig> => {
        const { data } = await adminAgentsGetAgentConfig({ throwOnError: true });
        return data as unknown as AgentGlobalConfig;
    },
    updateConfig: async (payload: Partial<Pick<AgentGlobalConfig, 'enabled' | 'quota_exceeded_action'>>): Promise<{ config: AgentGlobalConfig }> => {
        const { data } = await adminAgentsUpdateAgentConfig({ body: payload as never, throwOnError: true });
        return data as unknown as { config: AgentGlobalConfig };
    },
    getProfileConfigs: async (): Promise<{ profiles: Record<WorkspaceProfileName, AgentProfileConfig> }> => {
        const { data } = await adminAgentsGetProfileConfigs({ throwOnError: true });
        return data as unknown as { profiles: Record<WorkspaceProfileName, AgentProfileConfig> };
    },
    updateProfileConfig: async (
        useType: WorkspaceProfileName,
        payload: AgentProfileConfigUpdate,
    ): Promise<{ profile: AgentProfileConfig; use_type: WorkspaceProfileName }> => {
        const { data } = await adminAgentsUpdateProfileConfig({ path: { use_type: useType }, body: payload as never, throwOnError: true });
        return data as unknown as { profile: AgentProfileConfig; use_type: WorkspaceProfileName };
    },
    listProviders: async (): Promise<{ providers: AgentProvider[] }> => {
        const { data } = await adminAgentsListAgentProviders({ throwOnError: true });
        return data as unknown as { providers: AgentProvider[] };
    },
    setDefaultProvider: async (providerId: string): Promise<{ provider: AgentProvider }> => {
        const { data } = await adminAgentsSetDefaultAgentProvider({ path: { provider_id: providerId }, throwOnError: true });
        return data as unknown as { provider: AgentProvider };
    },
    getAnalytics: async (period: AnalyticsPeriod = '30d'): Promise<AgentAnalytics> => {
        const { data } = await adminAgentsGetAnalytics({ query: { period }, throwOnError: true });
        return data as unknown as AgentAnalytics;
    },
    listBalances: async (): Promise<{ balances: AgentBalanceRow[] }> => {
        const { data } = await adminAgentsListBalances({ throwOnError: true });
        return data as unknown as { balances: AgentBalanceRow[] };
    },
    grantCredits: async (tenantId: string, daily: number, monthly: number): Promise<{ balance: AgentBalanceRow }> => {
        const { data } = await adminAgentsGrantCredits({ path: { tenant_id: tenantId }, body: { daily, monthly }, throwOnError: true });
        return data as unknown as { balance: AgentBalanceRow };
    },
    resetTenantDaily: async (tenantId: string): Promise<{ balance: AgentBalanceRow }> => {
        const { data } = await adminAgentsResetTenantDaily({ path: { tenant_id: tenantId }, throwOnError: true });
        return data as unknown as { balance: AgentBalanceRow };
    },
    resetAllDaily: async (): Promise<{ reset_count: number }> => {
        const { data } = await adminAgentsResetAllDaily({ throwOnError: true });
        return data as unknown as { reset_count: number };
    },
};
