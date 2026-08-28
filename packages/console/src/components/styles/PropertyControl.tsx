import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, HelpCircle, Smartphone, Tablet, Monitor } from 'lucide-react';
import { SelectControl } from './controls/SelectControl';
import { NumberControl } from './controls/NumberControl';
import { ColorControl } from './controls/ColorControl';
import { SpacingControl } from './controls/SpacingControl';
import { SizingControl } from './controls/SizingControl';
import { DimensionControl } from './controls/DimensionControl';
import { CompositeControl } from './controls/CompositeControl';
import { ToggleGroupControl } from './controls/ToggleGroupControl';
import type { CSSPropertyConfig, ViewportType } from '@/lib/styles/types';

interface PropertyControlProps {
    config: CSSPropertyConfig;
    value: any;
    onChange: (value: any) => void;
    onRemove: () => void;
    // Responsive styling props
    currentViewport?: ViewportType;
    hasViewportOverride?: boolean;  // True if this property has an override for current viewport
    isInherited?: boolean;  // True if value is inherited from base (no override)
    onResetToInherited?: () => void;  // Called when user wants to reset to inherited value
}

export const PropertyControl: React.FC<PropertyControlProps> = ({
    config,
    value,
    onChange,
    onRemove,
    currentViewport = 'desktop',
    hasViewportOverride = false,
    isInherited = false,
    onResetToInherited
}) => {
    // Viewport indicator icon
    const ViewportIcon = currentViewport === 'mobile' ? Smartphone :
        currentViewport === 'tablet' ? Tablet : Monitor;

    return (
        <div className="property-control border border-border rounded-md p-2 mb-2 bg-background/50">
            {/* Label with optional tooltip and viewport indicator */}
            <div className="flex items-center gap-1 mb-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {config.name}
                </Label>
                {config.description && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px] text-xs">
                                {config.description}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                {/* Viewport override indicator - show blue dot if has override for current viewport */}
                {hasViewportOverride && currentViewport !== 'desktop' && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="w-2 h-2 rounded-full bg-blue-500 ml-1" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                Has {currentViewport} override
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                {/* Inherited indicator - show when using base value on non-desktop */}
                {isInherited && currentViewport !== 'desktop' && (
                    <span className="text-[9px] text-muted-foreground/60 ml-auto">
                        ↪ inherited
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 justify-between">
                {/* Control input - takes remaining space */}
                <div className="property-control-input flex-1">
                    {config.controlType === 'select' && config.useToggleGroup && (
                        <ToggleGroupControl config={config} value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'select' && !config.useToggleGroup && (
                        <SelectControl config={config} value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'number' && (
                        <NumberControl config={config} value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'color' && (
                        <ColorControl value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'spacing' && (
                        <SpacingControl value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'composite' && (
                        <CompositeControl config={config} value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'sizing' && (
                        <SizingControl value={value} onChange={onChange} />
                    )}

                    {config.controlType === 'dimension' && (
                        <DimensionControl
                            value={value}
                            onChange={onChange}
                            dimension={(config as any).dimension || 'width'}
                            placeholder={(config as any).defaultValue?.value === 'none' ? 'none' : 'auto'}
                        />
                    )}

                    {config.controlType === 'text' && (
                        <Input
                            value={value || ''}
                            onChange={(e) => onChange(e.target.value)}
                            className="h-7 text-xs px-2"
                            placeholder={config.defaultValue || ''}
                        />
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Reset to inherited - only shown when property has override on non-desktop */}
                    {hasViewportOverride && currentViewport !== 'desktop' && onResetToInherited && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onResetToInherited}
                            className="h-5 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                            title="Reset to inherited value"
                        >
                            ↩
                        </Button>
                    )}

                    {/* Remove button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                        className="h-5 w-5 p-0"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
