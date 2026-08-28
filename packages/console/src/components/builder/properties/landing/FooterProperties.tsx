/**
 * Footer Properties Panel
 * Configuration UI for the Footer component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FooterPropertiesProps {
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    project?: { faviconUrl?: string } | null;
}

interface FooterLink {
    id: string;
    text: string;
    href: string;
}

interface FooterColumn {
    id: string;
    title: string;
    links: FooterLink[];
}

interface SocialLink {
    id: string;
    icon: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'github' | 'discord' | 'tiktok' | 'reddit' | 'threads' | 'twitch' | 'pinterest' | 'snapchat';
    href: string;
}

const SOCIAL_OPTIONS = [
    { value: 'facebook', label: 'Facebook' },
    { value: 'twitter', label: 'Twitter / X' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'github', label: 'GitHub' },
    { value: 'discord', label: 'Discord' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'reddit', label: 'Reddit' },
    { value: 'threads', label: 'Threads' },
    { value: 'twitch', label: 'Twitch' },
    { value: 'pinterest', label: 'Pinterest' },
    { value: 'snapchat', label: 'Snapchat' },
] as const;

export const FooterProperties: React.FC<FooterPropertiesProps> = ({
    componentId,
    props,
    updateComponentProp,
    project
}) => {
    const [expandedColumn, setExpandedColumn] = React.useState<string | null>(null);

    // Helper to generate unique IDs
    const generateId = () => `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // --- Column Management ---
    const addColumn = () => {
        const newColumn: FooterColumn = {
            id: generateId(),
            title: 'New Column',
            links: []
        };
        updateComponentProp('columns', [...(props.columns || []), newColumn]);
        setExpandedColumn(newColumn.id);
    };

    const updateColumn = (columnId: string, updates: Partial<FooterColumn>) => {
        const columns = (props.columns || []).map((col: FooterColumn) =>
            col.id === columnId ? { ...col, ...updates } : col
        );
        updateComponentProp('columns', columns);
    };

    const removeColumn = (columnId: string) => {
        updateComponentProp('columns', (props.columns || []).filter((col: FooterColumn) => col.id !== columnId));
    };

    // --- Link Management ---
    const addLink = (columnId: string) => {
        const newLink: FooterLink = { id: generateId(), text: 'New Link', href: '#' };
        const columns = (props.columns || []).map((col: FooterColumn) =>
            col.id === columnId
                ? { ...col, links: [...(col.links || []), newLink] }
                : col
        );
        updateComponentProp('columns', columns);
    };

    const updateLink = (columnId: string, linkId: string, updates: Partial<FooterLink>) => {
        const columns = (props.columns || []).map((col: FooterColumn) =>
            col.id === columnId
                ? {
                    ...col,
                    links: col.links.map((link: FooterLink) =>
                        link.id === linkId ? { ...link, ...updates } : link
                    )
                }
                : col
        );
        updateComponentProp('columns', columns);
    };

    const removeLink = (columnId: string, linkId: string) => {
        const columns = (props.columns || []).map((col: FooterColumn) =>
            col.id === columnId
                ? { ...col, links: col.links.filter((link: FooterLink) => link.id !== linkId) }
                : col
        );
        updateComponentProp('columns', columns);
    };

    // --- Social Management ---
    const addSocial = () => {
        const usedIcons = (props.socials || []).map((s: SocialLink) => s.icon);
        const availableIcon = SOCIAL_OPTIONS.find(opt => !usedIcons.includes(opt.value))?.value || 'github';
        const newSocial: SocialLink = { id: generateId(), icon: availableIcon, href: '#' };
        updateComponentProp('socials', [...(props.socials || []), newSocial]);
    };

    const updateSocial = (socialId: string, updates: Partial<SocialLink>) => {
        const socials = (props.socials || []).map((s: SocialLink) =>
            s.id === socialId ? { ...s, ...updates } : s
        );
        updateComponentProp('socials', socials);
    };

    const removeSocial = (socialId: string) => {
        updateComponentProp('socials', (props.socials || []).filter((s: SocialLink) => s.id !== socialId));
    };

    return (
        <>
            {/* Brand Section */}
            <div className="space-y-3 pb-4 border-b">
                <Label className="text-sm font-medium">Brand</Label>
                <div className="space-y-2">
                    <Label htmlFor="logo-text" className="text-xs text-muted-foreground">Logo Text</Label>
                    <Input
                        value={props.logoText || ''}
                        onChange={(e) => updateComponentProp('logoText', e.target.value)}
                        placeholder="Your Brand"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="logo-url" className="text-xs text-muted-foreground">Logo Image URL (optional)</Label>
                    <Input
                        value={props.logo || ''}
                        onChange={(e) => updateComponentProp('logo', e.target.value)}
                        placeholder="https://example.com/logo.png"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="description" className="text-xs text-muted-foreground">Description</Label>
                    <Textarea
                        value={props.description || ''}
                        onChange={(e) => updateComponentProp('description', e.target.value)}
                        placeholder="A short description of your company"
                        rows={3}
                    />
                </div>
            </div>

            {/* Layout Section */}
            <div className="space-y-3 py-4 border-b border-2 border-red-500 bg-red-50">
                <Label className="text-sm font-medium text-red-600">Layout (DEBUG MODE)</Label>
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Mobile Columns</Label>
                    <Select
                        value={String(props.mobileColumns || 1)}
                        onValueChange={(value) => updateComponentProp('mobileColumns', parseInt(value))}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select columns" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 Column (Stacked)</SelectItem>
                            <SelectItem value="2">2 Columns</SelectItem>
                            <SelectItem value="3">3 Columns</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Link Columns Section */}
            <div className="space-y-3 py-4 border-b">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Link Columns</Label>
                    <Button variant="outline" size="sm" onClick={addColumn}>
                        <Plus className="h-3 w-3 mr-1" /> Add Column
                    </Button>
                </div>

                <div className="space-y-2">
                    {(props.columns || []).map((column: FooterColumn, colIndex: number) => (
                        <div key={column.id} className="border rounded-md bg-muted/30">
                            {/* Column Header */}
                            <div
                                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
                                onClick={() => setExpandedColumn(expandedColumn === column.id ? null : column.id)}
                            >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={column.title}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        updateColumn(column.id, { title: e.target.value });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-7 flex-1"
                                    placeholder="Column Title"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={(e) => { e.stopPropagation(); removeColumn(column.id); }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                                {expandedColumn === column.id
                                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                }
                            </div>

                            {/* Column Links (Expanded) */}
                            {expandedColumn === column.id && (
                                <div className="p-2 pt-0 space-y-2">
                                    {(column.links || []).map((link: FooterLink) => (
                                        <div key={link.id} className="flex gap-2 items-center">
                                            <Input
                                                value={link.text}
                                                onChange={(e) => updateLink(column.id, link.id, { text: e.target.value })}
                                                placeholder="Link text"
                                                className="h-7 flex-1"
                                            />
                                            <Input
                                                value={link.href}
                                                onChange={(e) => updateLink(column.id, link.id, { href: e.target.value })}
                                                placeholder="/page or #section"
                                                className="h-7 flex-1"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={() => removeLink(column.id, link.id)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-7 text-xs"
                                        onClick={() => addLink(column.id)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" /> Add Link
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}

                    {(!props.columns || props.columns.length === 0) && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                            No columns yet. Click "Add Column" to create one.
                        </p>
                    )}
                </div>
            </div>

            {/* Social Links Section */}
            <div className="space-y-3 py-4 border-b">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Social Links</Label>
                    <Button variant="outline" size="sm" onClick={addSocial} disabled={(props.socials || []).length >= SOCIAL_OPTIONS.length}>
                        <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                </div>

                <div className="space-y-2">
                    {(props.socials || []).map((social: SocialLink) => (
                        <div key={social.id} className="flex gap-2 items-center p-2 border rounded-md bg-muted/30">
                            <select
                                value={social.icon}
                                onChange={(e) => updateSocial(social.id, { icon: e.target.value as any })}
                                className="h-7 px-2 rounded border bg-background text-sm"
                            >
                                {SOCIAL_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <Input
                                value={social.href}
                                onChange={(e) => updateSocial(social.id, { href: e.target.value })}
                                placeholder="https://..."
                                className="h-7 flex-1"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeSocial(social.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Copyright Section */}
            <div className="space-y-3 pt-4">
                <Label className="text-sm font-medium">Copyright</Label>
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                        Copyright Text <span className="text-muted-foreground/70">(use {"{{year}}"} for current year)</span>
                    </Label>
                    <Input
                        value={props.copyright || ''}
                        onChange={(e) => updateComponentProp('copyright', e.target.value)}
                        placeholder="© {{year}} Your Company. All rights reserved."
                    />
                </div>
            </div>
        </>
    );
};
