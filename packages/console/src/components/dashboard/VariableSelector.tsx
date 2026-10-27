import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Plus, User, Database, Clock, Key, ChevronRight, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface VariableOption {
    value: string;
    label: string;
    description?: string;
    category: 'user' | 'system' | 'target' | 'other';
}

interface VariableSelectorProps {
    onSelect: (value: string, category: VariableOption['category']) => void;
    userColumns?: Array<{ name: string; type: string }>; // For 'user' category
    targetColumns?: Array<{ name: string; type: string }>; // For 'target' category (comparing row cols)
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    allowedCategories?: VariableOption['category'][]; // Control which categories are visible
}

type MenuLevel = 'root' | 'user' | 'system' | 'target';

function getUniqueColumns(columns: Array<{ name: string; type: string }>) {
    const seen = new Set();
    return columns.filter(col => {
        if (seen.has(col.name)) return false;
        seen.add(col.name);
        return true;
    });
}

export function VariableSelector({
    onSelect,
    userColumns = [],
    targetColumns = [],
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    allowedCategories
}: VariableSelectorProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [view, setView] = useState<MenuLevel>('root');

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

    // Filter categories if allowedCategories is provided
    const showUser = !allowedCategories || allowedCategories.includes('user');
    const showSystem = !allowedCategories || allowedCategories.includes('system');
    const showTarget = !allowedCategories || allowedCategories.includes('target');

    // Reset view when closing
    useEffect(() => {
        if (!open) {
            // Small timeout to allow transition to finish before resetting
            const timer = setTimeout(() => setView('root'), 200);
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Deduplicate columns to avoid UI issues
    const uniqueUserColumns = React.useMemo(() => getUniqueColumns(userColumns), [userColumns]);
    const uniqueTargetColumns = React.useMemo(() => getUniqueColumns(targetColumns), [targetColumns]);

    const handleSelect = (value: string, category: VariableOption['category']) => {
        onSelect(value, category);
        setOpen?.(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-muted ml-1 shrink-0"
                    title="Insert Variable"
                >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[240px]" align="start">
                <Command>
                    {/* Header with Back Button */}
                    {view !== 'root' && (
                        <div className="flex items-center border-b p-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 mr-2"
                                onClick={() => setView('root')}
                            >
                                <ArrowLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs font-semibold capitalize">{view} Variables</span>
                        </div>
                    )}

                    <CommandInput placeholder={view === 'root' ? "Search category..." : "Search variables..."} />

                    {/* 
                        Use ScrollArea or rely on CommandList's native scroll. 
                        CommandList usually has overflow-y-auto. 
                        We set max-h to ensure it fits on screen.
                    */}
                    <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>No results found.</CommandEmpty>

                        {/* ROOT VIEW */}
                        {view === 'root' && (
                            <CommandGroup heading="Variable Categories">
                                {showUser && (
                                    <CommandItem onSelect={() => setView('user')} className="flex items-center justify-between cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">User</Badge>
                                            <span className="text-sm">Attributes</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    </CommandItem>
                                )}

                                {showSystem && (
                                    <CommandItem onSelect={() => setView('system')} className="flex items-center justify-between cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">System</Badge>
                                            <span className="text-sm">Global Vars</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    </CommandItem>
                                )}

                                {showTarget && (
                                    <CommandItem onSelect={() => setView('target')} className="flex items-center justify-between cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">Record</Badge>
                                            <span className="text-sm">Target Columns</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    </CommandItem>
                                )}
                            </CommandGroup>
                        )}

                        {/* USER VARIABLES VIEW */}
                        {view === 'user' && (
                            <CommandGroup>
                                {uniqueUserColumns.map(col => (
                                    <CommandItem
                                        key={`user-${col.name}`}
                                        onSelect={() => handleSelect(col.name, 'user')}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <Badge variant="outline" className="h-5 px-1 font-normal bg-blue-50/50">{col.name}</Badge>
                                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{col.type}</span>
                                    </CommandItem>
                                ))}
                                {uniqueUserColumns.length === 0 && (
                                    <div className="p-4 text-xs text-center text-muted-foreground">
                                        No user columns available.
                                    </div>
                                )}
                            </CommandGroup>
                        )}

                        {/* SYSTEM VARIABLES VIEW */}
                        {view === 'system' && (
                            <CommandGroup>
                                <CommandItem onSelect={() => handleSelect('auth.uid()', 'system')} className="gap-2 cursor-pointer">
                                    <Badge variant="outline" className="h-5 px-1 font-normal bg-slate-50">User ID</Badge>
                                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">auth.uid()</span>
                                </CommandItem>
                                <CommandItem onSelect={() => handleSelect('auth.email()', 'system')} className="gap-2 cursor-pointer">
                                    <Badge variant="outline" className="h-5 px-1 font-normal bg-slate-50">User Email</Badge>
                                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">auth.email()</span>
                                </CommandItem>
                                <CommandItem onSelect={() => handleSelect('now()', 'system')} className="gap-2 cursor-pointer">
                                    <Badge variant="outline" className="h-5 px-1 font-normal bg-slate-50">Timestamp</Badge>
                                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">now()</span>
                                </CommandItem>
                            </CommandGroup>
                        )}

                        {/* TARGET VARIABLES VIEW */}
                        {view === 'target' && (
                            <CommandGroup>
                                {uniqueTargetColumns.map(col => (
                                    <CommandItem
                                        key={`target-${col.name}`}
                                        onSelect={() => handleSelect(col.name, 'target')}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <Badge variant="outline" className="h-5 px-1 font-normal bg-amber-50/50">{col.name}</Badge>
                                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{col.type}</span>
                                    </CommandItem>
                                ))}
                                {uniqueTargetColumns.length === 0 && (
                                    <div className="p-4 text-xs text-center text-muted-foreground">
                                        No target columns available.
                                    </div>
                                )}
                            </CommandGroup>
                        )}

                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
