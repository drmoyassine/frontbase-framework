import React from 'react';
import { Database, Code2, Link as LinkIcon, Webhook as WebhookIcon, Table2 } from 'lucide-react';
import { RecordEditor } from '../RecordEditor';
import { LinkedViews } from './LinkedViews';
import { ApiDocs } from './ApiDocs';
import { WebhookConfig } from './WebhookConfig';
import { DataPreviewTable } from './DataPreviewTable';

interface DataPreviewContentProps {
    activeTab: 'table' | 'record' | 'linked' | 'api' | 'webhooks' | 'relationships';
    setActiveTab: (tab: 'table' | 'record' | 'linked' | 'api' | 'webhooks' | 'relationships') => void;
    tableData: any;
    isLoading: boolean;
    isFetchingData: boolean;
    isSessionLoading: boolean;
    error: any;
    tableColumns: string[];
    visibleColumns: string[];
    schemaData: any;
    setEditingRecord: (record: any) => void;

    globalSearch: string;
    allMatches: { colKey: string; rowIndex: number }[];
    currentMatchIndex: number;
    recordCount: number;
    totalRecords: number;

    // Table Props
    setColumnOrder: (order: string[]) => void;
    pinnedColumns: string[];
    togglePin: (col: string) => void;
    toggleVisibility: (col: string, allFields: string[]) => void;
    availableFields: string[];
    filteredRecords: any[];
    globalSearchStatus: 'idle' | 'searching_datasource' | 'searching_all';
    globalResults: { datasource_name: string; table: string; count: number }[];
    setGlobalResults: (results: any[]) => void;
    setFilters: (filters: any[]) => void;
    setAppliedFilters: (filters: any[]) => void;
    setSelectedTable: (table: string) => void;
    searchOtherCollections: () => void;
    searchAllDatasources: () => void;
    datasourceName?: string;
    selectedTable?: string;
    showDataSearchResults: boolean;
    setShowDataSearchResults: (show: boolean) => void;

    // Record View Props
    editingRecord: any;
    // We need 'fieldMappings' and 'onSave' for RecordEditor
    fieldMappings: Record<string, string>;
    setFieldMappings: (mappings: Record<string, string>) => void;
    handleManualUpdate: () => Promise<void>;
    columnSearch: string;

    // Linked Views Props
    datasourceId: number | string;
    linkedViews: Record<string, any>;
    setLinkedViews: (val: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;

    // Webhooks Props
    webhooks: any[];
    setWebhooks: (val: any[] | ((prev: any[]) => any[])) => void;
    isWebhookModalOpen: boolean;
    setIsWebhookModalOpen: (open: boolean) => void;
    editingWebhookIndex: number | null;
    setEditingWebhookIndex: (index: React.SetStateAction<number | null>) => void;
    webhookForm: any;
    setWebhookForm: (form: any) => void;
    triggerWebhookTest: (viewId: string) => Promise<any>;
    currentViewId?: string;
    onSaveView?: () => Promise<void>;
}

export const DataPreviewContent = ({
    activeTab,
    setActiveTab,
    tableData,
    isLoading,
    isFetchingData,
    isSessionLoading,
    error,
    tableColumns,
    visibleColumns,
    schemaData,
    setEditingRecord,

    globalSearch,
    allMatches,
    currentMatchIndex,
    recordCount,
    totalRecords,
    setColumnOrder,
    pinnedColumns,
    togglePin,
    toggleVisibility,
    availableFields,
    filteredRecords,
    globalSearchStatus,
    globalResults,
    setGlobalResults,
    setFilters,
    setAppliedFilters,
    setSelectedTable,
    searchOtherCollections,
    searchAllDatasources,
    datasourceName,
    selectedTable,
    showDataSearchResults,
    setShowDataSearchResults,
    editingRecord,
    fieldMappings,
    setFieldMappings,
    handleManualUpdate,
    columnSearch,
    datasourceId,
    linkedViews,
    setLinkedViews,
    webhooks,
    setWebhooks,
    isWebhookModalOpen,
    setIsWebhookModalOpen,
    editingWebhookIndex,
    setEditingWebhookIndex,
    webhookForm,
    setWebhookForm,
    triggerWebhookTest,
    currentViewId,
    onSaveView,
}: DataPreviewContentProps) => {

    const tabs = [
        { id: 'table', label: 'Table View', icon: <Database size={14} /> },
        { id: 'record', label: 'Record View', icon: <Table2 size={14} /> },
        { id: 'linked', label: 'Linked Views', icon: <LinkIcon size={14} /> },
        { id: 'api', label: 'API & Docs', icon: <Code2 size={14} /> },
        { id: 'webhooks', label: 'Webhooks', icon: <WebhookIcon size={14} /> }
    ];

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-gray-800">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id
                            ? 'bg-white shadow-sm text-primary-600 border border-gray-100'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Swapper */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'table' && (
                    <div className="flex flex-col h-full">
                        <div className="flex-1 overflow-auto">
                            <DataPreviewTable
                                data={tableData}
                                isLoading={isLoading || isFetchingData}
                                isSessionLoading={isSessionLoading}
                                error={error}
                                tableColumns={tableColumns}
                                setColumnOrder={setColumnOrder}
                                pinnedColumns={pinnedColumns}
                                togglePin={togglePin}
                                toggleVisibility={toggleVisibility}
                                availableFields={availableFields}
                                filteredRecords={filteredRecords}
                                globalSearch={globalSearch}
                                allMatches={allMatches}
                                currentMatchIndex={currentMatchIndex}
                                setEditingRecord={setEditingRecord}
                                setActiveTab={setActiveTab}
                                globalSearchStatus={globalSearchStatus}
                                globalResults={globalResults}
                                setGlobalResults={setGlobalResults}
                                setFilters={setFilters}
                                setAppliedFilters={setAppliedFilters}
                                setSelectedTable={setSelectedTable}
                                searchOtherCollections={searchOtherCollections}
                                searchAllDatasources={searchAllDatasources}
                                datasourceName={datasourceName}
                                selectedTable={selectedTable}
                                showDataSearchResults={showDataSearchResults}
                                setShowDataSearchResults={setShowDataSearchResults}
                            />
                        </div>
                        {/* Footer with record count */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                            <span className="text-[11px] font-medium text-gray-500">
                                <span className="font-bold text-primary-600">{recordCount}</span> total / <span className="font-bold">{totalRecords}</span> <span className="text-gray-400 uppercase text-[9px]">records</span>
                            </span>
                        </div>
                    </div>
                )}

                {activeTab === 'record' && (
                    <RecordEditor
                        record={editingRecord || (tableData?.records?.[0]) || {}}
                        schema={schemaData}
                        onSave={(mappings) => setFieldMappings(mappings)}
                        onCancel={() => {
                            setEditingRecord(null);
                            setActiveTab('table');
                        }}
                        currentMappings={fieldMappings}
                        datasourceName={datasourceName || ''}
                        tableName={selectedTable || ''}
                        columnSearch={columnSearch}
                        globalSearch={globalSearch}
                        availableFields={availableFields}
                    />
                )}

                {activeTab === 'linked' && (
                    <LinkedViews
                        linkedViews={linkedViews}
                        setLinkedViews={setLinkedViews}
                    />
                )}

                {activeTab === 'api' && (
                    <div className="h-full overflow-y-auto p-4">
                        <ApiDocs currentViewId={currentViewId} />
                    </div>
                )}

                {activeTab === 'webhooks' && (
                    <WebhookConfig
                        webhooks={webhooks}
                        setWebhooks={setWebhooks}
                        isWebhookModalOpen={isWebhookModalOpen}
                        setIsWebhookModalOpen={setIsWebhookModalOpen}
                        editingWebhookIndex={editingWebhookIndex}
                        setEditingWebhookIndex={setEditingWebhookIndex}
                        webhookForm={webhookForm}
                        setWebhookForm={setWebhookForm}
                        triggerWebhookTest={triggerWebhookTest}
                        currentViewId={currentViewId}
                        onSaveView={onSaveView}
                    />
                )}
            </div>
        </div>
    );
};
