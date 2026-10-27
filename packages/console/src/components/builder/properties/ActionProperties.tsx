import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ActionPropertiesProps {
    activeTab?: string;
    componentId?: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ActionProperties: React.FC<ActionPropertiesProps> = ({
    activeTab = 'general',
    props,
    updateComponentProp
}) => {
    // Only render properties when viewing the 'general' tab
    if (activeTab !== 'general') {
        return null;
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="btn-text">Text</Label>
                <Input
                    id="btn-text"
                    value={props.text || ''}
                    onChange={(e) => updateComponentProp('text', e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="btn-variant">Variant</Label>
                <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                    <SelectTrigger id="btn-variant">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="destructive">Destructive</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="ghost">Ghost</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="btn-size">Size</Label>
                <Select value={props.size || 'default'} onValueChange={(value) => updateComponentProp('size', value)}>
                    <SelectTrigger id="btn-size">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="sm">Small</SelectItem>
                        <SelectItem value="lg">Large</SelectItem>
                        <SelectItem value="icon">Icon</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};
