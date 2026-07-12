/**
 * BuilderCanvas — visual page editor with palette, layers, canvas, and property panel.
 * Integrates @frontbase/builder's Canvas + model with component manifests for a full
 * visual editing experience.
 *
 * Replaces the JSON textarea in Pages.tsx (CF-18 Phase 2, Option 2).
 */
import { useState, useCallback } from 'react';
import { Canvas, type CanvasProps } from '@frontbase/builder';
import { emptyCanvas, addNode, moveNode, removeNode, updateProps, selectNode, toLayout, layers, type CanvasState } from '@frontbase/builder';
import { getComponentManifest, getPaletteGroups, type ComponentManifest, type ComponentProperty } from '@/lib/components';
import { renderLayout } from '@/components/ComponentRenderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, Layers } from 'lucide-react';

export interface BuilderCanvasProps {
    /** Initial layout (parsed JSON from draft). */
    initialLayout?: string;
    /** Called when layout changes — returns serialized JSON for saving. */
    onLayoutChange?: (layoutJson: string) => void;
}

export function BuilderCanvas({ initialLayout, onLayoutChange }: BuilderCanvasProps) {
    // Parse initial layout or start empty
    const getInitialState = (): CanvasState => {
        if (initialLayout) {
            try {
                const parsed = JSON.parse(initialLayout);
                // Validate it has the expected structure
                if (parsed && typeof parsed === 'object' && 'content' in parsed) {
                    return { layout: parsed, selectedId: null };
                }
            } catch {
                // Invalid JSON, fall through to empty
            }
        }
        return emptyCanvas();
    };

    const [state, setState] = useState<CanvasState>(getInitialState());
    const [viewMode, setViewMode] = useState<'visual' | 'layers'>('visual');

    // Notify parent of changes (serialize to JSON)
    const notifyChange = useCallback((newState: CanvasState) => {
        const layout = toLayout(newState);
        onLayoutChange?.(JSON.stringify(layout, null, 2));
    }, [onLayoutChange]);

    // Canvas operations
    const onAdd = useCallback((type: string) => {
        const result = addNode(state, type);
        setState(result.state);
        notifyChange(result.state);
    }, [state, notifyChange]);

    const onRemove = useCallback((id: string) => {
        const newState = removeNode(state, id);
        setState(newState);
        notifyChange(newState);
    }, [state, notifyChange]);

    const onReorder = useCallback((from: number, to: number) => {
        const newState = moveNode(state, from, to);
        setState(newState);
        notifyChange(newState);
    }, [state, notifyChange]);

    const onSelect = useCallback((id: string) => {
        const newState = selectNode(state, id);
        setState(newState);
        // Don't notify on selection-only changes
    }, [state]);

    const onProp = useCallback((id: string, props: Record<string, unknown>) => {
        const newState = updateProps(state, id, props);
        setState(newState);
        notifyChange(newState);
    }, [state, notifyChange]);

    const layerList = layers(state);
    const selectedNode = state.layout.content.find((n) => n.id === state.selectedId);
    const selectedManifest = selectedNode ? getComponentManifest(selectedNode.type) : undefined;

    // Generate property inputs based on component manifest
    const renderPropertyInput = (prop: ComponentProperty, value: unknown) => {
        const handleChange = (newValue: unknown) => {
            if (state.selectedId) {
                onProp(state.selectedId, { [prop.name]: newValue });
            }
        };

        switch (prop.type) {
            case 'string':
                return (
                    <Input
                        value={value as string || ''}
                        onChange={(e) => handleChange(e.target.value)}
                        placeholder={prop.description || prop.label}
                    />
                );
            case 'number':
                return (
                    <Input
                        type="number"
                        value={value as number || 0}
                        onChange={(e) => handleChange(Number(e.target.value) || 0)}
                    />
                );
            case 'boolean':
                return (
                    <input
                        type="checkbox"
                        checked={value as boolean || false}
                        onChange={(e) => handleChange(e.target.checked)}
                        className="h-4 w-4"
                    />
                );
            case 'enum':
                return (
                    <select
                        value={(value as string) || (prop.default as string) || ''}
                        onChange={(e) => handleChange(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        {prop.enum?.map((v: string) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                );
            default:
                return (
                    <Input
                        value={String(value || '')}
                        onChange={(e) => handleChange(e.target.value)}
                        disabled
                    />
                );
        }
    };

    const paletteGroups = getPaletteGroups();

    return (
        <div className="flex h-[600px] gap-4">
            {/* Left: Palette */}
            <Card className="w-48 overflow-y-auto">
                <CardHeader><CardTitle className="text-sm">Components</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    {Object.entries(paletteGroups).map(([cat, { label, items }]) => (
                        <div key={cat}>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {label}
                            </div>
                            <div className="space-y-1">
                                {items.map((type) => {
                                    const manifest = getComponentManifest(type);
                                    return (
                                        <Button
                                            key={type}
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start"
                                            onClick={() => onAdd(type)}
                                        >
                                            <Plus className="mr-2 h-3 w-3" />
                                            {manifest?.label || type}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Middle: Canvas — WYSIWYG (visual) or layers list */}
            <Card className="flex-1 overflow-hidden">
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-sm">Canvas</CardTitle>
                    <div className="flex rounded-md border border-input overflow-hidden">
                        <button
                            onClick={() => setViewMode('visual')}
                            className={`px-2 py-1 text-xs ${viewMode === 'visual' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        ><Eye className="inline h-3 w-3 mr-1" />Visual</button>
                        <button
                            onClick={() => setViewMode('layers')}
                            className={`px-2 py-1 text-xs ${viewMode === 'layers' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        ><Layers className="inline h-3 w-3 mr-1" />Layers</button>
                    </div>
                </CardHeader>
                <CardContent className="overflow-y-auto">
                    {layerList.length === 0 ? (
                        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                            No components yet. Add from the palette →
                        </div>
                    ) : viewMode === 'visual' ? (
                        /* WYSIWYG: render the layout live (F1). Click-to-select. */
                        <div className="space-y-3 rounded-md border bg-background p-4" onClick={() => onSelect('')}>
                            {renderLayout(state.layout, state.selectedId, onSelect)}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {layerList.map((layer, index) => (
                                <div
                                    key={layer.id}
                                    className={`flex items-center gap-2 rounded-md border px-2 py-2 text-sm ${
                                        layer.selected ? 'border-primary bg-primary/10' : 'border-border'
                                    }`}
                                >
                                    <button
                                        className="flex-1 text-left"
                                        onClick={() => onSelect(layer.id)}
                                    >
                                        {layer.type}
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => onReorder(index, Math.max(0, index - 1))}
                                            disabled={index === 0}
                                        >
                                            <ChevronUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => onReorder(index, index + 1)}
                                            disabled={index === layerList.length - 1}
                                        >
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-destructive"
                                            onClick={() => onRemove(layer.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Right: Properties Panel */}
            <Card className="w-64 overflow-y-auto">
                <CardHeader><CardTitle className="text-sm">Properties</CardTitle></CardHeader>
                <CardContent>
                    {!selectedNode ? (
                        <div className="text-sm text-muted-foreground">
                            Select a component to edit its properties
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm font-medium">{selectedManifest?.label || selectedNode.type}</div>
                                <Badge variant="outline" className="mt-1 text-[10px]">
                                    {selectedManifest?.category || 'content'}
                                </Badge>
                            </div>
                            <div className="space-y-3">
                                {selectedManifest?.properties.map((prop) => (
                                    <div key={prop.name}>
                                        <Label className="text-xs text-muted-foreground">
                                            {prop.label}
                                            {prop.required && <span className="text-destructive"> *</span>}
                                        </Label>
                                        {renderPropertyInput(prop, selectedNode.props[prop.name])}
                                        {prop.description && (
                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                {prop.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
