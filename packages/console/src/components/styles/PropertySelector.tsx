import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, Search } from 'lucide-react';
import { CSS_PROPERTY_CONFIGS, CSS_CATEGORIES, getAllCategories } from '@/lib/styles/configs';

interface PropertySelectorProps {
    excludeProperties: string[];
    onSelect: (propertyId: string) => void;
}

export const PropertySelector: React.FC<PropertySelectorProps> = ({
    excludeProperties,
    onSelect
}) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const categories = getAllCategories();

    // Filter properties based on search and exclusions
    const getFilteredProperties = (categoryName: string) => {
        const propertyIds = CSS_CATEGORIES[categoryName as keyof typeof CSS_CATEGORIES] || [];
        return propertyIds
            .filter(id => !excludeProperties.includes(id))
            .filter(id => {
                if (!searchQuery) return true;
                const config = CSS_PROPERTY_CONFIGS[id];
                return config.name.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(id => CSS_PROPERTY_CONFIGS[id]);
    };

    const handleSelect = (propertyId: string) => {
        onSelect(propertyId);
        setOpen(false);
        setSearchQuery('');
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Property
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
                <div className="p-3 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search properties..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto p-2">
                    {categories.map((categoryName) => {
                        const properties = getFilteredProperties(categoryName);
                        if (properties.length === 0) return null;

                        return (
                            <div key={categoryName} className="mb-3">
                                <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                                    {categoryName}
                                </div>
                                <div className="space-y-1">
                                    {properties.map((config) => (
                                        <Button
                                            key={config.id}
                                            variant="ghost"
                                            className="w-full justify-start text-sm h-auto py-2"
                                            onClick={() => handleSelect(config.id)}
                                        >
                                            <div className="text-left">
                                                <div className="font-medium">{config.name}</div>
                                                {config.description && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {config.description}
                                                    </div>
                                                )}
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {categories.every(cat => getFilteredProperties(cat).length === 0) && (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                            No properties found
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
