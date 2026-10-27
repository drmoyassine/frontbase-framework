/**
 * WorkflowTestStatus — Execution result status bar
 *
 * Renders a colored strip below the canvas showing test execution status.
 * Extracted from WorkflowEditor.tsx for single-responsibility compliance.
 */

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WorkflowTestStatusProps {
    executionResult: any;
    onDismiss: () => void;
}

export function WorkflowTestStatus({ executionResult, onDismiss }: WorkflowTestStatusProps) {
    if (!executionResult) return null;

    return (
        <div className={cn(
            "border-t px-4 py-2 flex items-center justify-between text-sm shrink-0",
            executionResult.status === 'completed' && "bg-green-50 dark:bg-green-950/20",
            executionResult.status === 'error' && "bg-red-50 dark:bg-red-950/20",
            executionResult.status === 'executing' && "bg-yellow-50 dark:bg-yellow-950/20"
        )}>
            <span className="font-medium">
                {executionResult.status === 'executing' && '⏳ Running test...'}
                {executionResult.status === 'completed' && '✅ Test completed successfully'}
                {executionResult.status === 'error' && `❌ Test failed: ${executionResult.error || 'Unknown error'}`}
            </span>
            <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="h-6 px-2"
            >
                <X className="w-3 h-3" />
            </Button>
        </div>
    );
}
