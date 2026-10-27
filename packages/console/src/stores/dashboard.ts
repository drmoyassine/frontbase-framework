import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api-service';
import { debug } from '@/lib/debug';
import { requestDeduplicator, generateRequestKey } from '@/lib/request-deduplicator';

interface DatabaseConnection {
  connected: boolean;
  url?: string;
  hasServiceKey?: boolean;
}

interface SupabaseTable {
  name: string;
  schema: string;
  path?: string;
}

interface DashboardState {
  activeSection: 'pages' | 'database' | 'users' | 'storage' | 'settings';
  searchQuery: string;
  filterStatus: 'all' | 'published' | 'draft';

  // Database connections
  connections: {
    supabase: DatabaseConnection;
  };

  // Modal states
  supabaseModalOpen: boolean;
  tableSchemaModalOpen: boolean;
  tableDataModalOpen: boolean;

  // Actions
  setActiveSection: (section: 'pages' | 'database' | 'users' | 'storage' | 'settings') => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: 'all' | 'published' | 'draft') => void;
  setConnections: (connections: { supabase: DatabaseConnection }) => void;
  setSupabaseModalOpen: (open: boolean) => void;
  setTableSchemaModalOpen: (open: boolean) => void;
  setTableDataModalOpen: (open: boolean) => void;
  fetchConnections: () => Promise<void>;
  notifyConnectionChange: () => void;
  reset: () => void;
}

const initialState = {
  activeSection: 'pages' as const,
  searchQuery: '',
  filterStatus: 'all' as const,
  connections: {
    supabase: { connected: false }
  },
  supabaseModalOpen: false,
  tableSchemaModalOpen: false,
  tableDataModalOpen: false,
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveSection: (section) => set({ activeSection: section }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterStatus: (status) => set({ filterStatus: status }),
      setConnections: (connections) => {
        set({ connections });
        // Notify data-binding store of connection changes
        get().notifyConnectionChange();
      },
      setSupabaseModalOpen: (open) => set({ supabaseModalOpen: open }),
      setTableSchemaModalOpen: (open) => set({ tableSchemaModalOpen: open }),
      setTableDataModalOpen: (open) => set({ tableDataModalOpen: open }),
      reset: () => set(initialState),

      fetchConnections: async () => {
        const requestKey = generateRequestKey('/api/database/connections');

        return requestDeduplicator.dedupe(requestKey, async () => {
          try {
            const response = await api.get('/api/database/connections');
            const apiResponse = response.data;

            // Transform response to expected format
            // Supports both Express: { success, data: { supabase: { connected, url } } }
            // and FastAPI: { success, message, connections: [ { type, status, url } ] }
            let transformedConnections = {
              supabase: { connected: false, url: '' }
            };

            if (apiResponse.success) {
              // Handle FastAPI/Unified format
              if (apiResponse.connections) {
                const supabaseConn = apiResponse.connections.find((conn: any) => conn.type === 'supabase');
                if (supabaseConn) {
                  transformedConnections = {
                    supabase: {
                      connected: supabaseConn.status === 'active' || supabaseConn.connected === true,
                      url: supabaseConn.url || ''
                    }
                  };
                }
              }
              // Handle legacy Express format
              else if (apiResponse.data && apiResponse.data.supabase) {
                transformedConnections = {
                  supabase: {
                    connected: apiResponse.data.supabase.connected,
                    url: apiResponse.data.supabase.url || ''
                  }
                };
              }
            }

            if (JSON.stringify(get().connections) !== JSON.stringify(transformedConnections)) {
              set({ connections: transformedConnections });
            }
            get().notifyConnectionChange();
            debug.log('DASHBOARD', 'Connections updated:', Object.keys(transformedConnections));
          } catch (error) {
            debug.error('DASHBOARD', 'Connection fetch error:', error);
          }
        });
      },

      notifyConnectionChange: () => {
        // This will be used by data-binding store to react to connection changes
        debug.log('DASHBOARD', 'Connection change notification sent');
      },
    }),
    {
      name: 'dashboard-storage',
      partialize: (state) => ({
        connections: state.connections,
        // Only persist connections, exclude UI state like loading, modals, etc.
      }),
    }
  )
);