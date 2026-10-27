/**
 * localDraftProvider — the builder's draft DataProvider (RULE 6: implements the
 * SAME DataProvider interface as the edge/SW providers). Backed by SQLite-WASM
 * in a real browser; an in-process Map here for tests. The canvas writes drafts
 * through it; the preview reads through it — so preview HTML == published HTML
 * for the same layout (the parity guarantee).
 *
 * RULE 1: this is browser code. It NEVER imports @frontbase/edge-infra (no
 * drivers, no secrets). RULE 3: reads return copies.
 */
import type { DataProvider, QueryContext } from '@frontbase/edge-core';

export interface DraftRow { id: string; [key: string]: unknown }

export function localDraftProvider(initial: Record<string, DraftRow[]> = {}): DataProvider {
    // A per-queryId store of draft rows (the builder edits these).
    const store = new Map<string, DraftRow[]>(Object.entries(initial));

    return {
        kind: 'draft',
        async query(queryId: string, _params?: Record<string, unknown>, _ctx?: QueryContext): Promise<Record<string, unknown>[]> {
            const rows = store.get(queryId) ?? [];
            return rows.map((r) => ({ ...r })); // RULE 3: copy
        },
        // Builder-only API (not part of DataProvider): mutate drafts.
        _set(queryId: string, rows: DraftRow[]): void { store.set(queryId, rows.map((r) => ({ ...r }))); },
    } as DataProvider & { _set: (q: string, r: DraftRow[]) => void };
}
