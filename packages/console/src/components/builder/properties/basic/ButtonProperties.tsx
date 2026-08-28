/**
 * Button Properties Panel
 * Configuration UI for the Button component (includes icon settings)
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ActionProperties } from '../ActionProperties';
import { IconPicker } from '../IconPicker';

interface ButtonPropertiesProps {
    activeTab: string;
    componentId: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ButtonProperties: React.FC<ButtonPropertiesProps> = ({
    activeTab,
    componentId,
    props,
    updateComponentProp
}) => {
    if (activeTab !== 'general') {
        return null;
    }

    return (
        <>
            <ActionProperties
                activeTab={activeTab}
                componentId={componentId}
                props={props}
                updateComponentProp={updateComponentProp}
            />
            {/* Button Icon */}
            <div className="space-y-3 pt-4 border-t">
                <Label className="uppercase text-xs font-semibold text-muted-foreground">Button Icon</Label>

                <div className="space-y-2">
                    <Label className="text-xs">Icon</Label>
                    <IconPicker
                        value={props.buttonIcon || props.leftIcon || props.rightIcon || ''}
                        onChange={(icon) => {
                            updateComponentProp('buttonIcon', icon);
                            updateComponentProp('leftIcon', props.iconPosition === 'right' ? '' : icon);
                            updateComponentProp('rightIcon', props.iconPosition === 'right' ? icon : '');
                        }}
                    />
                </div>

                {(props.buttonIcon || props.leftIcon || props.rightIcon) && (
                    <div className="space-y-2">
                        <Label className="text-xs">Icon Position</Label>
                        <div className="flex gap-2">
                            <Button
                                variant={props.iconPosition !== 'right' ? 'default' : 'outline'}
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                    const icon = props.buttonIcon || props.leftIcon || props.rightIcon;
                                    updateComponentProp('iconPosition', 'left');
                                    updateComponentProp('leftIcon', icon);
                                    updateComponentProp('rightIcon', '');
                                }}
                            >
                                Left
                            </Button>
                            <Button
                                variant={props.iconPosition === 'right' ? 'default' : 'outline'}
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                    const icon = props.buttonIcon || props.leftIcon || props.rightIcon;
                                    updateComponentProp('iconPosition', 'right');
                                    updateComponentProp('rightIcon', icon);
                                    updateComponentProp('leftIcon', '');
                                }}
                            >
                                Right
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
