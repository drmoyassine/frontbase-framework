import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

/**
 * Dropdown select with embedded search functionality
 */
export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    className,
    disabled = false,
}: SearchableSelectProps) {
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

    const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;

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
                <span className={value ? '' : 'text-muted-foreground'}>{selectedLabel}</span>
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
                    <div className="max-h-[200px] overflow-y-auto">
                        <div
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-muted text-muted-foreground"
                            onClick={() => {
                                onChange('');
                                setIsOpen(false);
                                setSearch('');
                            }}
                        >
                            All
                        </div>
                        {filteredOptions.map((opt) => (
                            <div
                                key={opt.value}
                                className={cn(
                                    'px-3 py-2 text-sm cursor-pointer hover:bg-muted',
                                    opt.value === value && 'bg-primary/10 text-primary'
                                )}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                    setSearch('');
                                }}
                            >
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
