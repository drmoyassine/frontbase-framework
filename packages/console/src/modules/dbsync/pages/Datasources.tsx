import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { datasourcesApi, Datasource, viewsApi } from '../api'
import DataPreviewModal from '../components/DataPreviewModal'
import { DatasourceModal } from '../components/DatasourceModal'
import { RelationshipModal } from '../components/RelationshipModal'
import { supportsManualRelationships } from '../types/relationship'
import { Plus, Database, Trash2, TestTube, CheckCircle, XCircle, Loader2, Edit2, Filter, Link2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PROVIDER_CONFIGS } from '@/components/dashboard/settings/shared/edgeConstants'

/** Providers with 'database' or 'cms' capability — drives the Database Type selector. */
const DATABASE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('database') || c.capabilities?.includes('cms'))
    .map(([key, c]) => ({ key, label: c.label }));

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
    DATABASE_PROVIDERS.map(p => [p.key, p.label])
);

const TYPE_COLORS: Record<string, string> = {
    supabase: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    postgres: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    wordpress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    wordpress_rest: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    wordpress_plugin: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    wordpress_graphql: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    neon: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    mysql: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    cloudflare: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    turso: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    vercel: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
}

export function Datasources() {
    const [showModal, setShowModal] = useState(false)
    const [editingDatasource, setEditingDatasource] = useState<Datasource | null>(null)
    const [relationshipDatasource, setRelationshipDatasource] = useState<Datasource | null>(null)
    const [inspectorData, setInspectorData] = useState<{
        isOpen: boolean;
        datasourceId: string | number;
        table: string;
        name: string;
        filters?: any[];
        viewId?: string;
        viewName?: string;
        webhooks?: any[];
        pinnedColumns?: string[];
        columnOrder?: string[];
    }>({
        isOpen: false,
        datasourceId: '',
        table: '',
        name: '',
        viewName: '',
        pinnedColumns: [],
        columnOrder: []
    });
    const queryClient = useQueryClient()

    // Listen for open modal event from parent (DataStudio)
    useEffect(() => {
        const handleOpenModal = () => setShowModal(true);
        window.addEventListener('open-datasource-modal', handleOpenModal);
        return () => window.removeEventListener('open-datasource-modal', handleOpenModal);
    }, []);

    const { data: datasources, isLoading } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => datasourcesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] })
        },
    })

    const testMutation = useMutation({
        mutationFn: (id: string) => datasourcesApi.test(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] })
        },
    })

    return (
        <div className="space-y-6">
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : datasources?.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Database className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No datasources yet</h3>
                    <p className="text-gray-500 mb-4">Add your first database connection to get started.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Data Source
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {datasources?.map((ds) => (
                        <DatasourceCard
                            key={ds.id}
                            datasource={ds}
                            onTest={() => testMutation.mutate(ds.id)}
                            onEdit={() => {
                                setEditingDatasource(ds)
                                setShowModal(true)
                            }}
                            onRelationships={() => setRelationshipDatasource(ds)}
                            onDelete={() => {
                                if (window.confirm('Are you sure you want to delete this datasource?')) {
                                    deleteMutation.mutate(ds.id)
                                }
                            }}
                            isTesting={testMutation.isPending && testMutation.variables === ds.id}
                            onInspect={(table, filters, viewId, viewName, webhooks, pinned, order) => {
                                setInspectorData({
                                    isOpen: true,
                                    datasourceId: ds.id,
                                    table,
                                    name: ds.name,
                                    filters,
                                    viewId,
                                    viewName,
                                    webhooks,
                                    pinnedColumns: pinned,
                                    columnOrder: order
                                })
                            }}
                        />
                    ))}
                </div>
            )}

            <DataPreviewModal
                isOpen={inspectorData.isOpen}
                onClose={() => setInspectorData({ ...inspectorData, isOpen: false })}
                datasourceId={inspectorData.datasourceId}
                table={inspectorData.table}
                datasourceName={inspectorData.name}
                initialFilters={inspectorData.filters}
                viewId={inspectorData.viewId}
                initialViewName={inspectorData.viewName}
                initialWebhooks={inspectorData.webhooks}
                initialPinnedColumns={inspectorData.pinnedColumns}
                initialColumnOrder={inspectorData.columnOrder}
                onViewSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['datasources'] })
                }}
            />

            {showModal && (
                <DatasourceModal
                    datasource={editingDatasource}
                    onClose={() => {
                        setShowModal(false)
                        setEditingDatasource(null)
                    }}
                />
            )}

            {relationshipDatasource && (
                <RelationshipModal
                    datasourceId={relationshipDatasource.id}
                    datasourceName={relationshipDatasource.name}
                    onClose={() => setRelationshipDatasource(null)}
                />
            )}
        </div>
    )
}

function DatasourceCard({
    datasource,
    onTest,
    onEdit,
    onDelete,
    onRelationships,
    isTesting,
    onInspect,
}: {
    datasource: Datasource
    onTest: () => void
    onEdit: () => void
    onDelete: () => void
    onRelationships: () => void
    isTesting: boolean
    onInspect: (table: string, filters?: any[], viewId?: string, viewName?: string, webhooks?: any[], pinned?: string[], order?: string[]) => void
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover-lift">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <Database className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{datasource.name}</h3>
                            <button
                                onClick={() => onInspect('')}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-primary-600 dark:text-primary-400"
                                title="Inspect Data"
                            >
                                <Database className="w-4 h-4" />
                            </button>
                        </div>
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${TYPE_COLORS[datasource.type]}`}>
                            {TYPE_LABELS[datasource.type]}
                        </span>
                    </div>
                </div>
                {datasource.last_test_success !== null && (
                    datasource.last_test_success ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                    )
                )}
            </div>

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><span className="font-medium">Host:</span> {datasource.host}:{datasource.port}</p>
                <p><span className="font-medium">Database:</span> {datasource.database}</p>
                {datasource.last_tested_at && (
                    <p className="text-xs">
                        Tested {formatDistanceToNow(new Date(datasource.last_tested_at), { addSuffix: true })}
                    </p>
                )}
            </div>

            {/* Views Section */}
            {datasource.views && datasource.views.length > 0 && (
                <div className="mb-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        <Filter className="w-3 h-3" />
                        Saved Views ({datasource.views.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {datasource.views.map(view => (
                            <div
                                key={view.id}
                                className="group flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-md text-[10px] font-medium text-gray-500 transition-all hover:border-primary-200 hover:bg-white dark:hover:bg-gray-800"
                            >
                                <button
                                    onClick={() => onInspect(view.target_table, view.filters, view.id, view.name, view.webhooks, view.pinned_columns, view.column_order)}
                                    className="truncate max-w-[100px] hover:text-primary-600 transition-colors"
                                    title={`Inspect ${view.name} (${view.target_table})`}
                                >
                                    {view.name}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Delete view "${view.name}"?`)) {
                                            viewsApi.delete(view.id).then(() => {
                                                window.location.reload();
                                            });
                                        }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-400 hover:text-red-600"
                                    title="Delete view"
                                >
                                    <Trash2 className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                    onClick={onTest}
                    disabled={isTesting}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <TestTube className="w-4 h-4" />
                    )}
                    Test
                </button>
                <button
                    onClick={onEdit}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${datasource.last_test_success === false
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    title="Edit Connection"
                >
                    <Edit2 className="w-4 h-4" />
                    {datasource.last_test_success === false ? 'Fix' : 'Edit'}
                </button>
                {supportsManualRelationships(datasource.type) && (
                    <button
                        onClick={onRelationships}
                        className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                        title="Define Relationships (foreign keys)"
                    >
                        <Link2 className="w-4 h-4" />
                    </button>
                )}
                <button
                    onClick={onDelete}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                    title="Delete"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
