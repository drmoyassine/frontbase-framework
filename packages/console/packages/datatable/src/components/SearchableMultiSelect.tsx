import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchableMultiSelectProps {
    value: string[];
    onChange: (value: string[]) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

/**
 * Multi-select dropdown with embedded search functionality
 */
export function SearchableMultiSelect({
    value = [],
    onChange,
    options,
    placeholder = 'Select...',
    className,
    disabled = false,
}: SearchableMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const lowerSearch = search.toLowerCase();
        return options.filter(
            (opt) =>
                opt.label.toLowerCase().includes(lowerSearch) ||
                opt.value.toLowerCase().includes(lowerSearch)
        );
    }, [options, search]);

    const toggleValue = (optValue: string) => {
        if (value.includes(optValue)) {
            onChange(value.filter((v) => v !== optValue));
        } else {
            onChange([...value, optValue]);
        }
    };

    const displayText =
        value.length === 0
            ? placeholder
            : value.length === 1
                ? options.find((opt) => opt.value === value[0])?.label || value[0]
                : `${value.length} selected`;

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    'w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-left',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    'flex items-center justify-between',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
            >
                <span className={value.length > 0 ? '' : 'text-muted-foreground'}>
                    {displayText}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border border-input bg-background shadow-lg">
                    <div className="p-2 border-b border-input">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                        />
                    </div>
                    {value.length > 0 && (
                        <div
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-muted text-muted-foreground border-b border-input"
                            onClick={() => onChange([])}
                        >
                            Clear all
                        </div>
                    )}
                    <div className="max-h-[200px] overflow-y-auto">
                        {filteredOptions.map((opt) => (
                            <div
                                key={opt.value}
                                className={cn(
                                    'px-3 py-2 text-sm cursor-pointer hover:bg-muted flex items-center gap-2',
                                    value.includes(opt.value) && 'bg-primary/10'
                                )}
                                onClick={() => toggleValue(opt.value)}
                            >
                                <div
                                    className={cn(
                                        'w-4 h-4 border rounded flex items-center justify-center',
                                        value.includes(opt.value)
                                            ? 'bg-primary border-primary'
                                            : 'border-input'
                                    )}
                                >
                                    {value.includes(opt.value) && (
                                        <Check className="w-3 h-3 text-primary-foreground" />
                                    )}
                                </div>
                                {opt.label}
                            </div>
                        ))}
                        {filteredOptions.length === 0 && (
                            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                                No results
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
