/**
 * SecretViewer — Encrypted secret detail card.
 *
 * Shows a masked secret with provider-agnostic messaging.
 */

import React from 'react';
import { Lock, Shield } from 'lucide-react';

interface SecretViewerProps {
    secretName: string;
    providerLabel: string;
}

export const SecretViewer: React.FC<SecretViewerProps> = ({ secretName, providerLabel }) => (
    <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
            <Shield className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-mono font-medium">{secretName}</span>
        </div>
        <div className="p-6 space-y-4">
            <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Encrypted Secret</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    This secret is encrypted by your provider and its value cannot be retrieved.
                    Secrets are injected as environment variables at runtime.
                </p>
                <div className="mt-3 p-2 rounded bg-background border font-mono text-xs">
                    <span className="text-muted-foreground">Value: </span>
                    <span className="text-amber-500">•••••••••••••••••</span>
                </div>
            </div>
            <div className="text-xs text-muted-foreground">
                <p>To update this secret, redeploy the engine with new credentials or use the {providerLabel} Dashboard.</p>
            </div>
        </div>
    </div>
);
