import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, Search } from 'lucide-react';
import { CSS_PROPERTY_CONFIGS, CSS_CATEGORIES } from '@/lib/styles/configs';

interface CategoryPropertySelectorProps {
    category: string;
    excludeProperties: string[];
    onSelect: (propertyId: string) => void;
}

export const CategoryPropertySelector: React.FC<CategoryPropertySelectorProps> = ({
    category,
    excludeProperties,
    onSelect
}) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Get available properties for this category
    const getAvailableProperties = () => {
        const propertyIds = CSS_CATEGORIES[category as keyof typeof CSS_CATEGORIES] || [];
        return propertyIds
            .filter(id => !excludeProperties.includes(id))
            .filter(id => {
                if (!searchQuery) return true;
                const config = CSS_PROPERTY_CONFIGS[id];
                return config?.name.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .map(id => CSS_PROPERTY_CONFIGS[id])
            .filter(Boolean);
    };

    const availableProperties = getAvailableProperties();

    const handleSelect = (propertyId: string) => {
        onSelect(propertyId);
        setOpen(false);
        setSearchQuery('');
    };

    // Don't show if no properties available for this category
    if (availableProperties.length === 0 && !open) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Plus className="h-3 w-3" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
                {availableProperties.length > 3 && (
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-7 h-7 text-xs"
                            />
                        </div>
                    </div>
                )}

                <div className="max-h-[200px] overflow-y-auto p-1">
                    {availableProperties.length === 0 ? (
                        <div className="text-center py-3 text-xs text-muted-foreground">
                            All properties added
                        </div>
                    ) : (
                        <TooltipProvider delayDuration={400}>
                            {availableProperties.map((config) => (
                                <Tooltip key={config.id}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start text-xs h-7 px-2"
                                            onClick={() => handleSelect(config.id)}
                                        >
                                            {config.name}
                                        </Button>
                                    </TooltipTrigger>
                                    {config.description && (
                                        <TooltipContent side="left" className="max-w-[200px] text-xs">
                                            {config.description}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            ))}
                        </TooltipProvider>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
