import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserStats } from '@/hooks/useUserStats';
import { Users, UserPlus, TrendingUp } from 'lucide-react';

export function UserStatsCards() {
  const { totalUsers, recentUsers, loading, error, isConfigured } = useUserStats();

  if (!isConfigured) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Configure user contact data sync to see user statistics
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            Failed to load user statistics: {error || 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold">{totalUsers.toLocaleString()}</div>
          )}
          <p className="text-xs text-muted-foreground">
            Registered users in your system
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">New This Week</CardTitle>
          <UserPlus className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold">{recentUsers.toLocaleString()}</div>
          )}
          <p className="text-xs text-muted-foreground">
            Users registered in the last 7 days
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {totalUsers > 0 ? Math.round((recentUsers / totalUsers) * 100) : 0}%
              </div>
              <Badge variant={recentUsers > 0 ? "default" : "secondary"}>
                {recentUsers > 0 ? "Growing" : "Stable"}
              </Badge>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Weekly growth percentage
          </p>
        </CardContent>
      </Card>
    </div>
  );
}