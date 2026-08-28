import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Database, Loader2, AlertCircle, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';
import { Datasource } from '@/modules/dbsync/types';
import { DatasourceModal } from '@/modules/dbsync/components/DatasourceModal';

interface DatabaseProviderSelectorProps {
    value?: string; // datasource ID
    onValueChange: (datasourceId: string | null) => void;
    /** When auth provider has DB capability, auto-suggest a matching datasource */
    autoSuggestProviderType?: string; // e.g. 'supabase'
    label?: string;
}

export function DatabaseProviderSelector({
    value,
    onValueChange,
    autoSuggestProviderType,
    label = 'Contacts Database',
}: DatabaseProviderSelectorProps) {
    const queryClient = useQueryClient();
    const [showCreateModal, setShowCreateModal] = useState(false);

    const { data: datasources = [], isLoading, error } = useQuery<Datasource[]>({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    });

    // Auto-suggest: when auth provider type matches a datasource type, pre-select it
    useEffect(() => {
        if (autoSuggestProviderType && !value && datasources.length > 0) {
            const match = datasources.find(ds => ds.type === autoSuggestProviderType);
            if (match) {
                onValueChange(match.id);
            }
        }
    }, [autoSuggestProviderType, datasources, value, onValueChange]);

    const selectedDs = datasources.find(ds => ds.id === value);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading data sources...
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    Failed to load data sources.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{label}</Label>
                {selectedDs && (
                    <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-700 border-blue-200 gap-1 font-normal">
                        <Database className="h-3 w-3" />
                        Connected
                    </Badge>
                )}
            </div>

            <Select
                value={value || ''}
                onValueChange={(val) => {
                    if (val === '__create_new__') {
                        setShowCreateModal(true);
                    } else {
                        onValueChange(val || null);
                    }
                }}
            >
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Data Source" />
                </SelectTrigger>
                <SelectContent>
                    {datasources.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id}>
                            <div className="flex items-center gap-2">
                                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{ds.name}</span>
                                <span className="text-xs text-muted-foreground">({ds.type})</span>
                            </div>
                        </SelectItem>
                    ))}
                    <SelectItem value="__create_new__">
                        <div className="flex items-center gap-2 text-primary">
                            <Plus className="h-3.5 w-3.5" />
                            <span className="font-medium">Create New Data Source</span>
                        </div>
                    </SelectItem>
                </SelectContent>
            </Select>

            {showCreateModal && (
                <DatasourceModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newDsId) => {
                        queryClient.invalidateQueries({ queryKey: ['datasources'] });
                        onValueChange(newDsId);
                        setShowCreateModal(false);
                    }}
                />
            )}
        </div>
    );
}
