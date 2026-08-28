export interface SearchResult {
    datasource_name: string;
    table: string;
    count: number;
    datasource_id?: string;
}

export interface DataPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    datasourceId: string | number;
    table: string;
    datasourceName: string;
    onViewSaved?: (view: any) => void;
    initialFilters?: { field: string; operator: string; value: string }[];
    viewId?: string;
    initialViewName?: string;
    initialVisibleColumns?: string[];
    initialPinnedColumns?: string[];
    initialColumnOrder?: string[];
    initialFieldMappings?: Record<string, string>;
    initialLinkedViews?: Record<string, any>;
    initialWebhooks?: any[];
}
