import React, { useEffect, useState } from 'react';
import { useDataPreview } from '../hooks/useDataPreview';
import { DataPreviewModalProps } from '../types/data-preview';
import { DataPreviewHeader } from './data-preview/DataPreviewHeader';
import { DataPreviewToolbar } from './data-preview/DataPreviewToolbar';
import { DataPreviewSidebar } from './data-preview/DataPreviewSidebar';
import { DataPreviewContent } from './data-preview/DataPreviewContent';
import { TableSelectionView } from './data-preview/TableSelectionView';
import { RelationshipsView } from './data-preview/RelationshipsView';
import { Table, GitBranch } from 'lucide-react';

const DataPreviewModal = (props: DataPreviewModalProps) => {
    const { isOpen, onClose, viewId } = props;
    const {
        state,
        data,
        actions
    } = useDataPreview(props);

    const scrollToColumn = (colKey: string) => {
        const el = document.getElementById(`view-col-${colKey}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    };

    // Destructure state
    const {
        filters, appliedFilters, viewName, currentViewId, isSaving, isColumnsDropdownOpen, columnSearch,
        showSaveForm, showSyncConfirm, saveSuccess, activeTab, globalSearch, dataSearchQuery,
        showDataSearchResults, isRenamingView, globalSearchStatus, globalResults,
        isSessionLoading, copySuccess, selectedTable, tableSearch, editingRecord, fieldMappings, linkedViews,
        webhooks, currentStep, isSidebarCollapsed, isWebhookModalOpen, editingWebhookIndex, webhookForm,
        currentMatchIndex, allMatches, pinnedColumns, columnOrder, visibleColumns
    } = state;

    // Destructure data
    const {
        tables, schemaData, tableData, isLoading, error, isFetchingData, availableFields, tableColumns,
        groupedMatches, filteredTables, filteredRecords, isDataSearching, searchResults,
        hasNextPage, isFetchingNextPage, refreshSchemaMutation
    } = data;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <DataPreviewHeader
                    currentViewId={currentViewId}
                    viewName={viewName}
                    setViewName={actions.setViewName}
                    datasourceName={props.datasourceName}
                    initialViewName={props.initialViewName}
                    isRenamingView={isRenamingView}
                    setIsRenamingView={actions.setIsRenamingView}
                    showSaveForm={showSaveForm}
                    setShowSaveForm={actions.setShowSaveForm}
                    isSaving={isSaving}
                    copySuccess={copySuccess}
                    copyToClipboard={actions.copyToClipboard}
                    handleSaveView={actions.handleSaveView}
                    setCurrentStep={actions.setCurrentStep}
                    setActiveTab={actions.setActiveTab}
                    onClose={onClose}
                />

                <div className="flex-1 overflow-hidden flex flex-col">
                    {currentStep === 'tables' ? (
                        <>
                            {/* Tab Navigation */}
                            <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                <button
                                    onClick={() => actions.setActiveTab('table')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'table'
                                            ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm border border-gray-200 dark:border-gray-600'
                                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-800/60'
                                        }`}
                                >
                                    <Table className="w-4 h-4" />
                                    Tables
                                </button>
                                <button
                                    onClick={() => actions.setActiveTab('relationships')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'relationships'
                                            ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm border border-gray-200 dark:border-gray-600'
                                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-800/60'
                                        }`}
                                >
                                    <GitBranch className="w-4 h-4" />
                                    Relationships
                                </button>
                            </div>

                            {/* Tab Content */}
                            {activeTab === 'relationships' ? (
                                <RelationshipsView datasourceId={props.datasourceId} />
                            ) : (
                                <TableSelectionView
                                    tableSearch={tableSearch}
                                    setTableSearch={actions.setTableSearch}
                                    dataSearchQuery={dataSearchQuery}
                                    setDataSearchQuery={actions.setDataSearchQuery}
                                    handleDataSearch={actions.handleDataSearch}
                                    isDataSearching={isDataSearching}
                                    showDataSearchResults={showDataSearchResults}
                                    setShowDataSearchResults={actions.setShowDataSearchResults}
                                    filteredTables={filteredTables}
                                    groupedMatches={groupedMatches}
                                    setSelectedTable={actions.setSelectedTable}
                                    setCurrentStep={actions.setCurrentStep}
                                    setGlobalSearch={actions.setGlobalSearch}
                                    setAppliedFilters={actions.setAppliedFilters}
                                    setFilters={actions.setFilters}
                                />
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex min-w-0 overflow-hidden">
                            <DataPreviewSidebar
                                isSidebarCollapsed={isSidebarCollapsed}
                                setIsSidebarCollapsed={actions.setIsSidebarCollapsed}
                                tableSearch={tableSearch}
                                setTableSearch={actions.setTableSearch}
                                refreshSchemaMutation={refreshSchemaMutation}
                                selectedTable={selectedTable}
                                tables={tables}
                                setSelectedTable={actions.setSelectedTable}
                                handleManualUpdate={actions.handleManualUpdate}
                                groupedMatches={groupedMatches}
                            />

                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {activeTab === 'table' && (
                                    <DataPreviewToolbar
                                        filters={filters}
                                        updateFilter={actions.updateFilter}
                                        removeFilter={actions.removeFilter}
                                        addFilter={actions.addFilter}
                                        setAppliedFilters={actions.setAppliedFilters}
                                        availableFields={availableFields}
                                        recordCount={tableData?.total || 0}
                                        totalRecords={tableData?.total || 0}
                                        globalSearch={globalSearch}
                                        setGlobalSearch={actions.setGlobalSearch}
                                        allMatches={allMatches}
                                        currentMatchIndex={currentMatchIndex}
                                        handlePrevMatch={actions.handlePrevMatch}
                                        handleNextMatch={(cb) => {
                                            actions.handleNextMatch(cb);
                                        }}
                                        scrollToColumn={scrollToColumn}
                                        isColumnsDropdownOpen={isColumnsDropdownOpen}
                                        setIsColumnsDropdownOpen={actions.setIsColumnsDropdownOpen}
                                        columnSearch={columnSearch}
                                        setColumnSearch={actions.setColumnSearch}
                                        availableTableFields={availableFields || []}
                                        visibleColumns={visibleColumns || []}
                                        toggleVisibility={(col) => actions.toggleVisibility(col, availableFields || [])}
                                        setVisibleColumns={actions.setVisibleColumns}
                                        pinnedColumns={pinnedColumns || []}
                                        columnOrder={columnOrder || []}
                                        togglePin={actions.togglePin}
                                        setColumnOrder={actions.setColumnOrder}
                                    />
                                )}

                                <DataPreviewContent
                                    activeTab={activeTab}
                                    setActiveTab={actions.setActiveTab}
                                    tableData={tableData}
                                    isLoading={isLoading}
                                    isSessionLoading={isSessionLoading}
                                    isFetchingData={isFetchingData}
                                    error={error}
                                    tableColumns={tableColumns}
                                    visibleColumns={visibleColumns}
                                    schemaData={schemaData}
                                    setEditingRecord={actions.setEditingRecord}

                                    globalSearch={globalSearch}
                                    editingRecord={editingRecord}
                                    fieldMappings={fieldMappings}
                                    setFieldMappings={actions.setFieldMappings}
                                    columnSearch={columnSearch}
                                    datasourceId={props.datasourceId}
                                    selectedTable={selectedTable || ''}
                                    linkedViews={linkedViews}
                                    setLinkedViews={actions.setLinkedViews}
                                    webhooks={webhooks}
                                    setWebhooks={actions.setWebhooks}
                                    isWebhookModalOpen={isWebhookModalOpen}
                                    setIsWebhookModalOpen={actions.setIsWebhookModalOpen}
                                    editingWebhookIndex={editingWebhookIndex}
                                    setEditingWebhookIndex={actions.setEditingWebhookIndex}
                                    webhookForm={webhookForm}
                                    setWebhookForm={actions.setWebhookForm}
                                    triggerWebhookTest={actions.triggerWebhookTest}
                                    currentViewId={currentViewId}
                                    allMatches={allMatches}
                                    currentMatchIndex={currentMatchIndex}
                                    recordCount={tableData?.total || 0}
                                    totalRecords={tableData?.total || 0}
                                    handleManualUpdate={actions.handleManualUpdate}
                                    // New props for table features
                                    setColumnOrder={actions.setColumnOrder}
                                    pinnedColumns={pinnedColumns || []}
                                    togglePin={actions.togglePin}
                                    toggleVisibility={actions.toggleVisibility}
                                    availableFields={availableFields || []}
                                    filteredRecords={filteredRecords}
                                    globalSearchStatus={globalSearchStatus}
                                    globalResults={globalResults}
                                    setGlobalResults={actions.setGlobalResults}
                                    setFilters={actions.setFilters}
                                    setAppliedFilters={actions.setAppliedFilters}
                                    setSelectedTable={actions.setSelectedTable}
                                    searchOtherCollections={actions.searchOtherCollections}
                                    searchAllDatasources={actions.searchAllDatasources}
                                    datasourceName={props.datasourceName}
                                    showDataSearchResults={showDataSearchResults}
                                    setShowDataSearchResults={actions.setShowDataSearchResults}
                                    onSaveView={actions.handleSaveView}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataPreviewModal;
