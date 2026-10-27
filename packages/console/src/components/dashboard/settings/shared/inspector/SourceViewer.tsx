/**
 * SourceViewer — Monaco-powered TypeScript editor.
 *
 * Provides syntax highlighting, intellisense, and edit capabilities.
 * Calls `onContentChange` on every edit so the parent can track dirty state.
 */

import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Badge } from '@/components/ui/badge';
import { FileCode, Circle } from 'lucide-react';
import { formatBytes } from './types';

interface SourceViewerProps {
    filePath: string;
    content: string;
    isDirty?: boolean;
    onContentChange?: (filePath: string, newContent: string) => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
    filePath,
    content,
    isDirty = false,
    onContentChange,
}) => {
    const handleChange = useCallback(
        (value: string | undefined) => {
            if (value !== undefined && onContentChange) {
                onContentChange(filePath, value);
            }
        },
        [filePath, onContentChange]
    );

    // Detect dark mode from documentElement class
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div className="flex-1 flex flex-col min-w-0">
            {/* File header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2 text-xs">
                    <FileCode className="h-3.5 w-3.5 text-blue-400" />
                    <span className="font-mono font-medium">{filePath}</span>
                    <Badge variant="outline" className="text-[10px] h-4">{formatBytes(content.length)}</Badge>
                    {isDirty && (
                        <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                    )}
                </div>
                <Badge variant={isDirty ? 'default' : 'secondary'} className="text-[10px]">
                    {isDirty ? 'Modified' : 'Saved'}
                </Badge>
            </div>
            {/* Monaco Editor */}
            <div className="flex-1 min-h-0">
                <Editor
                    height="100%"
                    language="typescript"
                    theme={isDark ? 'vs-dark' : 'light'}
                    value={content}
                    onChange={handleChange}
                    options={{
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'line',
                        tabSize: 2,
                        wordWrap: 'off',
                        automaticLayout: true,
                        padding: { top: 8, bottom: 8 },
                        // Disable all auto-corrections
                        quickSuggestions: false,
                        suggestOnTriggerCharacters: false,
                        parameterHints: { enabled: false },
                        autoClosingBrackets: 'never',
                        autoClosingQuotes: 'never',
                        autoSurround: 'never',
                        wordBasedSuggestions: 'off',
                        acceptSuggestionOnCommitCharacter: false,
                    }}
                />
            </div>
        </div>
    );
};
