import React from 'react';

/**
 * Per-iteration record context for the published-page Repeater (edge client).
 * Mirrors the builder's RecordContext so `{{ record.<field> }}` resolves the
 * same way on publish as in the canvas.
 */
export const RecordContext = React.createContext<Record<string, any> | null>(null);
export const RecordContextProvider = RecordContext.Provider;

export function useRecord(): Record<string, any> | null {
    return React.useContext(RecordContext);
}
