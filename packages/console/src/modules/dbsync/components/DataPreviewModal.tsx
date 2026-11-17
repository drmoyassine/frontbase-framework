import {DatasourceSchemaSelector,useDatasourceSchema} from './DatasourceSchemaSelector';
import {SavedViewInspectorLoader} from './SavedViewInspector';
import {SavedFilterEditor} from './SavedFilterEditor';
import {RecordLocaleReview} from './RecordLocaleReview';
import React, { useRef, useState } from 'react';
import { useDataPreview } from '../hooks/useDataPreview';
import { DataPreviewModalProps } from '../types/data-preview';
import { DataPreviewHeader } from './data-preview/DataPreviewHeader';
import { DataPreviewToolbar } from './data-preview/DataPreviewToolbar';
import { DataPreviewSidebar } from './data-preview/DataPreviewSidebar';
import { DataPreviewContent } from './data-preview/DataPreviewContent';
import { TableSelectionView } from './data-preview/TableSelectionView';
import { RelationshipsView } from './data-preview/RelationshipsView';
import { Table, GitBranch } from 'lucide-react';

const DataInspector = (props: DataPreviewModalProps) => {
    const container=useRef<HTMLDivElement>(null);
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
        tables, isLoadingTables, isFetchingTables, tablesError, schemaData, tableData, isLoading, error, isFetchingData, availableFields, tableColumns,
        groupedMatches, filteredTables, filteredRecords, isDataSearching, searchResults,
        hasNextPage, isFetchingNextPage, refreshSchemaMutation
    } = data;

    if (!isOpen) return null;

    return (
        <div role="dialog" aria-modal="true" aria-label="Data Inspector" className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
            <div ref={container} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
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
                    handleSaveView={()=>{const invalid=container.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>(':invalid');if(invalid){invalid.reportValidity();invalid.focus();return;}void actions.handleSaveView();}}
                    setCurrentStep={actions.setCurrentStep}
                    setActiveTab={actions.setActiveTab}
                    onClose={()=>{if(!state.hasViewEdits||window.confirm('Discard unsaved view edits?'))onClose();}}
                />

                {state.saveError&&<p role="alert" className="px-4 py-2 text-sm text-destructive">{state.saveError}</p>}
                {saveSuccess&&<p role="status" className="px-4 py-2 text-sm">View saved.</p>}
                {props.viewTools}
                {props.schemaSelector}
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
                                <RelationshipsView sourceSchema={props.sourceSchema} datasourceId={props.datasourceId} />
                            ) : (
                                <TableSelectionView
                                    isLoadingTables={isLoadingTables}
                                    isFetchingTables={isFetchingTables}
                                    tablesError={tablesError}
                                    retryTables={() => { void actions.refetchTables(); }}
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
                                        filterEditor={props.savedView?<details className="max-h-72 overflow-auto text-sm"><summary className="cursor-pointer">Filters ({state.savedSelection.length})</summary><div className="min-w-72 space-y-3 p-2"><p>Save View applies these filters to every component using this view.</p><SavedFilterEditor rules={state.savedSelection} fields={availableFields} onChange={actions.setSavedSelection}/></div></details>:undefined}
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
                                    readOnly={props.readOnly}
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
                                {props.savedView && activeTab === 'table' && (
                                    <details className="border-t p-3 text-sm">
                                        <summary>View settings and translations</summary>
                                        <div className="max-h-64 overflow-auto space-y-3 pt-3">
                                            <label className="block">Description
                                                <textarea className="block w-full rounded border bg-background p-2" value={state.description} onChange={e=>actions.setDescription(e.target.value)}/>
                                            </label>
                                            <label className="block">Default sort
                                                <select className="ml-2 rounded border bg-background p-2" value={state.defaultSort?.column??''} onChange={e=>actions.setDefaultSort(e.target.value?{column:e.target.value,direction:state.defaultSort?.direction??'asc'}:undefined)}>
                                                    <option value="">No default</option>
                                                    {availableFields.map(field=><option key={field}>{field}</option>)}
                                                </select>
                                            </label>
                                            <label>Direction
                                                <select aria-label="Default sort direction" className="ml-2 rounded border bg-background p-2" value={state.defaultSort?.direction??'asc'} onChange={e=>{
                                                    if(state.defaultSort) actions.setDefaultSort({...state.defaultSort,direction:e.target.value as 'asc'|'desc'});
                                                }}>
                                                    <option value="asc">Ascending</option>
                                                    <option value="desc">Descending</option>
                                                </select>
                                            </label>
                                            {tableData&&<RecordLocaleReview view={props.savedView} rows={tableData.records}/>}
                                        </div>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

function ScopedDataPreview(props:DataPreviewModalProps){
    const metadata=useDatasourceSchema(props.datasourceId),[selected,setSelected]=useState<string>();
    if(!metadata.data)return <div role="dialog" aria-label="Data Inspector" className="fixed inset-0 z-50 bg-background p-6"><p>{metadata.error?'Datasource unavailable.':'Loading datasource…'}</p><button onClick={props.onClose}>Close</button></div>;
    const schema=metadata.data.supported?(selected??props.sourceSchema??metadata.data.defaultSchema):undefined;
    const changed=selected!==undefined&&selected!==(props.sourceSchema??metadata.data.defaultSchema);
    return <DataInspector {...props} key={JSON.stringify([props.datasourceId,schema])} sourceSchema={schema} readOnly={metadata.data.supported&&(metadata.data.native||schema!=='public'||metadata.data.defaultSchema!=='public')}
        {...changed?{table:'',initialFilters:[],initialViewName:props.savedView?.name??'',initialVisibleColumns:[],initialColumnOrder:[],initialPinnedColumns:[],initialFieldMappings:{},initialLinkedViews:{},initialWebhooks:[]}: {}}
        schemaSelector={schema!==undefined?<DatasourceSchemaSelector datasourceId={props.datasourceId} value={schema} onChange={setSelected}/>:undefined}/>;
}
const DataPreviewModal=(props:DataPreviewModalProps)=>!props.isOpen?null:props.viewId&&!props.savedView?<SavedViewInspectorLoader id={props.viewId} datasourceName={props.datasourceName} onClose={props.onClose}/>:<ScopedDataPreview {...props}/>;
export default DataPreviewModal;
