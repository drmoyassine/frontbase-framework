import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { VariableInput } from '../VariableInput';

interface DisplayPropertiesProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const DisplayProperties: React.FC<DisplayPropertiesProps> = ({
    type,
    props,
    updateComponentProp
}) => {
    // Alert component
    if (type === 'Alert') {
        return (
            <div className="space-y-2">
                <Label htmlFor="alert-message">Message</Label>
                <Textarea
                    id="alert-message"
                    value={props.message || ''}
                    onChange={(e) => updateComponentProp('message', e.target.value)}
                    rows={3}
                />
            </div>
        );
    }

    // Badge component
    if (type === 'Badge') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="badge-text">Text</Label>
                    <Input
                        id="badge-text"
                        value={props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="badge-variant">Variant</Label>
                    <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                            <SelectItem value="destructive">Destructive</SelectItem>
                            <SelectItem value="outline">Outline</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="badge-icon">Icon (Optional)</Label>
                    <IconPicker
                        value={props.icon || ''}
                        onChange={(value) => updateComponentProp('icon', value)}
                    />
                </div>
                {props.icon && (
                    <div className="space-y-2">
                        <Label htmlFor="badge-icon-position">Icon Position</Label>
                        <Select value={props.iconPosition || 'left'} onValueChange={(value) => updateComponentProp('iconPosition', value)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="badge-bg-color">Background Color</Label>
                    <div className="flex gap-2">
                        <Input
                            id="badge-bg-color"
                            type="color"
                            value={props.backgroundColor || '#000000'}
                            onChange={(e) => updateComponentProp('backgroundColor', e.target.value)}
                            className="w-20 h-9 p-1 cursor-pointer"
                        />
                        <Input
                            type="text"
                            value={props.backgroundColor || ''}
                            onChange={(e) => updateComponentProp('backgroundColor', e.target.value)}
                            placeholder="CSS color"
                            className="flex-1"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="badge-text-color">Text Color</Label>
                    <div className="flex gap-2">
                        <Input
                            id="badge-text-color"
                            type="color"
                            value={props.textColor || '#000000'}
                            onChange={(e) => updateComponentProp('textColor', e.target.value)}
                            className="w-20 h-9 p-1 cursor-pointer"
                        />
                        <Input
                            type="text"
                            value={props.textColor || ''}
                            onChange={(e) => updateComponentProp('textColor', e.target.value)}
                            placeholder="CSS color"
                            className="flex-1"
                        />
                    </div>
                </div>
                {props.icon && (
                    <div className="space-y-2">
                        <Label htmlFor="badge-icon-color">Icon Color</Label>
                        <div className="flex gap-2">
                            <Input
                                id="badge-icon-color"
                                type="color"
                                value={props.iconColor || '#000000'}
                                onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                                className="w-20 h-9 p-1 cursor-pointer"
                            />
                            <Input
                                type="text"
                                value={props.iconColor || ''}
                                onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                                placeholder="CSS color"
                                className="flex-1"
                            />
                        </div>
                    </div>
                )}
            </>
        );
    }

    // Progress component
    if (type === 'Progress') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="progress-value">Value (0-100)</Label>
                    <Input
                        id="progress-value"
                        type="number"
                        min="0"
                        max="100"
                        value={props.value || 50}
                        onChange={(e) => updateComponentProp('value', parseInt(e.target.value))}
                    />
                </div>
            </>
        );
    }



    // Card Component
    if (type === 'Card') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="card-title">Title <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                    <VariableInput
                        value={props.title || ''}
                        onChange={(value) => updateComponentProp('title', value)}
                        syntaxContext="output"
                        placeholder="Card title or type @ for variables"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="card-desc">Description <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                    <VariableInput
                        value={props.description || ''}
                        onChange={(value) => updateComponentProp('description', value)}
                        syntaxContext="output"
                        placeholder="Card description or type @ for variables"
                        multiline
                    />
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Icon</Label>
                    <div className="space-y-2">
                        <Label htmlFor="card-icon">Icon Name</Label>
                        <IconPicker
                            value={props.icon}
                            onChange={(val) => updateComponentProp('icon', val)}
                        />
                    </div>
                    {props.icon && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Size</Label>
                                <Select value={props.iconSize || 'md'} onValueChange={(v) => updateComponentProp('iconSize', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sm">Small</SelectItem>
                                        <SelectItem value="md">Medium</SelectItem>
                                        <SelectItem value="lg">Large</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        value={props.iconColor || '#000000'}
                                        onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                                        className="w-8 h-8 p-1 px-1"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Alignment</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Icon Align</Label>
                            <Select value={props.iconAlignment || 'center'} onValueChange={(v) => updateComponentProp('iconAlignment', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Text Align</Label>
                            <Select value={props.textAlignment || 'center'} onValueChange={(v) => updateComponentProp('textAlignment', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Embed component
    if (type === 'Embed') {
        const embedType = props.embedType || 'iframe';
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="embed-type">Embed Type</Label>
                    <Select value={embedType} onValueChange={(value) => updateComponentProp('embedType', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="iframe">Iframe (URL)</SelectItem>
                            <SelectItem value="script">Script (HTML/JS)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {embedType === 'iframe' ? (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="embed-src">URL</Label>
                            <Input
                                id="embed-src"
                                value={props.src || ''}
                                onChange={(e) => updateComponentProp('src', e.target.value)}
                                placeholder="https://example.com/embed"
                            />
                            <p className="text-xs text-muted-foreground">
                                Paste the iframe URL from Typeform, Tally, YouTube, etc.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="embed-title">Title (Accessibility)</Label>
                            <Input
                                id="embed-title"
                                value={props.title || ''}
                                onChange={(e) => updateComponentProp('title', e.target.value)}
                                placeholder="Embedded content"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="embed-sandbox">Sandbox Permissions</Label>
                            <Select
                                value={props.sandbox || 'allow-scripts allow-same-origin allow-forms'}
                                onValueChange={(value) => updateComponentProp('sandbox', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="allow-scripts allow-same-origin allow-forms">Standard (Forms)</SelectItem>
                                    <SelectItem value="allow-scripts allow-same-origin allow-forms allow-popups">With Popups</SelectItem>
                                    <SelectItem value="allow-scripts allow-same-origin">Minimal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <p className="text-xs text-amber-700">
                                ⚠️ Script embeds execute raw HTML/JS. Only use trusted sources.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="embed-html">HTML / Script Code</Label>
                            <Textarea
                                id="embed-html"
                                value={props.html || ''}
                                onChange={(e) => updateComponentProp('html', e.target.value)}
                                placeholder='<script src="..."></script>'
                                rows={6}
                                className="font-mono text-xs"
                            />
                        </div>
                    </>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="embed-width">Width</Label>
                        <Input
                            id="embed-width"
                            value={props.width || '100%'}
                            onChange={(e) => updateComponentProp('width', e.target.value)}
                            placeholder="100%"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="embed-height">Height</Label>
                        <Input
                            id="embed-height"
                            value={props.height || '400px'}
                            onChange={(e) => updateComponentProp('height', e.target.value)}
                            placeholder="400px"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="embed-loading">Loading</Label>
                    <Select value={props.loading || 'lazy'} onValueChange={(value) => updateComponentProp('loading', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="lazy">Lazy (Recommended)</SelectItem>
                            <SelectItem value="eager">Eager</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    return null;
};
