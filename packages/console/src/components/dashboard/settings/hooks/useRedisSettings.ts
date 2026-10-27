/**
 * useRedisSettings Hook
 * 
 * Centralized state management for Redis cache configuration.
 * Used by both Dashboard SettingsPanel and dbsync Module Settings.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, RedisSettings } from '@/modules/dbsync/api';
import { STALE } from '@/lib/queryCache';

export interface UseRedisSettingsReturn {
    // State
    redisUrl: string;
    redisToken: string;
    redisType: 'upstash' | 'self-hosted';
    redisEnabled: boolean;
    cacheTtlData: number;
    cacheTtlCount: number;

    // Setters
    setRedisUrl: (url: string) => void;
    setRedisToken: (token: string) => void;
    setRedisType: (type: 'upstash' | 'self-hosted') => void;
    setRedisEnabled: (enabled: boolean) => void;
    setCacheTtlData: (ttl: number) => void;
    setCacheTtlCount: (ttl: number) => void;

    // Status
    isLoading: boolean;
    hasChanges: boolean;
    testResult: { success: boolean; message: string } | null;

    // Actions
    handleChange: () => void;
    save: () => void;
    testConnection: () => void;

    // Mutation states
    isSaving: boolean;
    isTesting: boolean;
    saveSuccess: boolean;

    // Status Flags
    hasLocalRedis: boolean;
    isUpstashConnected: boolean;
}

export function useRedisSettings(): UseRedisSettingsReturn {
    const queryClient = useQueryClient();

    // State
    // We maintain separate config state so switching providers preserves inputs
    const [localConfig, setLocalConfig] = useState({ url: 'http://redis:80', token: '' });
    const [upstashConfig, setUpstashConfig] = useState({ url: '', token: '' });

    // Active type determines which config we show/edit
    const [redisType, setRedisType] = useState<'upstash' | 'self-hosted'>('self-hosted');

    const [redisEnabled, setRedisEnabled] = useState(false);
    const [cacheTtlData, setCacheTtlData] = useState(60);
    const [cacheTtlCount, setCacheTtlCount] = useState(300);

    const [hasChanges, setHasChanges] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Query
    const { data: settings, isLoading } = useQuery({
        queryKey: ['redisSettings'],
        queryFn: () => settingsApi.getRedis().then(r => r.data),
        staleTime: STALE.STANDARD,
    });

    // Sync state from server
    useEffect(() => {
        // Only sync if we don't have unsaved changes to prevent overwriting user input
        if (settings && !hasChanges) {
            const type = (settings.redis_type as any) || 'upstash';
            setRedisType(type);
            setRedisEnabled(settings.redis_enabled);
            setCacheTtlData(settings.cache_ttl_data);
            setCacheTtlCount(settings.cache_ttl_count);

            // Populate the active config from settings
            if (type === 'self-hosted') {
                setLocalConfig({
                    url: settings.redis_url || 'http://redis:80',
                    token: settings.redis_token || ''
                });
            } else {
                setUpstashConfig({
                    url: settings.redis_url || '',
                    token: settings.redis_token || ''
                });
            }
        }
    }, [settings, hasChanges]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.updateRedis(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['redisSettings'] });
            setHasChanges(false);
        },
    });

    // Test mutation
    const testMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.testRedis(data).then(r => r.data),
        onSuccess: (result) => setTestResult(result),
        onError: () => setTestResult({ success: false, message: 'Connection test failed' }),
    });

    // Computed Properties (Facade)
    const redisUrl = redisType === 'self-hosted' ? localConfig.url : upstashConfig.url;
    const redisToken = redisType === 'self-hosted' ? localConfig.token : upstashConfig.token;

    // Setters (Update specific state based on active type)
    const setRedisUrl = (url: string) => {
        if (redisType === 'self-hosted') {
            setLocalConfig(prev => ({ ...prev, url }));
        } else {
            setUpstashConfig(prev => ({ ...prev, url }));
        }
        setHasChanges(true);
        setTestResult(null);
    };

    const setRedisToken = (token: string) => {
        if (redisType === 'self-hosted') {
            setLocalConfig(prev => ({ ...prev, token }));
        } else {
            setUpstashConfig(prev => ({ ...prev, token }));
        }
        setHasChanges(true);
        setTestResult(null);
    };

    // Handlers
    const handleChange = () => {
        setHasChanges(true);
        setTestResult(null);
    };

    // Type Switcher (Just changes view, data persists)
    const handleSetRedisType = (type: 'upstash' | 'self-hosted') => {
        setRedisType(type);
        setHasChanges(true);
    };

    const save = () => {
        // Save ONLY the active configuration
        const activeUrl = redisType === 'self-hosted' ? localConfig.url : upstashConfig.url;
        const activeToken = redisType === 'self-hosted' ? localConfig.token : upstashConfig.token;

        saveMutation.mutate({
            redis_url: activeUrl || null,
            redis_token: activeToken || null,
            redis_type: redisType,
            redis_enabled: redisEnabled,
            cache_ttl_data: cacheTtlData,
            cache_ttl_count: cacheTtlCount,
        });
    };

    const testConnection = () => {
        const activeUrl = redisType === 'self-hosted' ? localConfig.url : upstashConfig.url;
        const activeToken = redisType === 'self-hosted' ? localConfig.token : upstashConfig.token;

        testMutation.mutate({
            redis_url: activeUrl,
            redis_token: activeToken,
            redis_type: redisType,
        });
    };

    return {
        // State
        redisUrl,
        redisToken,
        redisType,
        redisEnabled,
        cacheTtlData,
        cacheTtlCount,

        // Setters
        setRedisUrl,
        setRedisToken,
        setRedisType: handleSetRedisType, // Use the smart wrapper
        setRedisEnabled,
        setCacheTtlData,
        setCacheTtlCount,

        // Status
        isLoading,
        hasChanges,
        testResult,

        // Actions
        handleChange,
        save,
        testConnection,

        // Mutation states
        isSaving: saveMutation.isPending,
        isTesting: testMutation.isPending,
        saveSuccess: saveMutation.isSuccess && !hasChanges,

        // Status Flags
        hasLocalRedis: !!localConfig.token,
        isUpstashConnected: redisType === 'upstash' && !!upstashConfig.token && (!hasChanges || testResult?.success === true),
    };
}
