import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TabLayout {
    pinnedColumns: string[];
    columnOrder: string[];
    visibleColumns: string[];
}

interface LayoutState {
    // Current Context
    activeKey: string | null;

    // Persistent Cache: "datasourceId:table" -> Layout
    cache: Record<string, TabLayout>;

    // Active State (Buffer for UI)
    pinnedColumns: string[];
    columnOrder: string[];
    visibleColumns: string[];

    // Actions
    setActiveContext: (datasourceId: string | number, table: string) => void;
    setPinnedColumns: (columns: string[]) => void;
    togglePin: (column: string) => void;
    setColumnOrder: (columns: string[]) => void;
    setVisibleColumns: (columns: string[]) => void;
    toggleVisibility: (column: string, allFields: string[]) => void;

    // Sync from Server (Redis) or Initial Config
    initialize: (config: {
        pinnedColumns?: string[];
        columnOrder?: string[];
        visibleColumns?: string[];
    }) => void;

    // Reset current view
    reset: () => void;
    clearTableCache: (datasourceId: string | number, table: string) => void;
}

const defaultLayout: TabLayout = {
    pinnedColumns: [],
    columnOrder: [],
    visibleColumns: [],
};

// Helper to generate cache key
const getCacheKey = (dsId: string | number, table: string) => `${dsId}:${table}`;

export const useLayoutStore = create<LayoutState>()(
    persist(
        (set, get) => ({
            activeKey: null,
            cache: {},

            // Initial Buffer
            pinnedColumns: [],
            columnOrder: [],
            visibleColumns: [],

            setActiveContext: (datasourceId, table) => {
                const state = get();
                const newKey = getCacheKey(datasourceId, table);

                if (state.activeKey === newKey) return;

                // 1. Save current buffer to cache (if we had an active key)
                if (state.activeKey) {
                    const currentLayout: TabLayout = {
                        pinnedColumns: state.pinnedColumns,
                        columnOrder: state.columnOrder,
                        visibleColumns: state.visibleColumns,
                    };

                    set((prev) => ({
                        cache: { ...prev.cache, [prev.activeKey!]: currentLayout }
                    }));
                }

                // 2. Load new context from cache (or default)
                // We use get() again to access the potentially updated cache? 
                // Actually set() merges, so we can just read from state.cache (activeKey write hasn't happened yet technically in the prev block if we used functional set?)
                // Let's do it safely.

                const currentCache = get().cache;
                const cachedLayout = currentCache[newKey] || defaultLayout;

                set({
                    activeKey: newKey,
                    pinnedColumns: cachedLayout.pinnedColumns,
                    columnOrder: cachedLayout.columnOrder,
                    visibleColumns: cachedLayout.visibleColumns,
                });
            },

            setPinnedColumns: (pinnedColumns) => {
                set({ pinnedColumns });
                // Auto-sync to cache for persistence
                const { activeKey } = get();
                if (activeKey) {
                    set((state) => ({
                        cache: {
                            ...state.cache,
                            [activeKey]: {
                                pinnedColumns,
                                columnOrder: state.columnOrder,
                                visibleColumns: state.visibleColumns
                            }
                        }
                    }));
                }
            },

            togglePin: (column) => {
                const state = get();
                const isPinned = state.pinnedColumns.includes(column);
                const newPinned = isPinned
                    ? state.pinnedColumns.filter((c) => c !== column)
                    : [...state.pinnedColumns, column];

                get().setPinnedColumns(newPinned); // Reuse logic
            },

            setColumnOrder: (columnOrder) => {
                set({ columnOrder });
                // Auto-sync
                const { activeKey } = get();
                if (activeKey) {
                    set((state) => ({
                        cache: {
                            ...state.cache,
                            [activeKey]: {
                                pinnedColumns: state.pinnedColumns,
                                columnOrder,
                                visibleColumns: state.visibleColumns
                            }
                        }
                    }));
                }
            },

            setVisibleColumns: (visibleColumns) => {
                set({ visibleColumns });
                // Auto-sync
                const { activeKey } = get();
                if (activeKey) {
                    set((state) => ({
                        cache: {
                            ...state.cache,
                            [activeKey]: {
                                pinnedColumns: state.pinnedColumns,
                                columnOrder: state.columnOrder,
                                visibleColumns
                            }
                        }
                    }));
                }
            },

            toggleVisibility: (column, allFields) => {
                const state = get();
                let newVisible: string[];
                const current = state.visibleColumns;

                if (current.length === 0) {
                    newVisible = allFields.filter(f => f !== column);
                } else if (current.includes(column)) {
                    newVisible = current.filter(c => c !== column);
                    if (newVisible.length === 0) newVisible = [allFields[0]];
                } else {
                    newVisible = [...current, column];
                    // If everything is now visible, reset to empty
                    if (newVisible.length === allFields.length) newVisible = [];
                }

                // If column is being hidden, ensure it's unpinned
                const isNowHidden = newVisible.length > 0 && !newVisible.includes(column);
                if (isNowHidden && state.pinnedColumns.includes(column)) {
                    get().togglePin(column);
                }

                get().setVisibleColumns(newVisible);
            },

            initialize: (config) => {
                // When Redis/Server data comes in, we have a choice:
                // 1. Overwrite (Server wins)
                // 2. Merge?
                // For now, we behave like before: Server/SavedConfig initializes the view.
                // BUT: If we have a local cache that is "fresher"?
                // The issue is `initialize` is called on mount.
                // If I just switched tables, `setActiveContext` loaded the cache.
                // Then `initialize` fires with... potentially empty or old Redis data?
                // OR Redis data that is actually saved.

                // User wants "Back and Forth".
                // If I have cached data, I should probably prioritize it over a "default" load.
                // But `initialize` is also used for "Load Saved View".

                set((state) => {
                    const newLayout = {
                        pinnedColumns: config.pinnedColumns || state.pinnedColumns,
                        columnOrder: config.columnOrder || state.columnOrder,
                        visibleColumns: config.visibleColumns || state.visibleColumns,
                    };

                    // Update buffer
                    // Update cache as well? Yes, if we are initializing, we are setting the baseline.
                    const { activeKey } = state;
                    const newCache = activeKey ? {
                        ...state.cache,
                        [activeKey]: newLayout
                    } : state.cache;

                    return {
                        ...newLayout,
                        cache: newCache
                    };
                });
            },

            reset: () => set({
                pinnedColumns: [],
                columnOrder: [],
                visibleColumns: [],
            }),

            clearTableCache: (datasourceId, table) => {
                const key = getCacheKey(datasourceId, table);
                set((state) => {
                    const newCache = { ...state.cache };
                    delete newCache[key];

                    // If this is the active key, also reset the buffers
                    if (state.activeKey === key) {
                        return {
                            cache: newCache,
                            pinnedColumns: [],
                            columnOrder: [],
                            visibleColumns: [],
                        };
                    }
                    return { cache: newCache };
                });
            },
        }),
        {
            name: 'db-sync-layout-storage', // unique name
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ cache: state.cache }), // ONLY persist the cache map, not active buffer (avoid stale buffer on reload)
        }
    )
);
