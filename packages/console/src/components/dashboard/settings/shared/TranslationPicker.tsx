import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface TranslationChoice { value: string; label: string; keywords?: string[]; disabled?: boolean }
/** Existing Command/Popover primitives, with single and bounded multi-selection and no arbitrary free-text values. */
export function TranslationPicker({ id, label, choices, selected, onChange, multiple = false, disabled = false, placeholder = 'Select…' }: {
    id: string; label: string; choices: TranslationChoice[]; selected: string[]; onChange: (values: string[]) => void;
    multiple?: boolean; disabled?: boolean; placeholder?: string;
}) {
    const [open,setOpen] = useState(false);
    const selectedLabels = selected.map(value => choices.find(c=>c.value===value)?.label ?? value);
    return <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label}
            aria-expanded={open && !disabled} disabled={disabled} className="h-auto min-h-10 w-full justify-between whitespace-normal text-left font-normal">
            <span>{selectedLabels.length ? selectedLabels.join(', ') : placeholder}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button></PopoverTrigger>
        <PopoverContent aria-label={`${label} picker`} align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-0">
            <Command><CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} />
                <CommandList aria-label={`${label} choices`}><CommandEmpty>No matches found.</CommandEmpty>
                    {choices.map(choice=><CommandItem key={choice.value} value={choice.value} keywords={[choice.label,...choice.keywords??[]]}
                        disabled={disabled || choice.disabled} onSelect={()=>{
                            if(disabled || choice.disabled) return;
                            onChange(multiple ? selected.includes(choice.value) ? selected.filter(v=>v!==choice.value) : [...selected,choice.value] : [choice.value]);
                            if(!multiple) setOpen(false);
                        }}>
                        <Check aria-hidden="true" className={`mr-2 h-4 w-4 shrink-0 ${selected.includes(choice.value)?'opacity-100':'opacity-0'}`} />
                        <span>{choice.label}</span>{multiple && selected.includes(choice.value) && <span className="sr-only">selected</span>}
                    </CommandItem>)}
                </CommandList>
            </Command>
            {multiple && <div className="border-t p-2"><Button type="button" variant="outline" size="sm" onClick={()=>setOpen(false)}>Done</Button></div>}
        </PopoverContent>
    </Popover>;
}
