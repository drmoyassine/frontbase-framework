import React from 'react';
import { useGridQuery } from '@frontbase/grid';
import { RecordContextProvider } from './RecordContext';
import { RenderNode } from './RenderNode';

interface TemplateNode {
    id?: string;
    type: string;
    props?: Record<string, any>;
    children?: TemplateNode[];
}

export interface RepeaterProps {
    /** Baked at publish time (carries `dataRequest` for edge-mode fetching). */
    binding?: any;
    columns?: number;
    layout?: 'grid' | 'list';
    /** The user-designed template subtree (raw component defs from __PAGE_DATA__). */
    template?: TemplateNode[];
    /** Cap rendered rows on the published page. */
    maxRows?: number;
}

function gridLayoutClass(columns: number): string {
    const cols = Math.min(Math.max(columns || 3, 1), 4);
    if (cols === 1) return 'grid grid-cols-1 gap-4';
    if (cols === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4';
    if (cols === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
}

/**
 * Published-page Repeater (edge client). Fetches rows and renders the
 * user-designed template once per row, each wrapped in a RecordContext so
 * `{{ record.* }}` resolves to the current row — matching the canvas preview.
 */
export function Repeater({
    binding,
    columns = 3,
    layout = 'grid',
    template = [],
    maxRows = 100,
}: RepeaterProps) {
    const fallbackBinding = {
        dataSourceId: '',
        tableName: '',
        pagination: { enabled: false, pageSize: 12, page: 0 },
        sorting: { enabled: false },
        filtering: { searchEnabled: false, filters: {} },
        columnOverrides: {},
    };

    const { data, isLoading } = useGridQuery({
        mode: 'edge',
        binding: binding || fallbackBinding,
        enabled: !!binding?.tableName,
    });

    if (!binding?.tableName) {
        return <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Repeater — no data source configured.</div>;
    }

    const rows: any[] = data || [];
    const layoutClass = layout === 'list' ? 'flex flex-col gap-4' : gridLayoutClass(columns);

    if (isLoading && rows.length === 0) {
        return (
            <div className={layoutClass}>
                {Array.from({ length: Math.min(columns || 3, 4) }).map((_, i) => (
                    <div key={i} className="rounded-lg border bg-card shadow-sm animate-pulse">
                        <div className="h-32 bg-muted rounded-t-lg" />
                        <div className="p-6 space-y-2">
                            <div className="h-4 bg-muted rounded w-3/4" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (rows.length === 0) {
        return <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">No data available</div>;
    }

    return (
        <div className={layoutClass}>
            {rows.slice(0, maxRows).map((row, i) => (
                <RecordContextProvider key={i} value={row}>
                    {template.map((node, j) => (
                        <RenderNode key={node.id || j} node={node} />
                    ))}
                </RecordContextProvider>
            ))}
        </div>
    );
}
