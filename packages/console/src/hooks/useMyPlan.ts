import { useQuery } from '@tanstack/react-query';
import { tenantPlanApi } from '@/services/tenantPlanApi';
import { STALE } from '@/lib/queryCache';

/**
 * The tenant's current plan — one shared ['my-plan'] cache entry with
 * PlanUsageSection and TenantTeamPanel, so every plan-gated surface agrees.
 */
export function useMyPlan() {
    return useQuery({
        queryKey: ['my-plan'],
        queryFn: () => tenantPlanApi.getMyPlan(),
        staleTime: STALE.DEFAULT,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

/**
 * A plan feature flag (LIMIT_REGISTRY `kind: 'bool'`). Fails closed: while the
 * plan is loading, or if the plan endpoint errored, the feature is treated as
 * unavailable — the backend enforces the same default.
 */
export function usePlanFeature(key: string): { allowed: boolean; loading: boolean } {
    const { data, isLoading } = useMyPlan();
    return { allowed: data?.limits?.[key] === true, loading: isLoading };
}
