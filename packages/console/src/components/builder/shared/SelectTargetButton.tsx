/**
 * SelectTargetButton - Shared component for visual target selection with anchor prompt
 * 
 * Used in Navbar CTA configuration and ActionConfigurator for scroll-to-section actions.
 * Prompts for optional anchor slug after target selection.
 */

import React, { useState } from 'react';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useBuilderStore } from '@/stores/builder';
import { useShallow } from 'zustand/react/shallow';

interface SelectTargetButtonProps {
    /** Called with the final section ID (anchor or component ID) */
    onSelect: (sectionId: string) => void;
    /** Button size variant */
    size?: 'default' | 'sm' | 'icon';
    /** Additional class names */
    className?: string;
}

export const SelectTargetButton: React.FC<SelectTargetButtonProps> = ({
    onSelect,
    size = 'icon',
    className = ''
}) => {
    const { enterScrollTargetMode, updateComponent } = useBuilderStore(useShallow(s => ({
        enterScrollTargetMode: s.enterScrollTargetMode,
        updateComponent: s.updateComponent
    })));
    const [showAnchorDialog, setShowAnchorDialog] = useState(false);
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [anchorValue, setAnchorValue] = useState('');

    const handleTargetSelected = (componentId: string) => {
        setSelectedTargetId(componentId);
        setAnchorValue('');
        setShowAnchorDialog(true);
    };

    const handleAnchorSave = () => {
        if (selectedTargetId) {
            // Save anchor to target element's props if provided
            if (anchorValue.trim()) {
                updateComponent(selectedTargetId, { anchor: anchorValue.trim() });
            }
            // Return the anchor or component ID
            onSelect(anchorValue.trim() || selectedTargetId);
        }
        resetState();
    };

    const handleSkipAnchor = () => {
        if (selectedTargetId) {
            onSelect(selectedTargetId);
        }
        resetState();
    };

    const resetState = () => {
        setShowAnchorDialog(false);
        setSelectedTargetId(null);
        setAnchorValue('');
    };

    return (
        <>
            <Button
                variant="outline"
                size={size}
                className={`${size === 'icon' ? 'h-8 w-8 shrink-0' : ''} ${className}`}
                title="Click to select target on canvas"
                onClick={() => {
                    enterScrollTargetMode(handleTargetSelected);
                }}
            >
                <Target className="h-4 w-4" />
            </Button>

            {/* Anchor Prompt Dialog */}
            {showAnchorDialog && (
                <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/50">
                    <div className="bg-background border rounded-lg shadow-lg p-6 w-80 space-y-4">
                        <div>
                            <h3 className="font-semibold text-foreground">Set Section Anchor</h3>
                            <p className="text-sm text-muted-foreground">
                                Enter a custom URL slug for this section (optional)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="anchor-input" className="text-sm">Anchor Slug</Label>
                            <Input
                                id="anchor-input"
                                value={anchorValue}
                                onChange={(e) => setAnchorValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="e.g., pricing, features, about"
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                URL will show: #{anchorValue || selectedTargetId}
                            </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={handleSkipAnchor}>
                                Skip
                            </Button>
                            <Button size="sm" onClick={handleAnchorSave}>
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
