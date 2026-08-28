/**
 * InvalidConnectionTooltip - Visual feedback for invalid node connections.
 *
 * Displays an error message when a user attempts to create an incompatible
 * connection in the workflow canvas. Auto-dismisses after a timeout.
 *
 * Uses CSS transitions (framer-motion is not a project dependency).
 */

import { useEffect, useState } from 'react';
import { AlertCircle, Lightbulb, X } from 'lucide-react';
import { useActionsStore } from '@/stores/actions';

interface ParsedMismatch {
    sourceLabel: string;
    sourceType: string;
    targetLabel: string;
    targetType: string;
    reason: string;
}

type ParsedError = ParsedMismatch | { raw: string };

function isMismatch(parsed: ParsedError): parsed is ParsedMismatch {
    return 'sourceLabel' in parsed;
}

function parseError(error: string): ParsedError {
    const match = error.match(/Type mismatch:\s*(.+?)\s*\((.+?)\)\s*->\s*(.+?)\s*\((.+?)\)/);
    if (match) {
        return {
            sourceLabel: match[1],
            sourceType: match[2],
            targetLabel: match[3],
            targetType: match[4],
            reason: error.split('. ').slice(1).join('. '),
        };
    }
    return { raw: error };
}

export function InvalidConnectionTooltip() {
    const lastValidationError = useActionsStore((s) => s.lastValidationError);
    const clearRejectedConnections = useActionsStore((s) => s.clearRejectedConnections);

    const [visible, setVisible] = useState(false);
    const [currentError, setCurrentError] = useState<string | null>(null);

    useEffect(() => {
        if (lastValidationError) {
            setCurrentError(lastValidationError);
            setVisible(true);

            const timeout = setTimeout(() => {
                setVisible(false);
            }, 8000);

            return () => clearTimeout(timeout);
        }
    }, [lastValidationError]);

    const handleDismiss = () => {
        setVisible(false);
        clearRejectedConnections();
    };

    if (!visible || !currentError) {
        return null;
    }

    const parsed = parseError(currentError);

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-2"
        >
            <div className="bg-background border border-destructive/50 rounded-lg shadow-lg overflow-hidden">
                <div className="bg-destructive/10 px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-destructive">Invalid Connection</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            These nodes cannot be connected.
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        aria-label="Dismiss"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-4 py-3 space-y-3">
                    {isMismatch(parsed) ? (
                        <>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="flex-1 bg-muted rounded px-3 py-2">
                                    <div className="font-medium">{parsed.sourceLabel}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Output:{' '}
                                        <code className="bg-background px-1 rounded">{parsed.sourceType}</code>
                                    </div>
                                </div>
                                <span className="text-destructive text-xl">→</span>
                                <div className="flex-1 bg-muted rounded px-3 py-2">
                                    <div className="font-medium">{parsed.targetLabel}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Input:{' '}
                                        <code className="bg-background px-1 rounded">{parsed.targetType}</code>
                                    </div>
                                </div>
                            </div>

                            {parsed.reason && (
                                <p className="text-sm text-muted-foreground">{parsed.reason}</p>
                            )}

                            <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-md border border-blue-500/20">
                                <Lightbulb className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    Add a Transform node between them to convert the data type.
                                </p>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm">{parsed.raw}</p>
                    )}
                </div>

                <div className="px-4 py-3 bg-muted/30 border-t flex justify-end">
                    <button
                        onClick={handleDismiss}
                        className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
}
