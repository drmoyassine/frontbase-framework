/**
 * Select Properties Panel
 * Configuration UI for the Select component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface SelectPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const SelectProperties: React.FC<SelectPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="select-placeholder">Placeholder</Label>
                <Input
                    id="select-placeholder"
                    value={props.placeholder || ''}
                    onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="select-options">Options (one per line)</Label>
                <Textarea
                    id="select-options"
                    value={(props.options || []).join('\n')}
                    onChange={(e) => updateComponentProp('options', e.target.value.split('\n').filter(Boolean))}
                    rows={4}
                />
            </div>
        </>
    );
};
