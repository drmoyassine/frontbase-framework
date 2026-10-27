import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { CategoryPropertySelector } from './CategoryPropertySelector';
import { PropertyControl } from './PropertyControl';
import { CSSEditor } from './CSSEditor';
import { CSS_PROPERTY_CONFIGS, CSS_CATEGORIES, getAllCategories } from '@/lib/styles/configs';
import { stylesToCSS, cssToStyles } from '@/lib/styles/converters';
import type { StylesData } from '@/lib/styles/types';
import {
    LayoutGrid,
    Space,
    Maximize2,
    Type,
    Palette,
    Sparkles,
    Image,
    LucideIcon
} from 'lucide-react';

// Category icons mapping
const CATEGORY_ICONS: Record<string, LucideIcon> = {
    'Layout': LayoutGrid,
    'Spacing': Space,
    'Sizing': Maximize2,
    'Typography': Type,
    'Backgrounds': Image,
    'Effects': Sparkles,
};

interface StylesPanelProps {
    styles: StylesData;
    onUpdate: (styles: StylesData) => void;
    title?: string;
    // Responsive styling context
    currentViewport?: 'mobile' | 'tablet' | 'desktop';
    viewportOverrides?: Record<string, any>;  // Current viewport's overrides
    onResetProperty?: (propertyId: string) => void;  // Reset property to inherited value
}

export const StylesPanel: React.FC<StylesPanelProps> = ({
    styles,
    onUpdate,
    title = 'Styles',
    currentViewport = 'desktop',
    viewportOverrides = {},
    onResetProperty
}) => {
    // Track which accordion categories are open
    const [openCategories, setOpenCategories] = useState<string[]>([]);

    const addProperty = (propertyId: string, category: string) => {
        const config = CSS_PROPERTY_CONFIGS[propertyId];
        if (!config) return;

        // Ensure the category stays open after adding
        if (!openCategories.includes(category)) {
            setOpenCategories([...openCategories, category]);
        }

        onUpdate({
            ...styles,
            activeProperties: [...styles.activeProperties, propertyId],
            values: {
                ...styles.values,
                [propertyId]: config.defaultValue
            }
        });
    };

    const removeProperty = (propertyId: string) => {
        const newActive = styles.activeProperties.filter(p => p !== propertyId);
        const newValues = { ...styles.values };
        delete newValues[propertyId];

        onUpdate({
            ...styles,
            activeProperties: newActive,
            values: newValues
        });
    };

    const updateValues = (newValues: any) => {
        onUpdate({
            ...styles,
            values: newValues
        });
    };

    const toggleMode = () => {
        onUpdate({
            ...styles,
            stylingMode: styles.stylingMode === 'visual' ? 'css' : 'visual'
        });
    };

    // Group properties by category - ALWAYS include all categories
    const getPropertiesByCategory = () => {
        const grouped: Record<string, string[]> = {};

        // Initialize ALL categories (even empty ones)
        getAllCategories().forEach(category => {
            grouped[category] = [];
        });

        // Then populate with active properties
        getAllCategories().forEach(category => {
            const categoryProps = styles.activeProperties.filter(propId => {
                const categoryPropertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
                return categoryPropertyIds.includes(propId);
            });

            grouped[category] = categoryProps;
        });

        return grouped;
    };

    const categorizedProperties = getPropertiesByCategory();

    return (
        <div className="styles-panel space-y-4">
            {title && (
                <h3 className="font-semibold text-sm">{title}</h3>
            )}

            {/* Styling Mode Toggle */}
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant={styles.stylingMode === 'visual' ? 'default' : 'outline'}
                        onClick={toggleMode}
                        size="sm"
                    >
                        Visual
                    </Button>
                    <Button
                        variant={styles.stylingMode === 'css' ? 'default' : 'outline'}
                        onClick={toggleMode}
                        size="sm"
                    >
                        CSS (Advanced)
                    </Button>
                </div>
            </div>

            <Separator />

            {styles.stylingMode === 'visual' ? (
                /* VISUAL MODE */
                <Accordion
                    type="multiple"
                    value={openCategories}
                    onValueChange={setOpenCategories}
                    className="w-full"
                >
                    {Object.entries(categorizedProperties).map(([category, propertyIds]) => {
                        const CategoryIcon = CATEGORY_ICONS[category];
                        return (
                            <AccordionItem key={category} value={category}>
                                <AccordionTrigger
                                    className="text-sm font-semibold"
                                    actions={
                                        <CategoryPropertySelector
                                            category={category}
                                            excludeProperties={styles.activeProperties}
                                            onSelect={(propId) => addProperty(propId, category)}
                                        />
                                    }
                                >
                                    <span className="flex items-center gap-2 flex-1">
                                        {CategoryIcon && <CategoryIcon className="h-4 w-4 text-muted-foreground" />}
                                        {category} ({propertyIds.length})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-2 pt-2">
                                        {propertyIds.length === 0 ? (
                                            <div className="text-xs text-muted-foreground text-center py-2">
                                                No properties. Click + to add.
                                            </div>
                                        ) : (
                                            propertyIds.map((propertyId) => {
                                                const config = CSS_PROPERTY_CONFIGS[propertyId];
                                                if (!config) return null;

                                                // Check if this property has a viewport-specific override
                                                const hasViewportOverride = propertyId in viewportOverrides;
                                                // Property is inherited if on non-desktop and no override exists
                                                const isInherited = currentViewport !== 'desktop' && !hasViewportOverride;

                                                return (
                                                    <PropertyControl
                                                        key={propertyId}
                                                        config={config}
                                                        value={styles.values[propertyId]}
                                                        onChange={(value) => updateValues({ ...styles.values, [propertyId]: value })}
                                                        onRemove={() => removeProperty(propertyId)}
                                                        currentViewport={currentViewport}
                                                        hasViewportOverride={hasViewportOverride}
                                                        isInherited={isInherited}
                                                        onResetToInherited={onResetProperty ? () => onResetProperty(propertyId) : undefined}
                                                    />
                                                );
                                            })
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            ) : (
                /* CSS MODE - Editable with bidirectional sync */
                <CSSEditor
                    css={stylesToCSS(styles.values)}
                    onApply={(newCss) => {
                        // Parse CSS and convert back to style values
                        const parsedValues = cssToStyles(newCss);

                        // Determine which properties are now active
                        const newActiveProperties = Object.keys(parsedValues).filter(
                            prop => CSS_PROPERTY_CONFIGS[prop]
                        );

                        onUpdate({
                            ...styles,
                            values: parsedValues,
                            activeProperties: newActiveProperties
                        });
                    }}
                />
            )}
        </div>
    );
};
