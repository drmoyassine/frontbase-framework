import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { datasourcesApi, Relationship } from '../../api';
import { RelationshipModal } from '../RelationshipModal';
import { supportsManualRelationships } from '../../types/relationship';
import { Loader2, GitBranch, ArrowRight, Table, AlertCircle, Database, Link2, RefreshCw, Plus } from 'lucide-react';

interface RelationshipsViewProps {
    datasourceId: string | number;
}

// Color palette for tables - vibrant and modern
const TABLE_COLORS = [
    { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 dark:bg-violet-900/40' },
    { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-900/40' },
    { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 dark:bg-emerald-900/40' },
    { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 dark:bg-amber-900/40' },
    { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', badge: 'bg-rose-100 dark:bg-rose-900/40' },
    { bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-200 dark:border-cyan-800', text: 'text-cyan-700 dark:text-cyan-300', badge: 'bg-cyan-100 dark:bg-cyan-900/40' },
    { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', border: 'border-fuchsia-200 dark:border-fuchsia-800', text: 'text-fuchsia-700 dark:text-fuchsia-300', badge: 'bg-fuchsia-100 dark:bg-fuchsia-900/40' },
    { bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-700 dark:text-teal-300', badge: 'bg-teal-100 dark:bg-teal-900/40' },
];

function getTableColor(tableName: string, allTables: string[]) {
    // indexOf returns -1 for a table not in the list (e.g. a cross-schema FK
    // target like auth.users, or a dangling reference). -1 % len = -1 in JS →
    // TABLE_COLORS[-1] = undefined → ".border" crash → white screen. Math.abs
    // clamps the unknown case to a valid index so rendering never throws.
    const index = allTables.indexOf(tableName);
    return TABLE_COLORS[Math.abs(index) % TABLE_COLORS.length];
}

// Group relationships by source table
function groupBySourceTable(relationships: Relationship[]) {
    const grouped: Record<string, Relationship[]> = {};
    relationships.forEach(rel => {
        if (!grouped[rel.source_table]) {
            grouped[rel.source_table] = [];
        }
        grouped[rel.source_table].push(rel);
    });
    return grouped;
}

export const RelationshipsView: React.FC<RelationshipsViewProps> = ({ datasourceId }) => {
    const queryClient = useQueryClient();
    const [showAddModal, setShowAddModal] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ['relationships', datasourceId],
        queryFn: () => datasourcesApi.getRelationships(datasourceId).then(r => r.data),
        staleTime: STALE.STANDARD, // Cache for 5 minutes
    });

    // Fetch the datasource to populate the relationship modal header.
    const { data: datasource } = useQuery({
        queryKey: ['datasource', datasourceId],
        queryFn: () => datasourcesApi.get(datasourceId).then(r => r.data),
        staleTime: STALE.STANDARD,
    });

    // Manual relationship creation is only meaningful for datasources that
    // have no native FK reflection (Google Sheets / REST / WordPress).
    const canAdd = supportsManualRelationships(datasource?.type);

    // Mutation to refresh schema
    const refreshMutation = useMutation({
        mutationFn: () => datasourcesApi.getRelationships(datasourceId, true).then(r => r.data),
        onSuccess: () => {
            // Invalidate both relationships and schema queries
            queryClient.invalidateQueries({ queryKey: ['relationships', datasourceId] });
            queryClient.invalidateQueries({ queryKey: ['schema', datasourceId] });
        },
    });

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    <p className="text-sm text-gray-500">Discovering relationships...</p>
                    <p className="text-xs text-gray-400">This may take a moment for large databases</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-3 text-red-500">
                    <AlertCircle className="w-8 h-8" />
                    <p className="text-sm font-medium">Failed to load relationships</p>
                    <p className="text-xs text-gray-400">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    const { tables = [], relationships = [] } = data || {};
    const grouped = groupBySourceTable(relationships);
    const tablesWithFks = Object.keys(grouped).sort();
    const tablesWithoutFks = tables.filter(t => !grouped[t]).sort();

    return (
        <div className="flex-1 p-6 space-y-6 overflow-y-auto font-sans">
            {/* Header with stats */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
                        <GitBranch className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">Table Relationships</h4>
                        <p className="text-xs text-gray-500">Foreign key connections between tables</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {canAdd && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg border border-primary-600 hover:bg-primary-700 transition-colors shadow-sm"
                            title="Define a foreign key relationship between two tables (this datasource has no native FKs)"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="text-xs font-semibold">Add Relationship</span>
                        </button>
                    )}
                    <button
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending}
                        className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
                        title="Re-discover schemas from database"
                    >
                        <RefreshCw className={`w-4 h-4 text-violet-600 dark:text-violet-400 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                            {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Schema'}
                        </span>
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
                        <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {relationships.length} Relationships
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                        <Table className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            {tables.length} Tables
                        </span>
                    </div>
                </div>
            </div>

            {relationships.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Database className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-sm font-medium">No foreign key relationships found</p>
                    {canAdd ? (
                        <>
                            <p className="text-xs mt-1 mb-4 max-w-sm text-center">
                                This datasource has no native foreign keys. Define them manually so tables
                                can be joined across the app.
                            </p>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold"
                            >
                                <Plus className="w-4 h-4" />
                                Add Relationship
                            </button>
                        </>
                    ) : (
                        <p className="text-xs mt-1">This database doesn't have any FK constraints defined</p>
                    )}
                </div>
            ) : (
                <>
                    {/* Tables with relationships */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {tablesWithFks.map(tableName => {
                            const tableColor = getTableColor(tableName, tables);
                            const rels = grouped[tableName];

                            return (
                                <div
                                    key={tableName}
                                    className={`rounded-xl border-2 ${tableColor.border} ${tableColor.bg} p-4 transition-all hover:shadow-lg`}
                                >
                                    {/* Table name header */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className={`w-8 h-8 rounded-lg ${tableColor.badge} flex items-center justify-center`}>
                                            <Table className={`w-4 h-4 ${tableColor.text}`} />
                                        </div>
                                        <span className={`font-bold text-sm ${tableColor.text}`}>{tableName}</span>
                                        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${tableColor.badge} ${tableColor.text}`}>
                                            {rels.length} FK{rels.length > 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {/* Relationships tree */}
                                    <div className="space-y-2 pl-2 border-l-2 border-dashed border-gray-200 dark:border-gray-600 ml-4">
                                        {rels.map((rel, idx) => {
                                            const targetColor = getTableColor(rel.target_table, tables);
                                            return (
                                                <div key={idx} className="flex items-center gap-2 py-1.5 pl-3 -ml-[2px]">
                                                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                                    <code className="text-xs font-mono bg-white/60 dark:bg-gray-800/60 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                                                        {rel.source_column}
                                                    </code>
                                                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${targetColor.bg} border ${targetColor.border}`}>
                                                        <Table className={`w-3 h-3 ${targetColor.text}`} />
                                                        <span className={`text-xs font-semibold ${targetColor.text}`}>
                                                            {rel.target_table}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">.{rel.target_column}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Tables without relationships */}
                    {tablesWithoutFks.length > 0 && (
                        <div className="mt-8">
                            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                Tables without Foreign Keys ({tablesWithoutFks.length})
                            </h5>
                            <div className="flex flex-wrap gap-2">
                                {tablesWithoutFks.map(t => (
                                    <span
                                        key={t}
                                        className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-500 font-medium"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {showAddModal && (
                <RelationshipModal
                    datasourceId={datasourceId}
                    datasourceName={datasource?.name || ''}
                    onClose={() => setShowAddModal(false)}
                />
            )}
        </div>
    );
};
