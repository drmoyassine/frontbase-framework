/**
 * RLS API Service
 * Frontend API layer for RLS policy management
 */

import api from './api-service';
import type {
    RLSPolicy,
    RLSTableStatus,
    RLSApiResponse,
    CreatePolicyRequest,
    UpdatePolicyRequest,
    CreateBatchPolicyRequest,
    BatchPolicyResult
} from '@/types/rls';

const API_BASE = '/api/database';

export const rlsApi = {
    /**
     * List all RLS policies
     */
    listPolicies: async (schema = 'public'): Promise<RLSApiResponse<RLSPolicy[]>> => {
        const response = await api.get(`${API_BASE}/rls/policies?schema=${schema}`);
        return response.data;
    },

    /**
     * Get policies for a specific table
     */
    getTablePolicies: async (
        tableName: string,
        schema = 'public'
    ): Promise<RLSPolicy[]> => {
        const response = await api.get(`${API_BASE}/rls/policies/${tableName}?schema=${schema}`);
        return response.data;
    },

    /**
     * Get RLS status for all tables
     */
    getTablesStatus: async (schema = 'public'): Promise<RLSApiResponse<RLSTableStatus[]>> => {
        const response = await api.get(`${API_BASE}/rls/tables?schema=${schema}`);
        return response.data;
    },

    /**
     * Create a new RLS policy
     */
    createPolicy: async (policy: CreatePolicyRequest): Promise<any> => {
        const response = await api.post(`${API_BASE}/rls/policies`, policy);
        return response.data;
    },

    /**
     * Update an existing RLS policy
     */
    updatePolicy: async (
        tableName: string,
        policyName: string,
        updates: UpdatePolicyRequest
    ): Promise<any> => {
        const response = await api.put(`${API_BASE}/rls/policies/${tableName}/${encodeURIComponent(policyName)}`, updates);
        return response.data;
    },

    /**
     * Delete an RLS policy
     */
    deletePolicy: async (tableName: string, policyName: string): Promise<any> => {
        const response = await api.delete(`${API_BASE}/rls/policies/${tableName}/${encodeURIComponent(policyName)}`);
        return response.data;
    },

    /**
     * Toggle RLS on a table (enable/disable)
     */
    toggleTableRLS: async (tableName: string, enable: boolean): Promise<any> => {
        const response = await api.post(`${API_BASE}/rls/tables/${tableName}/toggle`, { enable });
        return response.data;
    },

    /**
     * Save metadata when creating a policy
     */
    saveMetadata: async (
        tableName: string,
        policyName: string,
        formData: unknown,
        generatedUsing: string,
        generatedCheck?: string
    ): Promise<any> => {
        const response = await api.post(`${API_BASE}/rls/metadata`, {
            tableName,
            policyName,
            formData,
            generatedUsing,
            generatedCheck
        });
        return response.data;
    },

    /**
     * Update metadata when updating a policy
     */
    updateMetadata: async (
        tableName: string,
        policyName: string,
        newPolicyName: string | undefined,
        formData: unknown,
        generatedUsing: string,
        generatedCheck?: string
    ): Promise<any> => {
        const response = await api.put(`${API_BASE}/rls/metadata/${tableName}/${encodeURIComponent(policyName)}`, {
            newPolicyName,
            formData,
            generatedUsing,
            generatedCheck
        });
        return response.data;
    },

    /**
     * Delete metadata when deleting a policy
     */
    deleteMetadata: async (tableName: string, policyName: string): Promise<any> => {
        const response = await api.delete(`${API_BASE}/rls/metadata/${tableName}/${encodeURIComponent(policyName)}`);
        return response.data;
    },

    /**
     * Verify if a policy can be edited visually (matches stored hash)
     * Returns formData if verified, null otherwise
     */
    verifyMetadata: async (
        tableName: string,
        policyName: string,
        currentUsing: string | null
    ): Promise<any> => {
        const response = await api.post(`${API_BASE}/rls/metadata/verify`, {
            tableName,
            policyName,
            currentUsing
        });
        return response.data;
    },

    /**
     * Create multiple RLS policies in batch (for multi-table creation)
     */
    createBatchPolicies: async (request: CreateBatchPolicyRequest): Promise<{
        success: boolean;
        message: string;
        policies: BatchPolicyResult[];
        successCount: number;
        errorCount: number;
    }> => {
        const response = await api.post(`${API_BASE}/rls/batch`, request);
        return response.data;
    },

    /**
     * Bulk delete policies from Supabase (not just metadata)
     */
    bulkDeletePolicies: async (policies: Array<{ tableName: string; policyName: string }>): Promise<{
        success: boolean;
        message: string;
        results: Array<{ tableName: string; policyName: string; success: boolean; error?: string }>;
        successCount: number;
        errorCount: number;
    }> => {
        const response = await api.post(`${API_BASE}/rls/bulk-delete`, { policies });
        return response.data;
    },

    /**
     * Get all metadata (for categorization by contact_type)
     */
    getAllMetadata: async (): Promise<{
        success: boolean;
        data: Array<{
            tableName: string;
            policyName: string;
            formData: any;
            generatedUsing?: string;
        }>;
    }> => {
        const response = await api.get(`${API_BASE}/rls/metadata`);
        return response.data;
    }
};

export default rlsApi;
