import React from 'react';
import { PropertyControl } from './PropertyControl';
import { CSS_PROPERTY_CONFIGS } from '@/lib/styles/configs';
import type { StyleValues } from '@/lib/styles/types';

interface PropertyListProps {
    activeProperties: string[];
    values: StyleValues;
    onUpdate: (values: StyleValues) => void;
    onRemove: (propertyId: string) => void;
}

export const PropertyList: React.FC<PropertyListProps> = ({
    activeProperties,
    values,
    onUpdate,
    onRemove
}) => {
    const handlePropertyChange = (propertyId: string, value: any) => {
        onUpdate({
            ...values,
            [propertyId]: value
        });
    };

    if (activeProperties.length === 0) {
        return (
            <div className="text-center py-8 text-sm text-muted-foreground">
                No properties added yet. Click "Add Property" to get started.
            </div>
        );
    }

    return (
        <div className="property-list space-y-2">
            {activeProperties.map((propertyId) => {
                const config = CSS_PROPERTY_CONFIGS[propertyId];
                if (!config) return null;

                return (
                    <PropertyControl
                        key={propertyId}
                        config={config}
                        value={values[propertyId]}
                        onChange={(value) => handlePropertyChange(propertyId, value)}
                        onRemove={() => onRemove(propertyId)}
                    />
                );
            })}
        </div>
    );
};
