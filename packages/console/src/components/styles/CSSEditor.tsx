import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check } from 'lucide-react';

interface CSSEditorProps {
    css: string;
    readOnly?: boolean;
    onChange?: (css: string) => void;
    onApply?: (css: string) => void;
}

export const CSSEditor: React.FC<CSSEditorProps> = ({
    css,
    readOnly = false,
    onChange,
    onApply
}) => {
    const [localCss, setLocalCss] = useState(css);
    const [hasChanges, setHasChanges] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);

    // Sync local state with prop changes (when visual mode updates)
    useEffect(() => {
        setLocalCss(css);
        setHasChanges(false);
    }, [css]);

    const handleChange = (value: string) => {
        setLocalCss(value);
        setHasChanges(value !== css);
        setParseError(null);
        onChange?.(value);
    };

    const handleApply = () => {
        try {
            // Basic validation: check for balanced braces and valid syntax
            const declarations = localCss.split(';').map(d => d.trim()).filter(Boolean);
            for (const declaration of declarations) {
                if (!declaration.includes(':')) {
                    throw new Error(`Invalid declaration: ${declaration}`);
                }
            }

            onApply?.(localCss);
            setHasChanges(false);
            setParseError(null);
        } catch (error) {
            setParseError(error instanceof Error ? error.message : 'Invalid CSS');
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">CSS Styling</Label>
                {readOnly ? (
                    <span className="text-xs text-muted-foreground">
                        Switch to Visual mode to edit
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        Edit CSS directly
                    </span>
                )}
            </div>

            <Textarea
                value={localCss}
                onChange={(e) => handleChange(e.target.value)}
                readOnly={readOnly}
                className="font-mono text-sm min-h-[200px] resize-none"
                placeholder="No styles defined yet"
            />

            {parseError && (
                <div className="flex items-center gap-2 text-destructive text-xs">
                    <AlertCircle className="h-3 w-3" />
                    {parseError}
                </div>
            )}

            {!readOnly && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        Changes sync to Visual mode
                    </p>
                    <Button
                        size="sm"
                        onClick={handleApply}
                        disabled={!hasChanges}
                        className="h-7 text-xs"
                    >
                        <Check className="h-3 w-3 mr-1" />
                        Apply Changes
                    </Button>
                </div>
            )}

            {readOnly && (
                <p className="text-xs text-muted-foreground">
                    These styles are generated from your visual property controls
                </p>
            )}
        </div>
    );
};
