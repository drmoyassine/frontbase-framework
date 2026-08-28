/**
 * WizardAIModelStep — Step 4: GPU model catalog browser.
 *
 * Searchable + filterable model list with multi-selection support.
 */

import { Loader2, Search, Sparkles, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GPU_TYPE_COLORS, GPU_TYPE_LABELS } from '../edgeConstants';
import type { DeployWizardState } from './useDeployWizard';
import type { CatalogModel } from '../edgeConstants';

export function WizardAIModelStep({
    catalogLoading, catalog,
    catalogFilter, setCatalogFilter,
    catalogTypeFilter, setCatalogTypeFilter,
    catalogTypes, filteredCatalog,
    selectedModels, setSelectedModels,
}: DeployWizardState) {

    const toggleModel = (model: CatalogModel) => {
        setSelectedModels(prev => {
            const exists = prev.some(m => m.model_id === model.model_id);
            if (exists) {
                return prev.filter(m => m.model_id !== model.model_id);
            }
            return [...prev, model];
        });
    };

    const isSelected = (model: CatalogModel) =>
        selectedModels.some(m => m.model_id === model.model_id);

    return (
        <div className="space-y-3">
            {catalogLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading model catalog...
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search models..."
                                value={catalogFilter}
                                onChange={(e) => setCatalogFilter(e.target.value)}
                                className="pl-9 h-8"
                            />
                        </div>
                        <Select value={catalogTypeFilter} onValueChange={setCatalogTypeFilter}>
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {catalogTypes.map((t) => (
                                    <SelectItem key={t} value={t}>{GPU_TYPE_LABELS[t] || t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {catalog && (
                        <p className="text-xs text-muted-foreground">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            {catalog.total} models available
                            {selectedModels.length > 0 && (
                                <span className="ml-2 text-primary font-medium">
                                    • {selectedModels.length} selected
                                </span>
                            )}
                        </p>
                    )}

                    {/* Selected models summary chips */}
                    {selectedModels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {selectedModels.map(m => (
                                <Badge
                                    key={m.model_id}
                                    variant="secondary"
                                    className="text-[10px] h-5 py-0 bg-primary/10 text-primary cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                                    onClick={() => toggleModel(m)}
                                    title="Click to remove"
                                >
                                    {m.name.split('/').pop()} ×
                                </Badge>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-1">
                        {filteredCatalog.map((model) => {
                            const selected = isSelected(model);
                            return (
                                <button
                                    key={model.model_id}
                                    type="button"
                                    onClick={() => toggleModel(model)}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${selected
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                        : 'border-border hover:bg-muted/50'
                                        }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-sm truncate">{model.name.split('/').pop()}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Badge className={`${GPU_TYPE_COLORS[model.model_type] || 'bg-gray-100 text-gray-700'} text-[10px] h-4 py-0`} variant="secondary">
                                                {GPU_TYPE_LABELS[model.model_type] || model.model_type}
                                            </Badge>
                                        </div>
                                        {model.description && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                                        )}
                                    </div>
                                    {selected && (
                                        <div className="flex items-center gap-1 ml-2">
                                            <Check className="w-4 h-4 text-primary" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {selectedModels.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                            You can skip model selection and add models later from the engine card.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
