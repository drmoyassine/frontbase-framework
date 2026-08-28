/**
 * useRLSPolicies Hook
 * React hook for fetching and managing RLS policies
 */

import { useState, useEffect, useCallback } from 'react';
import { rlsApi } from '@/services/rls-api';
import type { RLSPolicy, RLSTableStatus, CreatePolicyRequest, UpdatePolicyRequest } from '@/types/rls';

export interface UseRLSPoliciesReturn {
    // Data
    policies: RLSPolicy[];
    tablesStatus: RLSTableStatus[];

    // Loading states
    isLoading: boolean;
    isLoadingTables: boolean;

    // Error state
    error: string | null;

    // Actions
    refresh: () => Promise<void>;
    createPolicy: (policy: CreatePolicyRequest) => Promise<{ success: boolean; message?: string; error?: string }>;
    updatePolicy: (tableName: string, policyName: string, updates: UpdatePolicyRequest) => Promise<{ success: boolean; message?: string; error?: string }>;
    deletePolicy: (tableName: string, policyName: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    toggleTableRLS: (tableName: string, enable: boolean) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export function useRLSPolicies(): UseRLSPoliciesReturn {
    const [policies, setPolicies] = useState<RLSPolicy[]>([]);
    const [tablesStatus, setTablesStatus] = useState<RLSTableStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingTables, setIsLoadingTables] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch all policies
    const fetchPolicies = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const result = await rlsApi.listPolicies();

        if (result.success && result.data) {
            setPolicies(result.data);
        } else {
            setError(result.error || 'Failed to load policies');
        }

        setIsLoading(false);
    }, []);

    // Fetch tables RLS status
    const fetchTablesStatus = useCallback(async () => {
        setIsLoadingTables(true);

        const result = await rlsApi.getTablesStatus();

        if (result.success && result.data) {
            setTablesStatus(result.data);
        }

        setIsLoadingTables(false);
    }, []);

    // Refresh all data
    const refresh = useCallback(async () => {
        await Promise.all([fetchPolicies(), fetchTablesStatus()]);
    }, [fetchPolicies, fetchTablesStatus]);

    // Create policy
    const createPolicy = useCallback(async (policy: CreatePolicyRequest) => {
        const result = await rlsApi.createPolicy(policy);

        if (result.success) {
            await refresh();
        }

        return {
            success: result.success,
            message: result.message,
            error: result.error
        };
    }, [refresh]);

    // Update policy
    const updatePolicy = useCallback(async (
        tableName: string,
        policyName: string,
        updates: UpdatePolicyRequest
    ) => {
        const result = await rlsApi.updatePolicy(tableName, policyName, updates);

        if (result.success) {
            await refresh();
        }

        return {
            success: result.success,
            message: result.message,
            error: result.error
        };
    }, [refresh]);

    // Delete policy
    const deletePolicy = useCallback(async (tableName: string, policyName: string) => {
        const result = await rlsApi.deletePolicy(tableName, policyName);

        if (result.success) {
            await refresh();
        }

        return {
            success: result.success,
            message: result.message,
            error: result.error
        };
    }, [refresh]);

    // Toggle table RLS
    const toggleTableRLS = useCallback(async (tableName: string, enable: boolean) => {
        const result = await rlsApi.toggleTableRLS(tableName, enable);

        if (result.success) {
            await fetchTablesStatus();
        }

        return {
            success: result.success,
            message: result.message,
            error: result.error
        };
    }, [fetchTablesStatus]);

    // Initial fetch
    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        policies,
        tablesStatus,
        isLoading,
        isLoadingTables,
        error,
        refresh,
        createPolicy,
        updatePolicy,
        deletePolicy,
        toggleTableRLS
    };
}
