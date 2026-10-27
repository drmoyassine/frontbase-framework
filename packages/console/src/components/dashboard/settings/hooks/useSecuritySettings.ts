/**
 * useSecuritySettings Hook (Post-sprint 2.1)
 *
 * State management for the audit-log full-IP retention setting. Mirrors the
 * usePrivacySettings pattern. fullIpRetentionDays:
 *   >0  retain the full IP for N days, then purge
 *    0  anonymize immediately (strictest privacy; disables new-IP alerts)
 *   -1  retain indefinitely (legitimate interest)
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/modules/dbsync/api';
import { SecuritySettings } from '@/modules/dbsync/types';
import { STALE } from '@/lib/queryCache';

export function useSecuritySettings() {
    const queryClient = useQueryClient();
    const [fullIpRetentionDays, setRetention] = useState(30);
    const [hasChanges, setHasChanges] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['securitySettings'],
        queryFn: () => settingsApi.getSecurity().then((r) => r.data),
        staleTime: STALE.STANDARD,
    });

    useEffect(() => {
        if (data) setRetention(data.fullIpRetentionDays ?? 30);
    }, [data]);

    const saveMutation = useMutation({
        mutationFn: (d: SecuritySettings) => settingsApi.updateSecurity(d).then((r) => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['securitySettings'] });
            setHasChanges(false);
        },
    });

    const setFullIpRetentionDays = (n: number) => {
        setRetention(n);
        setHasChanges(true);
    };

    return {
        fullIpRetentionDays,
        setFullIpRetentionDays,
        isLoading,
        hasChanges,
        save: () => saveMutation.mutate({ fullIpRetentionDays }),
        isSaving: saveMutation.isPending,
        saveSuccess: saveMutation.isSuccess && !hasChanges,
    };
}
