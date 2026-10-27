/**
 * Logo Cloud Properties Panel
 * 
 * Configuration UI for the LogoCloud component.
 * Allows editing logos, display mode, size, speed, and URLs.
 * Supports drag-and-drop reordering of logos.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
import { Plus, Trash2, Image, Type, GripVertical } from 'lucide-react';

// DnD Kit imports
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface LogoItem {
    id: string;
    type: 'image' | 'text';
    value: string;
    url?: string;
    name?: string;
    scale?: number;
}

interface LogoCloudPropertiesPanelProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

// Sortable Logo Item Component
const SortableLogoItem: React.FC<{
    logo: LogoItem;
    index: number;
    onUpdate: (index: number, updates: Partial<LogoItem>) => void;
    onRemove: (index: number) => void;
}> = ({ logo, index, onUpdate, onRemove }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: logo.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <AccordionItem
            ref={setNodeRef}
            style={style}
            value={logo.id}
            className="border rounded-md mb-1 bg-background"
        >
            <AccordionTrigger className="text-sm py-2 px-2 hover:no-underline">
                <div className="flex items-center gap-2 flex-1">
                    {/* Drag Handle */}
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-move text-muted-foreground hover:text-foreground p-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="w-4 h-4" />
                    </div>
                    {logo.type === 'image' ? (
                        <Image className="w-4 h-4" />
                    ) : (
                        <Type className="w-4 h-4" />
                    )}
                    <span className="truncate max-w-[150px]">
                        {logo.name || logo.value || `Logo ${index + 1}`}
                    </span>
                </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2 px-2">
                {/* Brand Name (Internal Identifier) */}
                <div className="space-y-1">
                    <Label className="text-xs">Brand Name (for identification)</Label>
                    <Input
                        className="h-8"
                        value={logo.name || ''}
                        onChange={(e) => onUpdate(index, { name: e.target.value })}
                        placeholder="e.g. Supabase"
                    />
                </div>

                {/* Size Scale */}
                <div className="space-y-2 pb-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Size Scale ({logo.scale || 1}x)</Label>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => onUpdate(index, { scale: 1 })}
                        >
                            Reset
                        </Button>
                    </div>
                    <Slider
                        value={[logo.scale || 1]}
                        onValueChange={([value]) => onUpdate(index, { scale: value })}
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        className="py-1"
                    />
                </div>

                {/* Type Toggle */}
                <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                        value={logo.type}
                        onValueChange={(value: 'image' | 'text') =>
                            onUpdate(index, { type: value })
                        }
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="image">Image URL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Value */}
                <div className="space-y-1">
                    <Label className="text-xs">
                        {logo.type === 'image' ? 'Image URL' : 'Brand text'}
                    </Label>
                    <Input
                        className="h-8"
                        value={logo.value}
                        onChange={(e) => onUpdate(index, { value: e.target.value })}
                        placeholder={logo.type === 'image' ? 'https://...' : 'Company Name'}
                    />
                </div>

                {/* Link URL */}
                <div className="space-y-1">
                    <Label className="text-xs">Link URL (optional)</Label>
                    <Input
                        className="h-8"
                        value={logo.url || ''}
                        onChange={(e) => onUpdate(index, { url: e.target.value })}
                        placeholder="https://..."
                    />
                </div>

                {/* Remove */}
                <Button
                    size="sm"
                    variant="destructive"
                    className="w-full mt-2"
                    onClick={() => onRemove(index)}
                >
                    <Trash2 className="w-4 h-4 mr-1" /> Remove
                </Button>
            </AccordionContent>
        </AccordionItem>
    );
};

export const LogoCloudProperties: React.FC<LogoCloudPropertiesPanelProps> = ({
    componentId,
    props,
    updateComponentProp
}) => {
    const logos: LogoItem[] = props.logos || [];

    const addLogo = () => {
        const newLogo: LogoItem = {
            id: `logo-${Date.now()}`,
            type: 'text',
            value: 'Brand Name',
            url: '',
        };
        updateComponentProp('logos', [...logos, newLogo]);
    };

    const updateLogo = (index: number, updates: Partial<LogoItem>) => {
        const updated = logos.map((logo, i) =>
            i === index ? { ...logo, ...updates } : logo
        );
        updateComponentProp('logos', updated);
    };

    const removeLogo = (index: number) => {
        updateComponentProp('logos', logos.filter((_, i) => i !== index));
    };

    // Handle drag end for reordering
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = logos.findIndex(l => l.id === active.id);
        const newIndex = logos.findIndex(l => l.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const reordered = arrayMove(logos, oldIndex, newIndex);
            updateComponentProp('logos', reordered);
        }
    };

    return (
        <div className="space-y-4">
            {/* Display Mode */}
            <div className="space-y-2">
                <Label>Display Mode</Label>
                <Select
                    value={props.displayMode || 'static'}
                    onValueChange={(value) => updateComponentProp('displayMode', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="static">Static Grid</SelectItem>
                        <SelectItem value="marquee">Animated Marquee</SelectItem>
                        <SelectItem value="marqueeOnMobile">Marquee on Mobile Only</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Logo Size */}
            <div className="space-y-2">
                <Label>Logo Size</Label>
                <Select
                    value={props.logoSize?.toString() || 'md'}
                    onValueChange={(value) => updateComponentProp('logoSize', value)}
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

            {/* Marquee Options */}
            {(props.displayMode === 'marquee' || props.displayMode === 'marqueeOnMobile') && (
                <>
                    <div className="space-y-2">
                        <Label>Animation Speed: {props.speed || 20}s</Label>
                        <Slider
                            value={[props.speed || 20]}
                            onValueChange={([value]) => updateComponentProp('speed', value)}
                            min={5}
                            max={60}
                            step={1}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label>Pause on Hover</Label>
                        <Switch
                            checked={props.pauseOnHover !== false}
                            onCheckedChange={(checked) => updateComponentProp('pauseOnHover', checked)}
                        />
                    </div>
                </>
            )}

            {/* Grayscale Effect */}
            <div className="flex items-center justify-between">
                <Label>Grayscale Effect</Label>
                <Switch
                    checked={props.grayscale !== false}
                    onCheckedChange={(checked) => updateComponentProp('grayscale', checked)}
                />
            </div>

            {/* Logos List with DnD */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Logos ({logos.length})</Label>
                    <Button size="sm" variant="outline" onClick={addLogo}>
                        <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                </div>

                <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={logos.map(l => l.id)} strategy={verticalListSortingStrategy}>
                        <Accordion type="multiple" className="w-full space-y-1">
                            {logos.map((logo, index) => (
                                <SortableLogoItem
                                    key={logo.id}
                                    logo={logo}
                                    index={index}
                                    onUpdate={updateLogo}
                                    onRemove={removeLogo}
                                />
                            ))}
                        </Accordion>
                    </SortableContext>
                </DndContext>

                {logos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No logos added. Click "Add" to add logos.
                    </p>
                )}
            </div>
        </div>
    );
};
