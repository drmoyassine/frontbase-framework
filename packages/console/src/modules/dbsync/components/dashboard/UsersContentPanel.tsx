import { useUserStats } from '@/hooks/useUserStats';
import { Users, UserPlus, TrendingUp, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function UsersContentPanel() {
    const navigate = useNavigate();
    const { totalUsers, recentUsers, loading, error } = useUserStats();

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Analytics Row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalUsers}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Users</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{recentUsers}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">New This Week</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">
                                {totalUsers > 0 ? `${Math.round((recentUsers / totalUsers) * 100)}%` : '0%'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Weekly Growth</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Management Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="font-semibold text-lg">User Management</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Configure user authentication and manage your users
                            </p>
                        </div>
                        <Button onClick={() => navigate('/users')}>
                            <Settings className="w-4 h-4 mr-2" />
                            Manage Users
                        </Button>
                    </div>

                    {error ? (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div
                                className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                                onClick={() => navigate('/users?tab=users-config')}
                            >
                                <h4 className="font-medium mb-1">Users Configuration</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Set up user data source and sync settings
                                </p>
                            </div>
                            <div
                                className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                                onClick={() => navigate('/users?tab=authentication')}
                            >
                                <h4 className="font-medium mb-1">Authentication</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Configure auth forms and providers
                                </p>
                            </div>
                            <div
                                className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                                onClick={() => navigate('/users?tab=access-rule')}
                            >
                                <h4 className="font-medium mb-1">Access Rules</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Manage row-level security policies
                                </p>
                            </div>
                            <div
                                className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                                onClick={() => navigate('/users?tab=analytics')}
                            >
                                <h4 className="font-medium mb-1">Analytics</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    View user analytics and stats
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
