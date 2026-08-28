import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debug } from '@/lib/debug';
import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';
import { databaseApi, SupabaseTable, TableSchema } from '@/services/database-api';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';

// Import dashboard store for connection/table state synchronization
let getDashboardState: () => any;

// Module-level in-flight promise dedup — prevents concurrent calls from
// bypassing guards while a previous call is still resolving
let _initPromise: Promise<void> | null = null;
let _schemaPromise: Promise<void> | null = null;

interface DataBindingState {
  // Connection status (derived from dashboard store)
  connected: boolean;
  connectionError: string | null;

  // Tables (owned by data-binding store)
  tables: SupabaseTable[];
  tablesLoading: boolean;
  tablesError: string | null;

  // Schema cache
  schemas: Map<string, TableSchema>;
  globalSchema: {
    tables: any[];
    foreign_keys: {
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }[];
    definitions?: any;
  } | null;

  // Component bindings
  componentBindings: Map<string, ComponentDataBinding>;

  // Query cache and loading states
  dataCache: Map<string, any>;
  loadingStates: Map<string, boolean>;
  errors: Map<string, string>;
  counts: Map<string, number>;

  // Actions
  initialize: () => void;
  syncConnectionStatus: () => Promise<void>;
  fetchTables: () => Promise<void>;
  fetchGlobalSchema: (force?: boolean) => Promise<void>;
  loadTableSchema: (tableName: string) => Promise<TableSchema | null>;
  queryData: (componentId: string, binding: ComponentDataBinding) => Promise<any>;
  setComponentBinding: (componentId: string, binding: ComponentDataBinding) => void;
  getComponentBinding: (componentId: string) => ComponentDataBinding | null;
  removeComponentBinding: (componentId: string) => void;
  clearError: (key: string) => void;
  invalidateCache: (componentId?: string) => void;
}

export const useDataBindingStore = create<DataBindingState>()(
  persist(
    (set, get) => ({
      connected: false,
      connectionError: null,
      tables: [],
      tablesLoading: false,
      tablesError: null,
      globalSchema: { tables: [], foreign_keys: [] },
      schemas: new Map(),
      componentBindings: new Map(),
      dataCache: new Map(),
      loadingStates: new Map(),
      errors: new Map(),
      counts: new Map(),

      // Initialize by syncing connection status and fetching tables
      // Uses module-level promise dedup so N concurrent callers share one flight
      initialize: () => {
        if (_initPromise) return; // Already in-flight

        _initPromise = (async () => {
          try {
            await get().syncConnectionStatus();
            // Re-read AFTER sync — syncConnectionStatus uses set() which is
            // synchronous in Zustand, so get().connected is now authoritative
            if (get().connected) {
              await get().fetchTables();
            }
          } catch (error) {
            debug.error('DATA_BINDING', 'Initialization failed:', error);
          } finally {
            _initPromise = null;
          }
        })();
      },

      // Sync connection status from dashboard store — FORCES a live API check
      // to prevent stale localStorage from triggering database calls
      syncConnectionStatus: async () => {
        try {
          // Use dynamic import to avoid circular dependency
          if (!getDashboardState) {
            const dashboardModule = await import('./dashboard');
            getDashboardState = dashboardModule.useDashboardStore.getState;
          }

          // Force a live check from the API — don't trust persisted state
          const dashboardState = getDashboardState();
          if (dashboardState.fetchConnections) {
            await dashboardState.fetchConnections();
          }

          // NOW read the fresh, API-verified connection status
          const freshState = getDashboardState();
          const connected = freshState.connections.supabase?.connected || false;
          const connectionError = connected ? null : 'Not connected to database';

          // Only set() if value actually changed — prevents triggering subscriber re-renders
          const current = get();
          if (current.connected !== connected || current.connectionError !== connectionError) {
            set({ connected, connectionError });
            debug.log('DATA_BINDING', 'Synced connection status:', { connected });
          }
        } catch (error) {
          // API unreachable — mark as disconnected to prevent stale requests
          set({ connected: false, connectionError: 'Could not verify database connection' });
          debug.error('DATA_BINDING', 'Failed to sync connection status:', error);
        }
      },

      fetchGlobalSchema: async (force = false) => {
        // Skip if already loaded (prevents infinite re-fetch loops)
        const current = get().globalSchema;
        if (!force && current?.tables?.length > 0) {
          return;
        }

        // In-flight dedup: if a fetch is already running, wait for it
        if (_schemaPromise) {
          await _schemaPromise;
          return;
        }

        _schemaPromise = (async () => {
          try {
            const result = await databaseApi.advancedQuery('frontbase_get_schema_info', {});
            const schemaData = result.data || result; // Handle {data: {...}} wrapper or direct

            if (result.success && schemaData.tables) {
              set({
                globalSchema: {
                  tables: schemaData.tables,
                  foreign_keys: schemaData.foreign_keys || [], // Fallback for manual schema
                  definitions: schemaData.definitions || {}
                }
              });
              console.log('[DATA_BINDING] Global Schema Loaded:', {
                tables: schemaData.tables.length,
                fks: (schemaData.foreign_keys || []).length
              });
            }
          } catch (error) {
            console.error('Failed to fetch global schema:', error);
          } finally {
            _schemaPromise = null;
          }
        })();

        await _schemaPromise;
      },

      // Fetch tables from API (owns this responsibility)
      fetchTables: async () => {
        if (!get().connected) {
          debug.error('DATA_BINDING', 'Cannot fetch tables: not connected');
          return;
        }

        // Fetch global schema first and WAIT for it
        await get().fetchGlobalSchema();

        const requestKey = generateRequestKey('/api/database/supabase-tables');

        return requestDeduplicator.dedupe(requestKey, async () => {
          set({ tablesLoading: true, tablesError: null });
          try {
            const res = await databaseApi.fetchTables();
            // Data is already unwrapped and validated
            set({
              tables: res.tables || [],
              tablesLoading: false
            });
          } catch (error: any) {
            console.error('Failed to fetch tables:', error);
            set({
              tablesError: error.message || 'Failed to fetch tables',
              tablesLoading: false
            });
          }
        });
      },

      loadTableSchema: async (tableName: string): Promise<TableSchema | null> => {
        // Check cache first
        const cached = get().schemas.get(tableName);
        if (cached) {
          return cached;
        }

        try {
          const schemaResult = await databaseApi.fetchTableSchema(tableName);
          // Result is already validated and unwrapped { table_name, columns }

          if (schemaResult && schemaResult.columns) {
            // Transform database column structure to frontend format
            const transformedColumns = schemaResult.columns.map((col: any) => ({
              name: col.column_name || col.name, // Handle both formats
              type: col.data_type || col.type,
              nullable: col.is_nullable === 'YES' || col.nullable,
              default: col.column_default || col.default,
              isPrimaryKey: col.is_primary || col.isPrimaryKey,
              foreignKey: (col.is_foreign || col.isForeign) && (col.foreign_table || col.foreignTable) ? {
                table: col.foreign_table || col.foreignTable,
                column: col.foreign_column || col.foreignColumn
              } : undefined
            }));

            const schema: TableSchema = { columns: transformedColumns };

            // Cache the schema
            set((state) => {
              const newSchemas = new Map(state.schemas);
              newSchemas.set(tableName, schema);
              return { schemas: newSchemas };
            });

            return schema;
          }
        } catch (error) {
          console.error('[DataBindingStore] Error loading schema:', error);
        }

        return null;
      },

      queryData: async (componentId: string, binding: ComponentDataBinding) => {
        const state = get();

        // Prevent duplicate requests
        if (state.loadingStates.get(componentId)) {
          console.log('[DataBindingStore] Request already in progress for:', componentId);
          return state.dataCache.get(componentId);
        }

        // Set loading state
        set((state) => {
          const newLoadingStates = new Map(state.loadingStates);
          newLoadingStates.set(componentId, true);
          return { loadingStates: newLoadingStates };
        });

        try {
          // Construct columns and joins for RPC
          let columns = `"${binding.tableName}".*`;
          const joins = [];
          const relatedTables = new Set<string>();

          // Check column overrides
          if (binding.columnOverrides) {
            Object.keys(binding.columnOverrides).forEach(key => {
              if (key.includes('.')) {
                const [t] = key.split('.');
                if (t && t !== binding.tableName) relatedTables.add(t);
              }
            });
          }
          // Check column order
          if (binding.columnOrder) {
            binding.columnOrder.forEach(key => {
              if (key.includes('.')) {
                const [t] = key.split('.');
                if (t && t !== binding.tableName) relatedTables.add(t);
              }
            });
          }

          // DEBUG: Log related tables detection
          console.log('[DATA_BINDING] FK Debug:', {
            tableName: binding.tableName,
            columnOverrides: binding.columnOverrides ? Object.keys(binding.columnOverrides) : [],
            columnOrder: binding.columnOrder,
            relatedTables: Array.from(relatedTables),
            globalSchemaFKs: get().globalSchema?.foreign_keys?.length
          });

          // Build Joins based on Schema Graph
          const globalSchema = get().globalSchema;

          relatedTables.forEach(relatedTable => {
            // 1. Try Find Forward FK (binding.tableName -> relatedTable)
            let fk = globalSchema?.foreign_keys?.find(k => k.table_name === binding.tableName && k.foreign_table_name === relatedTable);

            console.log('[DATA_BINDING] FK lookup:', {
              relatedTable,
              lookingFor: `${binding.tableName} -> ${relatedTable}`,
              found: !!fk,
              fk
            });

            if (fk) {
              // Belongs To
              joins.push({
                type: 'left',
                table: relatedTable,
                on: `${binding.tableName}.${fk.column_name} = ${relatedTable}.${fk.foreign_column_name}`
              });
              // Add to columns as JSON
              columns += `, to_jsonb("${relatedTable}".*) as "${relatedTable}"`;
            } else {
              // 2. Try Find Reverse FK (relatedTable -> binding.tableName)
              fk = globalSchema?.foreign_keys?.find(k => k.table_name === relatedTable && k.foreign_table_name === binding.tableName);
              if (fk) {
                // Has Many
                // For HasMany, we generally don't JOIN in the main query for 1:N unless we want weird row duplication.
                // Instead we use a scalar subquery for the JSON array.
                // But if the user wants to SORT by it? (Not supported usually).
                // We will use the subquery approach for projection to match PostgREST.
                columns += `, (SELECT json_agg(x) FROM "${relatedTable}" x WHERE x.${fk.column_name} = "${binding.tableName}".${fk.foreign_column_name}) as "${relatedTable}"`;
              }
            }
          });

          console.log('[DATA_BINDING] Final query params:', { columns, joins });

          // Sorting
          let sort_col = '';
          let sort_dir = 'asc';
          if (binding.sorting.enabled && binding.sorting.column) {
            sort_col = binding.sorting.column;
            sort_dir = binding.sorting.direction || 'asc';
          }

          // Filtering
          const search_query = binding.filtering.filters['search'] || '';

          // Build search_cols: Use binding.searchColumns if defined, otherwise auto-detect text columns
          let search_cols: string[] = [];
          if (binding.searchColumns && binding.searchColumns.length > 0) {
            search_cols = binding.searchColumns;
          } else if (search_query) {
            // Auto-detect text columns from globalSchema
            const gTable = get().globalSchema.tables.find((t: any) => t.table_name === binding.tableName);
            if (gTable && gTable.columns) {
              gTable.columns.forEach((col: any) => {
                if (['text', 'character varying', 'varchar', 'char'].includes(col.data_type)) {
                  search_cols.push(`"${binding.tableName}"."${col.column_name}"`);
                }
              });
            }
          }


          // Execute RPC
          let result;

          // Build filters array from frontendFilters, merging runtime values from binding.filtering.filters
          // Runtime values are stored as { [column]: { filterType, value } }
          const runtimeFilterValues = binding.filtering?.filters || {};

          const filters = (binding.frontendFilters || [])
            .map(f => {
              // Check if there's a runtime value for this filter
              const runtimeValue = runtimeFilterValues[f.column];
              const value = runtimeValue?.value !== undefined ? runtimeValue.value : f.value;
              return {
                column: f.column,
                filterType: f.filterType,
                value
              };
            })
            .filter(f => f.column && f.value !== undefined && f.value !== null && f.value !== '');

          if (binding.rpcName) {
            // CUSTOM RPC CALL
            console.log('[DEBUG] Custom RPC Call:', binding.rpcName);
            result = await databaseApi.advancedQuery(binding.rpcName, {
              ...binding.params,
              // Standard pagination/sorting params usually expected by our RPCs
              page: binding.pagination.page + 1,
              page_size: binding.pagination.pageSize,
              search_query: search_query,
              sort_col: sort_col || 'created_at',
              sort_dir: sort_dir,
              filters: filters
            });

          } else if (search_query) {
            // Standard Search
            result = await databaseApi.advancedQuery('frontbase_search_rows', {
              table_name: binding.tableName,
              columns, // This is SQL selects
              joins,
              search_query,
              search_cols,
              page: binding.pagination.page + 1, // 1-based
              page_size: binding.pagination.pageSize
            });
          } else {
            // Standard Get Rows
            result = await databaseApi.advancedQuery('frontbase_get_rows', {
              table_name: binding.tableName,
              columns, // This is SQL selects
              joins,
              sort_col,
              sort_dir,
              filters, // NEW: Pass filters to RPC
              page: binding.pagination.page + 1, // 1-based
              page_size: binding.pagination.pageSize
            });
          }

          console.log('[DEBUG] RPC Result:', result);

          if (result.success) {
            // Cache the result
            set((state) => {
              const newDataCache = new Map(state.dataCache);
              const newLoadingStates = new Map(state.loadingStates);
              const newErrors = new Map(state.errors);
              const newCounts = new Map(state.counts);

              newDataCache.set(componentId, result.rows || []); // RPC returns rows
              newLoadingStates.delete(componentId);
              newErrors.delete(componentId);

              if (typeof result.total === 'number') {
                newCounts.set(componentId, result.total);
              }

              return {
                dataCache: newDataCache,
                loadingStates: newLoadingStates,
                errors: newErrors,
                counts: newCounts
              };
            });

            return result.rows || [];
          } else {
            throw new Error(result.message || 'Query failed');
          }

          /* OLD LOGIC REPLACED
          params.append('select', selectParts.join(','));
          // ... (rest of old logic)
          const result = await databaseApi.queryData(binding.tableName, params);
          */

          /*
          if (result.success) { ... } else { ... }
          */
        } catch (error) {
          console.error('[DataBindingStore] Query error:', error);

          // Set error state
          set((state) => {
            const newLoadingStates = new Map(state.loadingStates);
            const newErrors = new Map(state.errors);

            newLoadingStates.delete(componentId);
            newErrors.set(componentId, error instanceof Error ? error.message : 'Query failed');

            return {
              loadingStates: newLoadingStates,
              errors: newErrors
            };
          });

          throw error;
        }
      },

      setComponentBinding: (componentId: string, binding: ComponentDataBinding) => {
        set((state) => {
          const newBindings = new Map(state.componentBindings);
          newBindings.set(componentId, binding);
          return { componentBindings: newBindings };
        });
      },

      getComponentBinding: (componentId: string) => {
        return get().componentBindings.get(componentId) || null;
      },

      removeComponentBinding: (componentId: string) => {
        set((state) => {
          const newBindings = new Map(state.componentBindings);
          const newDataCache = new Map(state.dataCache);
          const newLoadingStates = new Map(state.loadingStates);
          const newErrors = new Map(state.errors);
          const newCounts = new Map(state.counts);

          newBindings.delete(componentId);
          newDataCache.delete(componentId);
          newLoadingStates.delete(componentId);
          newErrors.delete(componentId);
          newCounts.delete(componentId);

          return {
            componentBindings: newBindings,
            dataCache: newDataCache,
            loadingStates: newLoadingStates,
            errors: newErrors,
            counts: newCounts
          };
        });
      },

      clearError: (key: string) => {
        set((state) => {
          const newErrors = new Map(state.errors);
          newErrors.delete(key);
          return { errors: newErrors };
        });
      },

      invalidateCache: (componentId?: string) => {
        set((state) => {
          if (componentId) {
            const newDataCache = new Map(state.dataCache);
            newDataCache.delete(componentId);
            return { dataCache: newDataCache };
          } else {
            return {
              dataCache: new Map(),
              schemas: new Map(),
              counts: new Map()
            };
          }
        });
      },
    }),
    {
      name: 'data-binding-simple-storage',
      partialize: (state) => ({
        // Only persist component bindings
        componentBindings: Array.from(state.componentBindings.entries()),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        // Restore component bindings
        componentBindings: new Map(persistedState.componentBindings || []),
        // Reset all other state - connection will be synced from dashboard
        connected: false,
        connectionError: null,
        tables: [],
        tablesError: null,
        schemas: new Map(),
        dataCache: new Map(),
        loadingStates: new Map(),
        errors: new Map(),
        counts: new Map(),
      }),
    }
  )
);

