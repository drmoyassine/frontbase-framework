import React from 'react';
import { Pencil, Copy, CheckCircle, Save as SaveIcon, X } from 'lucide-react';


interface DataPreviewHeaderProps {
    currentViewId?: string;
    viewName: string;
    setViewName: (name: string) => void;
    datasourceName?: string;
    initialViewName?: string;
    isRenamingView: boolean;
    setIsRenamingView: (renaming: boolean) => void;
    showSaveForm: boolean;
    setShowSaveForm: (show: boolean) => void;
    isSaving: boolean;
    copySuccess: boolean;
    copyToClipboard: (text: string) => void;
    handleSaveView: () => void;
    setCurrentStep: (step: 'tables' | 'records') => void;
    setActiveTab: (tab: 'table' | 'record' | 'linked' | 'api' | 'webhooks' | 'relationships') => void;
    onClose: () => void;
}

export const DataPreviewHeader = ({
    currentViewId,
    viewName,
    setViewName,
    datasourceName,
    initialViewName,
    isRenamingView,
    setIsRenamingView,
    showSaveForm,
    setShowSaveForm,
    isSaving,
    copySuccess,
    copyToClipboard,
    handleSaveView,
    setCurrentStep,
    setActiveTab,
    onClose
}: DataPreviewHeaderProps) => {
    return (
        <div className="flex flex-col border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center text-sm font-bold text-gray-400">
                        {currentViewId ? (
                            <div className="flex items-center gap-2 px-3 py-1 bg-primary-600 rounded-lg shadow-sm">
                                <span
                                    className="text-xs font-bold text-white/70 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                                    onClick={() => setCurrentStep('tables')}
                                >
                                    {datasourceName}
                                </span>
                                <span className="text-white/30 text-[10px]">/</span>
                                <span
                                    className="text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:text-white/80 transition-colors"
                                    onClick={() => {
                                        setCurrentStep('records');
                                        setActiveTab('table');
                                    }}
                                >
                                    {viewName || initialViewName || 'Untitled View'}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsRenamingView(true);
                                        setShowSaveForm(true);
                                    }}
                                    className="p-1 hover:bg-white/20 rounded transition-colors text-white/50 hover:text-white"
                                    title="Rename View"
                                >
                                    <Pencil size={10} />
                                </button>
                                <div className="w-px h-3 bg-white/20 mx-1" />
                                <button
                                    onClick={() => copyToClipboard(currentViewId)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-white/50 hover:text-white transition-all active:scale-95 group/copy"
                                    title="Click to copy View ID"
                                >
                                    <Copy size={10} className="group-hover/copy:scale-110 transition-transform" />
                                    <span>{currentViewId.split('-')[0]}...</span>
                                    {copySuccess && (
                                        <CheckCircle size={10} className="text-green-300 animate-in fade-in" />
                                    )}
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className={`text-xs font-bold uppercase tracking-wider ${datasourceName ? 'text-primary-600' : 'text-gray-500'} `}>
                                    {datasourceName || 'Select Datasource'}
                                </span>
                                {datasourceName && (
                                    <>
                                        <span className="mx-2 text-gray-300">/</span>
                                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                            {viewName || initialViewName || 'New View'}
                                        </span>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSaveForm(true)}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${showSaveForm || isSaving
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg'
                            }`}
                    >
                        <SaveIcon size={14} />
                        Save View
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Save View Form (Collapsible) */}
            {showSaveForm && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 bg-primary-600 rounded-xl shadow-inner border border-primary-500/50">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-primary-100 uppercase tracking-wider">View Name</label>
                            <input
                                type="text"
                                value={viewName}
                                onChange={(e) => setViewName(e.target.value)}
                                placeholder="e.g., Active Institutions, Marketing Feed..."
                                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-white/30 outline-none text-sm font-medium transition-all"
                                autoFocus
                            />
                        </div>
                        <div className="flex items-end gap-2 pt-5">
                            <button
                                onClick={handleSaveView}
                                disabled={isSaving || !viewName}
                                className="px-6 py-2 bg-white text-primary-600 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold rounded-lg shadow-lg transition-all"
                            >
                                {isSaving ? 'Saving...' : 'Confirm Save'}
                            </button>
                            <button
                                onClick={() => setShowSaveForm(false)}
                                className="px-4 py-2 bg-primary-700 text-white hover:bg-primary-800 text-xs font-bold rounded-lg transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
