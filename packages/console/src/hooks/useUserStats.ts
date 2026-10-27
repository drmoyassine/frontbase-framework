import { useState, useEffect } from 'react';
import { useUserContactConfig } from './useUserContactConfig';
import { useDashboardStore } from '@/stores/dashboard';
import { databaseApi } from '@/services/database-api';

export function useUserStats() {
  const { isConfigured } = useUserContactConfig();
  const supabaseConnected = useDashboardStore(s => s.connections?.supabase?.connected);
  const [stats, setStats] = useState({
    totalUsers: 0,
    recentUsers: 0,
    loading: true,
    error: null as string | null
  });

  useEffect(() => {
    // Skip RPC call if no database connection — avoids 404 console noise
    if (!supabaseConnected) {
      setStats(prev => ({ ...prev, loading: false, error: null }));
      return;
    }

    async function fetchStats() {
      try {
        setStats(prev => ({ ...prev, loading: true }));

        const result: any = await databaseApi.advancedQuery('frontbase_get_auth_stats', {});

        if (result.success) {
          setStats({
            totalUsers: Number(result.total_users || 0),
            recentUsers: Number(result.new_users || 0),
            loading: false,
            error: null
          });
        } else {
          const errorMsg = result.message || result.error || 'Unknown error';
          // Silently fail if stats are unavailable
          setStats(prev => ({ ...prev, loading: false, error: errorMsg }));
        }
      } catch (err) {
        // Don't spam console — this is expected when RPC function doesn't exist
        // Silently fail if RPC is not configured
        setStats(prev => ({
          ...prev,
          loading: false,
          error: null // Not a real error — just not available
        }));
      }
    }

    fetchStats();
  }, [supabaseConnected]);

  return {
    ...stats,
    isConfigured
  };
}