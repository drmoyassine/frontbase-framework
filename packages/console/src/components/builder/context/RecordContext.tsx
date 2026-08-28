import React from 'react';

/**
 * Per-iteration record context for the Repeater component.
 *
 * A Repeater renders its child template once per data row; each iteration wraps
 * its subtree in a `RecordContextProvider` carrying the current row. Any
 * component inside the template can then read `{{ record.<field> }}` tokens via
 * `useRecord()` (resolved in ComponentRenderer's effectiveProps memo).
 */
export const RecordContext = React.createContext<Record<string, any> | null>(null);

export const RecordContextProvider = RecordContext.Provider;

/** The current Repeater row, or null when not inside a Repeater. */
export function useRecord(): Record<string, any> | null {
    return React.useContext(RecordContext);
}
