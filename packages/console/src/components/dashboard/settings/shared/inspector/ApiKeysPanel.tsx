/**
 * ApiKeysPanel — Inspector right-pane panel for managing API keys scoped to this engine.
 *
 * Reuses the EdgeAPIKeysForm component with the engine_id pre-scoped.
 * Keys appear in both Inspector and Settings → API Keys (shared EdgeAPIKey table).
 */

import React from 'react';
import { EdgeAPIKeysForm } from '@/components/dashboard/settings/shared/EdgeAPIKeysForm';

interface ApiKeysPanelProps {
    engineId: string;
}

export const ApiKeysPanel: React.FC<ApiKeysPanelProps> = ({ engineId }) => {
    return (
        <div className="p-4 space-y-3">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold">API Keys</h3>
                <p className="text-xs text-muted-foreground">
                    Manage API keys for this engine. Keys scoped to &quot;All Engines&quot; are also shown.
                </p>
            </div>
            <EdgeAPIKeysForm engineId={engineId} />
        </div>
    );
};
