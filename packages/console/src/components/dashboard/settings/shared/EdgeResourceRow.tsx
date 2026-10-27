/**
 * EdgeResourceRow
 * 
 * Shared row shell for edge resource lists (databases, caches, queues).
 * Matches the visual pattern of EdgeProvidersSection:
 *   icon-box → name + badges → subtitle → actions
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

interface EdgeResourceRowProps {
    /** Provider icon element (e.g., from PROVIDER_ICONS) */
    icon: React.ReactNode;
    /** Primary resource name */
    name: string;
    /** Subtitle below name (e.g., provider resource-type label) */
    subtitle?: string;
    /** Status/info badges rendered inline with the name */
    badges?: React.ReactNode;
    /** Metadata (dates, counts) rendered left of actions */
    metadata?: React.ReactNode;
    /** Action buttons on the right */
    actions?: React.ReactNode;
    /** Show checkbox for bulk select */
    selectable?: boolean;
    /** Whether the checkbox is checked */
    selected?: boolean;
    /** Callback when checkbox changes */
    onSelectChange?: () => void;
    /** Whether to show a placeholder spacer instead of checkbox (for non-selectable items in a selectable list) */
    showSelectSpacer?: boolean;
    /** Additional className for the row container */
    className?: string;
    children?: React.ReactNode;
}

export const EdgeResourceRow: React.FC<EdgeResourceRowProps> = ({
    icon,
    name,
    subtitle,
    badges,
    metadata,
    actions,
    selectable = false,
    selected = false,
    onSelectChange,
    showSelectSpacer = false,
    className,
    children,
}) => {
    return (
        <div
            className={cn(
                'border rounded-lg bg-card hover:border-primary/50 transition-colors',
                selected && 'ring-1 ring-primary border-primary',
                className,
            )}
        >
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    {selectable && (
                        <Checkbox
                            checked={selected}
                            onCheckedChange={onSelectChange}
                        />
                    )}
                    {!selectable && showSelectSpacer && (
                        <div className="w-4 shrink-0" />
                    )}
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{name}</h4>
                            {badges}
                        </div>
                        {subtitle && (
                            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {metadata}
                    {actions}
                </div>
            </div>
            {children}
        </div>
    );
};
