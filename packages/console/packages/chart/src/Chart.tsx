import React, { useMemo } from 'react';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { ChartProps } from './types';
import { useChartQuery } from './hooks/useChartQuery';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Categorical palette — each category/bar/slice gets a distinct colour, cycling if needed.
const COLORS = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
    '#E1306C', '#2CA02C', '#17BECF', '#BCBD22', '#9467BD',
    '#FF6B6B', '#1F77B4',
];

export function Chart({
    mode = 'builder',
    componentId,
    binding,
    className = '',
    style,
    chartType = 'bar',
    height = '300px',
    initialData,
    onConfigureBinding,
    configureOverlay,
    title: titleProp,
}: ChartProps) {
    // Cast to break cross-package csstype version incompatibility (see InfoList).
    const safeStyle = style as React.CSSProperties | undefined;
    // Data fetching via custom edge-aware hook
    const {
        data,
        isLoading: loading,
        error
    } = useChartQuery({
        mode,
        binding: binding || {
            componentId,
            dataSourceId: '',
            tableName: '',
            pagination: { enabled: false, pageSize: 10, page: 0 },
            sorting: { enabled: false },
            filtering: { searchEnabled: false, filters: {} },
            columnOverrides: {},
        },
        initialData,
        enabled: !!binding?.tableName,
    });

    const displayTitle = titleProp !== undefined && titleProp !== ''
        ? titleProp
        : (binding?.tableName 
            ? binding.tableName.replace(/_/g, ' ') + ' Chart'
            : '');

    // Card styling matching standard shadcn/ui Card structure
    const cardClass = "rounded-lg border bg-card text-card-foreground shadow-sm";
    const headerClass = "flex flex-col space-y-1.5 p-6 pb-4";
    const titleClass = "text-lg font-semibold capitalize";
    const contentClass = "p-6 pt-0";

    // Derive chart data. NOTE: this hook must run before any early return below,
    // otherwise the hook order changes between renders (loading -> loaded) and
    // React throws "Rendered more hooks than during the previous render".
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const cfg = binding?.chartConfig as any;
        const maxRows = cfg?.maxRows || 10;

        // Current model: data is aggregated in the database and arrives already
        // shaped as { category, value }. Coerce string numbers to actual numbers
        // because PostgREST serializes bigint (COUNT) as strings, which crashes Recharts.
        if (cfg?.category) {
            return data.slice(0, maxRows)
                .map((row: any) => ({
                    category: row.category == null ? 'Unknown' : String(row.category),
                    value: Number(row.value),
                }))
                // Reject non-finite values outright so NaN can never reach Recharts
                // (a degenerate band/value axis is what produces "NaN" x/width on <rect>).
                // If the rows aren't the expected {category,value} shape, this collapses
                // to an empty set → a clean "No data available" instead of NaN garbage.
                .filter((r: any) => Number.isFinite(r.value));
        }

        // Legacy fallback: charts saved under the old label/value/groupBy model
        // still receive raw rows, so aggregate them client-side.
        const category = cfg?.groupBy || cfg?.labelColumn || Object.keys(data[0])[0];
        const aggregation = cfg?.aggregation || 'count';
        const valueKey = cfg?.value || cfg?.valueColumn;

        // Group by category and aggregate into one point per group.
        const groups = new Map<string, { sum: number; count: number; min: number; max: number }>();
        for (const row of data) {
            const key = String(row?.[category] ?? '');
            const num = valueKey ? Number(row?.[valueKey]) || 0 : 0;
            const acc = groups.get(key) || { sum: 0, count: 0, min: Infinity, max: -Infinity };
            acc.sum += num;
            acc.count += 1;
            acc.min = Math.min(acc.min, num);
            acc.max = Math.max(acc.max, num);
            groups.set(key, acc);
        }
        const reduce = (a: { sum: number; count: number; min: number; max: number }) => {
            switch (aggregation) {
                case 'count': return a.count;
                case 'average': return a.count ? a.sum / a.count : 0;
                case 'min': return a.min === Infinity ? 0 : a.min;
                case 'max': return a.max === -Infinity ? 0 : a.max;
                default: return a.sum;
            }
        };
        const points = Array.from(groups.entries())
            .map(([key, acc]) => ({ [category]: key, value: reduce(acc) }))
            .filter((p: any) => Number.isFinite(p.value));

        // Sort by aggregated value before trimming, so asc/desc gives a true top/bottom-N.
        const sort = cfg?.sort || 'none';
        if (sort === 'asc') points.sort((a, b) => a.value - b.value);
        else if (sort === 'desc') points.sort((a, b) => b.value - a.value);

        return points.slice(0, maxRows);
    }, [data, binding?.chartConfig]);

    // 1. Unconfigured State
    if (!binding?.tableName) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-muted-foreground text-sm">No data binding configured</p>
                    {configureOverlay as any}
                    {!configureOverlay && onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Configure Data
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 2. Loading State (Matching SSR skeleton layout)
    if (loading && !data) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className={headerClass}>
                    <div className="h-4 bg-muted rounded w-1/3 animate-pulse"></div>
                </div>
                <div className={contentClass}>
                    <div 
                        className="fb-chart-container fb-skeleton" 
                        style={{ height, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <span className="text-muted-foreground text-sm">Loading chart...</span>
                    </div>
                </div>
            </div>
        );
    }

    // 3. Error State
    if (error) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-destructive text-sm font-medium">Error loading data: {error instanceof Error ? error.message : String(error)}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-md hover:bg-destructive/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // 4. Render Chart Types
    const renderChartContent = () => {
        if (chartData.length === 0) {
            return (
                <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
                    No data available
                </div>
            );
        }

        const cfg = binding?.chartConfig as any;
        // Category is the X-axis / pie label; value is always the aggregated measure.
        // Server-aggregated rows use the literal 'category' key; legacy rows use the
        // original column name.
        const xAxisKey = cfg?.category ? 'category' : (cfg?.groupBy || cfg?.labelColumn || Object.keys(chartData[0])[0]);
        const valueKey = 'value';
        const isHorizontal = cfg?.variant === 'horizontal';

        // Custom container styles to satisfy recharts sizing constraints
        const containerStyle = {
            width: '100%',
            height,
        };

        switch (chartType) {
            case 'line':
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey={xAxisKey} 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    width={60}
                                />
                                <Tooltip
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                                <Line
                                    type="monotone" 
                                    dataKey={valueKey} 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                );

            case 'pie':
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius="80%"
                                    fill="#8884d8"
                                    dataKey={valueKey}
                                    nameKey={xAxisKey}
                                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                >
                                    {chartData.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                );

            default: // bar
                return (
                    <div style={containerStyle}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                layout={isHorizontal ? 'vertical' : 'horizontal'}
                                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={isHorizontal}
                                    horizontal={!isHorizontal}
                                    stroke="hsl(var(--border))"
                                />
                                <XAxis
                                    type={isHorizontal ? 'number' : 'category'}
                                    dataKey={isHorizontal ? undefined : xAxisKey}
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    type={isHorizontal ? 'category' : 'number'}
                                    dataKey={isHorizontal ? xAxisKey : undefined}
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    // Explicit width required: React 19 drops Recharts 2.x defaultProps
                                    // (YAxis default width:60), leaving the left offset null and the
                                    // X band scale at [null,null] → NaN bar x/width.
                                    width={isHorizontal ? 80 : 60}
                                />
                                <Tooltip
                                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                                />
                                <Legend />
                                <Bar
                                    dataKey={valueKey}
                                    radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                                >
                                    {chartData.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                );
        }
    };

    return (
        <div className={cn(cardClass, className)} style={safeStyle}>
            <div className={headerClass}>
                <h3 className={titleClass}>{displayTitle}</h3>
            </div>
            <div className={contentClass}>
                {renderChartContent()}
            </div>
        </div>
    );
}

export default Chart;
