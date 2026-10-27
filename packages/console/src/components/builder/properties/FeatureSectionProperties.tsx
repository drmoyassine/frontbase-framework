/**
 * Feature Section Properties Panel
 * 
 * Configuration UI for the FeatureSection component.
 * Allows editing features, grid layout, alignment, and colors.
 */

import React, { useMemo, useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, Grip, Copy, GripVertical } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { VariableInput } from '../VariableInput';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FeatureItem {
    link?: string;
    id: string;
    icon: string;
    title: string;
    description: string;
    cardBackground?: string;
}

interface FeatureSectionPropertiesProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

// Sortable Feature Item component
const SortableFeatureItem: React.FC<{
    feature: FeatureItem;
    index: number;
    updateFeature: (index: number, updates: Partial<FeatureItem>) => void;
    duplicateFeature: (index: number) => void;
    removeFeature: (index: number) => void;
    cardBackground?: string;
}> = ({ feature, index, updateFeature, duplicateFeature, removeFeature, cardBackground }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: feature.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <AccordionItem ref={setNodeRef} style={style} value={feature.id}>
            <AccordionTrigger className="text-sm py-2">
                <div className="flex items-center gap-2">
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="truncate max-w-[150px]">
                        {feature.title || `Feature ${index + 1}`}
                    </span>
                </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
                {/* Icon Picker */}
                <div className="space-y-1">
                    <Label className="text-xs">Icon</Label>
                    <IconPicker
                        value={feature.icon}
                        onChange={(icon) => updateFeature(index, { icon })}
                    />
                </div>

                {/* Title */}
                <div className="space-y-1">
                    <Label className="text-xs">Title <span className="text-muted-foreground">(@ for variables)</span></Label>
                    <VariableInput
                        value={feature.title}
                        onChange={(value) => updateFeature(index, { title: value })}
                        syntaxContext="output"
                        placeholder="Feature title or type @ for variables"
                    />
                </div>

                {/* Description */}
                <div className="space-y-1">
                    <Label className="text-xs">Description <span className="text-muted-foreground">(@ for variables)</span></Label>
                    <VariableInput
                        value={feature.description}
                        onChange={(value) => updateFeature(index, { description: value })}
                        syntaxContext="output"
                        placeholder="Feature description or type @ for variables"
                        multiline
                    />
                </div>

                                {/* Link */}
                <div className="space-y-1">
                    <Label className="text-xs">Link (URL)</Label>
                    <Input
                        value={feature.link || ''}
                        onChange={(e) => updateFeature(index, { link: e.target.value })}
                        placeholder="e.g. /aviation or https://..."
                        className="h-8 w-full"
                    />
                </div>

                {/* Card Background Override */}
                <div className="space-y-1">
                    <Label className="text-xs">Card Background (Override)</Label>
                    <Input
                        type="color"
                        value={feature.cardBackground || cardBackground || '#ffffff'}
                        onChange={(e) => updateFeature(index, { cardBackground: e.target.value })}
                        className="h-8 w-full"
                    />
                </div>

                {/* Duplicate & Remove */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => duplicateFeature(index)}
                    >
                        <Copy className="w-4 h-4 mr-1" /> Duplicate
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => removeFeature(index)}
                    >
                        <Trash2 className="w-4 h-4 mr-1" /> Remove
                    </Button>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
};

export const FeatureSectionProperties: React.FC<FeatureSectionPropertiesProps> = ({
    componentId,
    props,
    updateComponentProp
}) => {
    const features: FeatureItem[] = props.features || [];
    const { selectedCardIndex, selectedComponentId } = useBuilderStore(useShallow(s => ({
        selectedCardIndex: s.selectedCardIndex,
        selectedComponentId: s.selectedComponentId
    })));

    // Track which accordion items are expanded
    const [expandedItems, setExpandedItems] = useState<string[]>([]);

    // Auto-expand when a card is selected on the canvas
    useEffect(() => {
        if (selectedCardIndex !== null && selectedComponentId === componentId && features[selectedCardIndex]) {
            const featureId = features[selectedCardIndex].id;
            setExpandedItems(prev => prev.includes(featureId) ? prev : [...prev, featureId]);
        }
    }, [selectedCardIndex, selectedComponentId, componentId, features]);

    const addFeature = () => {
        const newFeature: FeatureItem = {
            id: `feature-${Date.now()}`,
            icon: 'Zap',
            title: 'Feature Title',
            description: 'Feature description goes here.',
        };
        updateComponentProp('features', [...features, newFeature]);
    };

    const updateFeature = (index: number, updates: Partial<FeatureItem>) => {
        const updated = features.map((f, i) =>
            i === index ? { ...f, ...updates } : f
        );
        updateComponentProp('features', updated);
    };

    const removeFeature = (index: number) => {
        updateComponentProp('features', features.filter((_, i) => i !== index));
    };

    const duplicateFeature = (index: number) => {
        const featureToCopy = features[index];
        const duplicate: FeatureItem = {
            ...featureToCopy,
            id: `feature-${Date.now()}`,
            title: `${featureToCopy.title} (Copy)`,
        };
        const newFeatures = [...features];
        newFeatures.splice(index + 1, 0, duplicate);
        updateComponentProp('features', newFeatures);
    };

    // DnD sensors for properties panel reordering
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = features.findIndex(f => f.id === active.id);
            const newIndex = features.findIndex(f => f.id === over.id);
            updateComponentProp('features', arrayMove(features, oldIndex, newIndex));
        }
    };

    return (
        <div className="space-y-4">
            {/* Section Header */}
            <div className="space-y-2">
                <Label>Subtitle</Label>
                <Input
                    value={props.subtitle || ''}
                    onChange={(e) => updateComponentProp('subtitle', e.target.value)}
                    placeholder="Optional subtitle..."
                />
            </div>

            {/* Header Alignment */}
            <div className="space-y-2">
                <Label>Header Alignment</Label>
                <Select
                    value={props.headerAlignment || 'center'}
                    onValueChange={(value) => updateComponentProp('headerAlignment', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Grid Columns */}
            <div className="space-y-2">
                <Label>Columns</Label>
                <Select
                    value={String(props.columns || 3)}
                    onValueChange={(value) => updateComponentProp('columns', parseInt(value))}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="2">2 Columns</SelectItem>
                        <SelectItem value="3">3 Columns</SelectItem>
                        <SelectItem value="4">4 Columns</SelectItem>
                        <SelectItem value="5">5 Columns</SelectItem>
                        <SelectItem value="6">6 Columns</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Mobile Settings */}
            <div className="space-y-3 pt-2 pb-2">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="swipe-mobile">Swipe on Mobile</Label>
                        <p className="text-xs text-muted-foreground">Enable horizontal scroll on small screens</p>
                    </div>
                    <Switch
                        id="swipe-mobile"
                        checked={props.enableSwipeOnMobile || false}
                        onCheckedChange={(checked) => updateComponentProp('enableSwipeOnMobile', checked)}
                    />
                </div>
            </div>

            {/* Icon Settings */}
            <div className="space-y-2">
                <Label>Icon Size</Label>
                <Select
                    value={props.iconSize || 'md'}
                    onValueChange={(value) => updateComponentProp('iconSize', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="sm">Small (24px)</SelectItem>
                        <SelectItem value="md">Medium (32px)</SelectItem>
                        <SelectItem value="lg">Large (48px)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Icon Alignment</Label>
                <Select
                    value={props.iconAlignment || 'center'}
                    onValueChange={(value) => updateComponentProp('iconAlignment', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Icon Color</Label>
                <Input
                    type="color"
                    value={props.iconColor || '#6366f1'}
                    onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                    className="h-10 w-full"
                />
            </div>

            {/* Text Settings */}
            <div className="space-y-2">
                <Label>Text Alignment</Label>
                <Select
                    value={props.textAlignment || 'center'}
                    onValueChange={(value) => updateComponentProp('textAlignment', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Text Color</Label>
                <Input
                    type="color"
                    value={props.textColor || '#6b7280'}
                    onChange={(e) => updateComponentProp('textColor', e.target.value)}
                    className="h-10 w-full"
                />
            </div>

            {/* Background */}
            <div className="space-y-2">
                <Label>Card Background</Label>
                <Input
                    type="color"
                    value={props.cardBackground || '#ffffff'}
                    onChange={(e) => updateComponentProp('cardBackground', e.target.value)}
                    className="h-10 w-full"
                />
            </div>

            {/* Features List */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Features ({features.length})</Label>
                    <Button size="sm" variant="outline" onClick={addFeature}>
                        <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={features.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <Accordion
                            type="multiple"
                            className="w-full"
                            value={expandedItems}
                            onValueChange={setExpandedItems}
                        >
                            {features.map((feature, index) => (
                                <SortableFeatureItem
                                    key={feature.id}
                                    feature={feature}
                                    index={index}
                                    updateFeature={updateFeature}
                                    duplicateFeature={duplicateFeature}
                                    removeFeature={removeFeature}
                                    cardBackground={props.cardBackground}
                                />
                            ))}
                        </Accordion>
                    </SortableContext>
                </DndContext>

                {features.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No features added. Click "Add" to add features.
                    </p>
                )}
            </div>
        </div>
    );
};
