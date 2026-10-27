/**
 * AutomationsStatsCards — Analytics summary cards
 *
 * Displays Published, Draft, and Total workflow counts.
 * Extracted from AutomationsContentPanel.tsx for single-responsibility.
 */

import { Play, FileEdit, Zap } from 'lucide-react';

interface AutomationsStatsCardsProps {
    publishedCount: number;
    draftCount: number;
    totalCount: number;
}

export function AutomationsStatsCards({ publishedCount, draftCount, totalCount }: AutomationsStatsCardsProps) {
    return (
        <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <Play className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{publishedCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Published</p>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                        <FileEdit className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{draftCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Drafts</p>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{totalCount}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Workflows</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
