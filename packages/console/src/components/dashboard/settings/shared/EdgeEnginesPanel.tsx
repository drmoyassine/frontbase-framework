/**
 * EdgeEnginesPanel — Barrel file
 *
 * Composes the Edge Engines section.
 * Individual sections are split into their own files for maintainability:
 *  - EdgeEnginesSection.tsx     (Deploy Engine + engine list)
 *  - DeleteResourceDialog.tsx   (Shared delete confirmation + bulk delete)
 *  - edgeConstants.ts           (Shared constants)
 *
 * Connected Accounts (EdgeProvidersSection) has moved to Settings > Connected Accounts.
 */

import React from 'react';
import { EdgeEnginesSection } from './EdgeEnginesSection';

export const EdgeEnginesPanel: React.FC<{ withCard?: boolean }> = () => {
    return (
        <div className="space-y-6">
            <EdgeEnginesSection />
        </div>
    );
};
