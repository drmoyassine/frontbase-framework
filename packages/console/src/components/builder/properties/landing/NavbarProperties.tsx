/**
 * Navbar Properties Panel
 * Configuration UI for the Navbar component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, GripVertical } from 'lucide-react';
import { SelectTargetButton } from '@/components/builder/shared/SelectTargetButton';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableMenuItemProps {
    item: any;
    index: number;
    updateItem: (index: number, updates: any) => void;
    removeItem: (index: number) => void;
}

const SortableMenuItem: React.FC<SortableMenuItemProps> = ({
    item,
    index,
    updateItem,
    removeItem
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id || `menu-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="space-y-2 p-3 border rounded-md bg-muted/20 relative group">
            <div className="flex gap-2">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground rounded p-1 self-center"
                >
                    <GripVertical className="h-4 w-4" />
                </div>
                <Input
                    value={item.label || ''}
                    onChange={(e) => updateItem(index, { label: e.target.value })}
                    placeholder="Menu label"
                    className="h-8 flex-1"
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeItem(index)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex gap-2 pl-7">
                <Select
                    value={item.navType || 'scroll'}
                    onValueChange={(value) => updateItem(index, { navType: value })}
                >
                    <SelectTrigger className="h-8 w-24">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="scroll">Scroll</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    value={item.target || ''}
                    onChange={(e) => updateItem(index, { target: e.target.value })}
                    placeholder={item.navType === 'scroll' ? '#section-id' : '/page-url'}
                    className="h-8 flex-1"
                />
                {item.navType === 'scroll' && (
                    <SelectTargetButton
                        onSelect={(componentId) => {
                            updateItem(index, { target: `#${componentId}` });
                        }}
                    />
                )}
            </div>
        </div>
    );
};

interface NavbarPropertiesProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    project?: { faviconUrl?: string } | null;
}

export const NavbarProperties: React.FC<NavbarPropertiesProps> = ({
    componentId,
    props,
    updateComponentProp,
    project
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const menuItems = props.menuItems || [];
            const getStableId = (item: any, i: number) => item.id || `menu-${i}`;
            const oldIndex = menuItems.findIndex((item: any, i: number) => getStableId(item, i) === active.id);
            const newIndex = menuItems.findIndex((item: any, i: number) => getStableId(item, i) === over.id);
            updateComponentProp('menuItems', arrayMove(menuItems, oldIndex, newIndex));
        }
    };

    const updateMenuItem = (index: number, updates: any) => {
        const newItems = [...(props.menuItems || [])];
        newItems[index] = { ...newItems[index], ...updates };
        updateComponentProp('menuItems', newItems);
    };

    const removeMenuItem = (index: number) => {
        const newItems = (props.menuItems || []).filter((_: any, i: number) => i !== index);
        updateComponentProp('menuItems', newItems);
    };

    const sortableItems = (props.menuItems || []).map((item: any, index: number) => ({
        ...item,
        id: item.id || `menu-${index}`
    }));

    return (
        <>
            {/* Appearance Section */}
            <div className="space-y-3 pb-4 border-b">
                <Label className="text-sm font-medium">Appearance</Label>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                            Global Scale ({props.scale || 1}x)
                        </Label>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => updateComponentProp('scale', 1)}
                        >
                            Reset
                        </Button>
                    </div>
                    <Slider
                        value={[props.scale || 1]}
                        onValueChange={([value]) => updateComponentProp('scale', value)}
                        min={0.8}
                        max={1.5}
                        step={0.05}
                        className="py-1"
                    />
                    <p className="text-xs text-muted-foreground">
                        Scales logo, text, padding, and buttons
                    </p>
                </div>
            </div>

            {/* Logo Section */}
            <div className="space-y-3 pb-4 border-b">
                <Label className="text-sm font-medium">Logo</Label>
                <div className="space-y-2">
                    <Label htmlFor="logo-type" className="text-xs text-muted-foreground">Type</Label>
                    <Select
                        value={props.logo?.type || 'text'}
                        onValueChange={(value) => updateComponentProp('logo', { ...props.logo, type: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Text (Brand Name)</SelectItem>
                            <SelectItem value="image">Image (Logo)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {(props.logo?.type || 'text') === 'text' ? (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="brand-name" className="text-xs text-muted-foreground">Brand Name</Label>
                            <Input
                                value={props.logo?.text || 'YourBrand'}
                                onChange={(e) => updateComponentProp('logo', { ...props.logo, text: e.target.value })}
                                placeholder="Enter brand name"
                            />
                        </div>

                        {/* Show Icon Toggle - for displaying logo next to text */}
                        <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-medium">Show Icon with Text</Label>
                                <p className="text-xs text-muted-foreground">
                                    {project?.faviconUrl ? 'Display logo icon next to brand name' : 'Upload a logo in Settings first'}
                                </p>
                            </div>
                            <Switch
                                checked={props.logo?.showIcon === true}
                                onCheckedChange={(checked) => updateComponentProp('logo', {
                                    ...props.logo,
                                    showIcon: checked
                                })}
                                disabled={!project?.faviconUrl}
                            />
                        </div>

                        {/* Icon preview when enabled */}
                        {props.logo?.showIcon && project?.faviconUrl && (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Preview</Label>
                                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/20">
                                    <img
                                        src={project.faviconUrl}
                                        alt="Logo icon"
                                        className="h-6 w-6 object-contain"
                                    />
                                    <span className="font-bold">{props.logo?.text || 'YourBrand'}</span>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Use Project Logo Toggle */}
                        <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-medium">Use Project Logo</Label>
                                <p className="text-xs text-muted-foreground">
                                    {project?.faviconUrl ? 'Use favicon from Settings' : 'No logo uploaded yet'}
                                </p>
                            </div>
                            <Switch
                                checked={props.logo?.useProjectLogo === true}
                                onCheckedChange={(checked) => updateComponentProp('logo', {
                                    ...props.logo,
                                    useProjectLogo: checked,
                                    imageUrl: checked ? '' : props.logo?.imageUrl
                                })}
                                disabled={!project?.faviconUrl}
                            />
                        </div>

                        {/* Show project logo preview when enabled */}
                        {props.logo?.useProjectLogo && project?.faviconUrl ? (
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Project Logo Preview</Label>
                                <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/20">
                                    <img
                                        src={project.faviconUrl}
                                        alt="Project logo"
                                        className="h-8 w-8 object-contain rounded"
                                    />
                                    <span className="text-xs text-muted-foreground truncate">
                                        {project.faviconUrl}
                                    </span>
                                </div>
                            </div>
                        ) : !props.logo?.useProjectLogo ? (
                            <div className="space-y-2">
                                <Label htmlFor="logo-url" className="text-xs text-muted-foreground">Logo Image URL</Label>
                                <Input
                                    value={props.logo?.imageUrl || ''}
                                    onChange={(e) => updateComponentProp('logo', { ...props.logo, imageUrl: e.target.value })}
                                    placeholder="https://example.com/logo.png"
                                />
                            </div>
                        ) : null}
                    </>
                )}
                <div className="space-y-2">
                    <Label htmlFor="logo-link" className="text-xs text-muted-foreground">Logo Link</Label>
                    <Input
                        value={props.logo?.link || '/'}
                        onChange={(e) => updateComponentProp('logo', { ...props.logo, link: e.target.value })}
                        placeholder="/"
                    />
                </div>
            </div>

            {/* Menu Items Section */}
            <div className="space-y-3 py-4 border-b">
                <Label className="text-sm font-medium">Menu Items</Label>
                <div className="space-y-2">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sortableItems.map((item: any) => item.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {sortableItems.map((item: any, index: number) => (
                                <SortableMenuItem
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    updateItem={updateMenuItem}
                                    removeItem={removeMenuItem}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                        const newItem = { id: `menu-${Date.now()}`, label: 'New Item', navType: 'scroll', target: '#' };
                        updateComponentProp('menuItems', [...(props.menuItems || []), newItem]);
                    }}
                >
                    + Add Menu Item
                </Button>
            </div>

            {/* CTA Buttons Section */}
            <div className="space-y-3 pt-4">
                <Label className="text-sm font-medium">CTA Buttons</Label>

                {/* Primary Button */}
                <div className="space-y-2 p-2 border rounded-md">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Primary Button</Label>
                        <Switch
                            checked={props.primaryButton?.enabled !== false}
                            onCheckedChange={(checked) => updateComponentProp('primaryButton', {
                                ...props.primaryButton,
                                enabled: checked
                            })}
                        />
                    </div>
                    {props.primaryButton?.enabled !== false && (
                        <>
                            <Input
                                value={props.primaryButton?.text || 'Get Started'}
                                onChange={(e) => updateComponentProp('primaryButton', {
                                    ...props.primaryButton,
                                    text: e.target.value
                                })}
                                placeholder="Button text"
                                className="h-8"
                            />
                            <div className="flex gap-2">
                                <Select
                                    value={props.primaryButton?.navType || 'link'}
                                    onValueChange={(value) => updateComponentProp('primaryButton', {
                                        ...props.primaryButton,
                                        navType: value
                                    })}
                                >
                                    <SelectTrigger className="h-8 w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="scroll">Scroll</SelectItem>
                                        <SelectItem value="link">Link</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={props.primaryButton?.target || ''}
                                    onChange={(e) => updateComponentProp('primaryButton', {
                                        ...props.primaryButton,
                                        target: e.target.value
                                    })}
                                    placeholder={props.primaryButton?.navType === 'scroll' ? '#section-id' : '/page-url'}
                                    className="h-8 flex-1"
                                />
                                {props.primaryButton?.navType === 'scroll' && (
                                    <SelectTargetButton
                                        onSelect={(componentId) => {
                                            updateComponentProp('primaryButton', {
                                                ...props.primaryButton,
                                                target: `#${componentId}`
                                            });
                                        }}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Secondary Button */}
                <div className="space-y-2 p-2 border rounded-md">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Secondary Button</Label>
                        <Switch
                            checked={props.secondaryButton?.enabled === true}
                            onCheckedChange={(checked) => updateComponentProp('secondaryButton', {
                                ...props.secondaryButton,
                                enabled: checked
                            })}
                        />
                    </div>
                    {props.secondaryButton?.enabled === true && (
                        <>
                            <Input
                                value={props.secondaryButton?.text || 'Learn More'}
                                onChange={(e) => updateComponentProp('secondaryButton', {
                                    ...props.secondaryButton,
                                    text: e.target.value
                                })}
                                placeholder="Button text"
                                className="h-8"
                            />
                            <div className="flex gap-2">
                                <Select
                                    value={props.secondaryButton?.navType || 'link'}
                                    onValueChange={(value) => updateComponentProp('secondaryButton', {
                                        ...props.secondaryButton,
                                        navType: value
                                    })}
                                >
                                    <SelectTrigger className="h-8 w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="scroll">Scroll</SelectItem>
                                        <SelectItem value="link">Link</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={props.secondaryButton?.target || ''}
                                    onChange={(e) => updateComponentProp('secondaryButton', {
                                        ...props.secondaryButton,
                                        target: e.target.value
                                    })}
                                    placeholder={props.secondaryButton?.navType === 'scroll' ? '#section-id' : '/page-url'}
                                    className="h-8 flex-1"
                                />
                                {props.secondaryButton?.navType === 'scroll' && (
                                    <SelectTargetButton
                                        onSelect={(componentId) => {
                                            updateComponentProp('secondaryButton', {
                                                ...props.secondaryButton,
                                                target: `#${componentId}`
                                            });
                                        }}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Dark Mode Toggle Section */}
            <div className="space-y-3 pt-4 border-t">
                <Label className="text-sm font-medium">Dark Mode</Label>
                <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Show Dark Mode Toggle</Label>
                        <p className="text-xs text-muted-foreground">
                            Display sun/moon icon to switch themes
                        </p>
                    </div>
                    <Switch
                        checked={props.showDarkModeToggle === true}
                        onCheckedChange={(checked) => updateComponentProp('showDarkModeToggle', checked)}
                    />
                </div>
            </div>

            {/* Sticky Navigation Section */}
            <div className="space-y-3 pt-4 border-t">
                <Label className="text-sm font-medium">Behavior</Label>
                <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Sticky Navigation</Label>
                        <p className="text-xs text-muted-foreground">
                            Keep navbar fixed at top when scrolling
                        </p>
                    </div>
                    <Switch
                        checked={props.sticky === true}
                        onCheckedChange={(checked) => updateComponentProp('sticky', checked)}
                    />
                </div>
            </div>
        </>
    );
};
