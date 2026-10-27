/**
 * useStorageEnabled Hook
 * 
 * Detects if any storage provider is configured and provides methods
 * to check bucket status and upload assets via the provider-aware API.
 */

import { useCallback, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api-service';
import { STALE } from '@/lib/queryCache';

interface StorageProvider {
    id: string;
    name: string;
    provider: string;
    provider_account_id: string;
    account_name: string;
    is_active: boolean;
}

interface BucketStatus {
    exists: boolean;
    error?: string;
}

interface UseStorageEnabledResult {
    /** Whether any storage provider is connected */
    isStorageEnabled: boolean;
    /** The first active storage provider (used as default) */
    defaultProvider: StorageProvider | null;
    /** Type of connected storage (e.g. 'supabase') */
    storageType: string | null;
    /** Check if a bucket exists */
    checkBucket: (bucketName: string) => Promise<BucketStatus>;
    /** Create a bucket */
    createBucket: (bucketName: string, isPublic?: boolean) => Promise<{ success: boolean; error?: string }>;
    /** Upload a file to storage */
    uploadAsset: (file: File, path: string, bucket?: string) => Promise<{ url: string } | { error: string }>;
    /** Loading state for storage operations */
    isLoading: boolean;
}

const ASSETS_BUCKET = 'frontbase_assets';

export function useStorageEnabled(): UseStorageEnabledResult {
    const [isLoading, setIsLoading] = useState(false);

    // Fetch configured storage providers
    const { data: providers = [] } = useQuery<StorageProvider[]>({
        queryKey: ['storage-providers'],
        queryFn: async () => {
            const res = await api.get('/api/storage/providers/');
            return res.data;
        },
        staleTime: STALE.STANDARD,
    });

    const defaultProvider = useMemo(
        () => providers.find((p) => p.is_active) ?? providers[0] ?? null,
        [providers],
    );

    const isStorageEnabled = !!defaultProvider;
    const storageType = defaultProvider?.provider ?? null;

    const checkBucket = useCallback(async (bucketName: string): Promise<BucketStatus> => {
        if (!defaultProvider) {
            return { exists: false, error: 'No storage connected' };
        }

        try {
            const response = await api.get(
                `/api/storage/buckets/${bucketName}?provider_id=${defaultProvider.id}`,
            );
            return { exists: response.data.success === true };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            return { exists: false, error: error.response?.data?.error || error.message || 'Failed to check bucket' };
        }
    }, [defaultProvider]);

    const createBucket = useCallback(async (bucketName: string, isPublic = true): Promise<{ success: boolean; error?: string }> => {
        if (!defaultProvider) {
            return { success: false, error: 'No storage connected' };
        }

        setIsLoading(true);
        try {
            const response = await api.post(`/api/storage/buckets?provider_id=${defaultProvider.id}`, {
                name: bucketName,
                public: isPublic,
            });
            return { success: response.data.success !== false };
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to create bucket' };
        } finally {
            setIsLoading(false);
        }
    }, [defaultProvider]);

    const uploadAsset = useCallback(async (
        file: File,
        path: string,
        bucket: string = ASSETS_BUCKET
    ): Promise<{ url: string } | { error: string }> => {
        if (!defaultProvider) {
            return { error: 'No storage connected' };
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);
            formData.append('bucket', bucket);
            formData.append('provider_id', defaultProvider.id);

            const response = await api.post('/api/storage/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data.publicUrl || response.data.url) {
                return { url: response.data.publicUrl || response.data.url };
            }
            return { error: 'Upload succeeded but no URL returned' };
        } catch (error: any) {
            return { error: error.message || 'Upload failed' };
        } finally {
            setIsLoading(false);
        }
    }, [defaultProvider]);

    return {
        isStorageEnabled,
        defaultProvider,
        storageType,
        checkBucket,
        createBucket,
        uploadAsset,
        isLoading,
    };
}

export { ASSETS_BUCKET };
