/**
 * NodeVariableInput - Text input with @ mention support for workflow nodes
 * 
 * Wraps any text input to add node variable autocomplete.
 * Triggers @ mention picker when user types @
 */

import { useState, useRef, useCallback } from 'react';
import { NodeVariablePicker } from './NodeVariablePicker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface WorkflowNode {
    id: string;
    type?: string;
    data: {
        label: string;
        type: string;
        inputs?: Array<{ name: string; type?: string; value?: any }>;
    };
}

interface WorkflowEdge {
    source: string;
    target: string;
}

interface NodeExecution {
    nodeId: string;
    status: string;
    outputs?: Record<string, unknown>;
}

interface NodeVariableInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    multiline?: boolean;
    currentNodeId: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    nodeExecutions?: NodeExecution[];
}

export function NodeVariableInput({
    value,
    onChange,
    placeholder,
    className,
    multiline = false,
    currentNodeId,
    nodes,
    edges,
    nodeExecutions,
}: NodeVariableInputProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [cursorPosition, setCursorPosition] = useState(0);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onChange(e.target.value);
    }, [onChange]);

    const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        const pos = target.selectionStart || 0;
        setCursorPosition(pos);

        const textBeforeCursor = value.slice(0, pos);

        // Check for @ trigger
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const lastSpace = textBeforeCursor.lastIndexOf(' ');
        const lastNewline = textBeforeCursor.lastIndexOf('\n');
        const lastBracket = textBeforeCursor.lastIndexOf('{');
        const lastBoundary = Math.max(lastSpace, lastNewline, lastBracket);

        if (atIndex !== -1 && atIndex > lastBoundary) {
            setSearchTerm(textBeforeCursor.slice(atIndex + 1));
            setShowPicker(true);
            updatePickerPosition(target, atIndex);
            return;
        }

        // Also check for {{ trigger (double brace)
        const braceIndex = textBeforeCursor.lastIndexOf('{{');
        if (braceIndex !== -1) {
            const afterBraces = textBeforeCursor.slice(braceIndex + 2).trim();
            // If we're right after {{ or typing a node reference
            if (afterBraces.length === 0 || !afterBraces.includes('}}')) {
                setSearchTerm(afterBraces);
                setShowPicker(true);
                updatePickerPosition(target, braceIndex);
                return;
            }
        }

        setShowPicker(false);
    }, [value]);

    const getCaretCoordinates = (element: HTMLInputElement | HTMLTextAreaElement, position: number) => {
        const div = document.createElement('div');
        const computed = window.getComputedStyle(element);

        const properties = [
            'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'lineHeight',
            'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap'
        ];

        properties.forEach(prop => {
            div.style[prop as any] = computed[prop as any];
        });

        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';

        const textBeforeCursor = element.value.substring(0, position);
        div.textContent = textBeforeCursor;

        const marker = document.createElement('span');
        marker.textContent = '|';
        div.appendChild(marker);

        document.body.appendChild(div);

        const markerRect = marker.getBoundingClientRect();
        const divRect = div.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const x = elementRect.left + (markerRect.left - divRect.left);
        const y = elementRect.top + (markerRect.top - divRect.top);

        document.body.removeChild(div);

        return { x, y, height: markerRect.height };
    };

    const updatePickerPosition = (target: HTMLElement, charIndex: number) => {
        const inputElement = target as HTMLInputElement | HTMLTextAreaElement;
        const cursorPos = inputElement.selectionStart || 0;

        const coords = getCaretCoordinates(inputElement, cursorPos);

        setPickerPosition({
            top: coords.y + coords.height + 4,
            left: coords.x,
        });
    };

    const handleSelect = useCallback((insertValue: string) => {
        const textBeforeCursor = value.slice(0, cursorPosition);
        const textAfterCursor = value.slice(cursorPosition);

        // Find trigger position (@ or {{)
        const atIndex = textBeforeCursor.lastIndexOf('@');
        const braceIndex = textBeforeCursor.lastIndexOf('{{');

        let newValue: string;
        if (braceIndex !== -1 && braceIndex > atIndex) {
            // Replace from {{ onwards
            newValue = textBeforeCursor.slice(0, braceIndex) + insertValue + textAfterCursor;
        } else if (atIndex !== -1) {
            // Replace from @ onwards
            newValue = textBeforeCursor.slice(0, atIndex) + insertValue + textAfterCursor;
        } else {
            newValue = value + insertValue;
        }

        onChange(newValue);
        setShowPicker(false);

        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, [value, cursorPosition, onChange]);

    const handleClose = useCallback(() => {
        setShowPicker(false);
    }, []);

    const handleBlur = useCallback(() => {
        setTimeout(() => {
            if (!document.activeElement?.closest('.variable-picker')) {
                setShowPicker(false);
            }
        }, 150);
    }, []);

    const InputComponent = multiline ? Textarea : Input;

    // Check if value contains variables
    const hasVariables = value.includes('{{') && value.includes('}}');

    return (
        <div className="node-variable-input-wrapper relative">
            <InputComponent
                ref={inputRef as any}
                value={value}
                onChange={handleInput}
                onKeyUp={handleKeyUp}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={cn(
                    hasVariables && 'border-purple-300 bg-purple-50/50 dark:bg-purple-950/20',
                    className
                )}
            />
            {/* Variable hint */}
            {!showPicker && !value && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    Type @ for nodes
                </div>
            )}
            {showPicker && (
                <NodeVariablePicker
                    searchTerm={searchTerm}
                    position={pickerPosition}
                    onSelect={handleSelect}
                    onClose={handleClose}
                    currentNodeId={currentNodeId}
                    nodes={nodes}
                    edges={edges}
                    nodeExecutions={nodeExecutions}
                />
            )}
        </div>
    );
}
