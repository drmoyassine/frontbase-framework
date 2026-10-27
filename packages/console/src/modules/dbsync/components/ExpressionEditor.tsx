import React, { useState, useRef, useEffect } from 'react';
import { Variable, Code, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface VariableOption {
    name: string;
    type: string;
    description?: string;
}

interface ExpressionEditorProps {
    value: string;
    onChange: (value: string) => void;
    variables: VariableOption[];
    placeholder?: string;
    label?: string;
    className?: string;
}

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
    value,
    onChange,
    variables,
    placeholder = "e.g. {{ master.price * 1.2 }}",
    label,
    className,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const [filter, setFilter] = useState('');
    const [cursorPos, setCursorPos] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredVariables = variables.filter(v =>
        v.name.toLowerCase().includes(filter.toLowerCase())
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const position = e.target.selectionStart || 0;
        setCursorPos(position);
        onChange(newValue);

        // Detect triggers
        const textBeforeCursor = newValue.slice(0, position);
        const lastTriggerIndex = Math.max(
            textBeforeCursor.lastIndexOf('@'),
            textBeforeCursor.lastIndexOf('{{')
        );

        if (lastTriggerIndex !== -1 && lastTriggerIndex >= position - 5) {
            const trigger = textBeforeCursor.substring(lastTriggerIndex, position);
            if (trigger === '@' || trigger === '{{' || (trigger.startsWith('{{') && !trigger.includes('}}'))) {
                setShowDropdown(true);
                setFilter(trigger.replace('@', '').replace('{{', '').trim());
            } else {
                setShowDropdown(false);
            }
        } else {
            setShowDropdown(false);
        }
    };

    const insertVariable = (varName: string) => {
        const textBefore = value.slice(0, cursorPos);
        const textAfter = value.slice(cursorPos);

        // Find where the trigger started to replace it
        const lastAt = textBefore.lastIndexOf('@');
        const lastBrace = textBefore.lastIndexOf('{{');
        const lastTrigger = Math.max(lastAt, lastBrace);

        const triggerChar = textBefore[lastTrigger];
        let insertedText = '';

        if (triggerChar === '@') {
            const prefix = value.slice(0, lastAt);
            insertedText = `@${varName}`;
            onChange(prefix + insertedText + textAfter);
        } else {
            const prefix = value.slice(0, lastBrace);
            insertedText = `{{ master.${varName} }}`;
            onChange(prefix + insertedText + textAfter);
        }

        setShowDropdown(false);
        inputRef.current?.focus();
    };

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={cn("relative w-full", className)}>
            {label && (
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                    {label}
                </label>
            )}

            <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Code size={16} />
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    className={cn(
                        "w-full bg-slate-900/50 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-slate-200",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all",
                        "placeholder:text-slate-600 font-mono"
                    )}
                />

                {showDropdown && (
                    <div
                        ref={dropdownRef}
                        className="absolute z-50 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                        <div className="p-2 border-b border-slate-700 bg-slate-900/50 flex items-center gap-2">
                            <Variable size={14} className="text-blue-400" />
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Fields available</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                            {filteredVariables.length > 0 ? (
                                filteredVariables.map((v) => (
                                    <button
                                        key={v.name}
                                        onClick={() => insertVariable(v.name)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors group"
                                    >
                                        <div className="p-1.5 rounded bg-slate-900 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                            <ChevronRight size={12} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{v.name}</div>
                                            <div className="text-[10px] text-slate-500">{v.type}</div>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="p-4 text-center text-xs text-slate-500">
                                    No fields matching "{filter}"
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
