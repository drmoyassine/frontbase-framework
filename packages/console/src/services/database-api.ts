/**
 * Database API — on the generated, contract-typed client (CF-22 P0/W2).
 * Envelope unwrap + success-check behavior preserved from the ApiContracts era;
 * the contract itself is now enforced server-side (response_model) and via the
 * generated types.
 *
 * NOTE(contract-gap): insertRecord/updateRecord/deleteRecord (POST/PUT/DELETE
 * /api/database/table-data/...) are NOT in the OpenAPI contract — no FastAPI
 * route serves them here. They stay on the legacy axios instance until the
 * backend routes exist.
 */
import api from './api-service';
import {
  databaseTestSupabase, databaseGetConnections, databaseConnectSupabase,
  databaseDisconnectSupabase, databaseGetTables, databaseGetTableSchema,
  databaseGetTableData, databaseGetDistinctValues, databaseAdvancedQuery,
} from '@/client';

type Envelope = { success?: boolean; data?: unknown; error?: string | null; message?: string | null };

const unwrap = <T>(raw: unknown, endpointName: string): T => {
  const env = raw as Envelope;
  if (!env || env.success === false) {
    throw new Error(`[${endpointName}] ${env?.error || env?.message || 'API returned success: false'}`);
  }
  return (env.data !== undefined ? env.data : env) as T;
};

export interface SupabaseTable {
  name: string;
  schema: string;
  path?: string;
}

export interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: any;
    isPrimaryKey?: boolean;
    foreignKey?: {
      table: string;
      column: string;
    };
  }>;
}

// Database connection API
export const testDatabaseConnection = async (connectionData: { supabaseUrl: string; supabaseAnonKey: string }) => {
  try {
    const { data } = await databaseTestSupabase({
      body: { url: connectionData.supabaseUrl, anonKey: connectionData.supabaseAnonKey } as never,
      throwOnError: true,
    });
    return data;
  } catch (error) {
    console.error('Error testing database connection:', error);
    throw error;
  }
};

export const getDatabaseConnections = async (): Promise<any> => {
  try {
    const { data } = await databaseGetConnections({ throwOnError: true });
    return unwrap(data, 'getDatabaseConnections');
  } catch (error) {
    console.error('Error getting database connections:', error);
    throw error;
  }
};

export const connectSupabase = async (connectionData: { supabaseUrl: string; supabaseAnonKey: string; supabaseServiceKey?: string }) => {
  try {
    const { data } = await databaseConnectSupabase({
      body: {
        url: connectionData.supabaseUrl,
        anonKey: connectionData.supabaseAnonKey,
        serviceKey: connectionData.supabaseServiceKey,
      } as never,
      throwOnError: true,
    });
    return data;
  } catch (error) {
    console.error('Error connecting to Supabase:', error);
    throw error;
  }
};

export const disconnectSupabase = async () => {
  try {
    const { data } = await databaseDisconnectSupabase({ throwOnError: true });
    return data;
  } catch (error) {
    console.error('Error disconnecting from Supabase:', error);
    throw error;
  }
};

export const getDatabaseTables = async () => {
  try {
    const { data } = await databaseGetTables({ throwOnError: true });
    return unwrap(data, 'getDatabaseTables');
  } catch (error) {
    console.error('Error getting database tables:', error);
    throw error;
  }
};

export const getTableSchema = async (tableName: string) => {
  try {
    const { data } = await databaseGetTableSchema({ path: { table_name: tableName }, throwOnError: true });
    return unwrap(data, 'getTableSchema');
  } catch (error) {
    console.error('Error getting table schema:', error);
    throw error;
  }
};

export const databaseApi = {
  fetchTables: async (): Promise<{ tables: SupabaseTable[] }> => {
    const { data } = await databaseGetTables({ throwOnError: true });
    return unwrap<{ tables: SupabaseTable[] }>(data, 'fetchTables');
  },

  fetchTableSchema: async (tableName: string): Promise<{ table_name: string; columns: any[] }> => {
    const { data } = await databaseGetTableSchema({ path: { table_name: tableName }, throwOnError: true });
    return unwrap<{ table_name: string; columns: any[] }>(data, 'fetchTableSchema');
  },

  queryData: async (tableName: string, params: URLSearchParams): Promise<any> => {
    const { data } = await databaseGetTableData({
      path: { table_name: tableName },
      query: Object.fromEntries(params) as never,
      throwOnError: true,
    });
    return data;
  },

  fetchDistinctValues: async (tableName: string, column: string): Promise<any> => {
    const { data } = await databaseGetDistinctValues({ body: { tableName, column } as never, throwOnError: true });
    return data;
  },

  insertRecord: async (tableName: string, data: Record<string, any>): Promise<any> => {
    const response = await api.post(`/api/database/table-data/${encodeURIComponent(tableName)}`, data);
    return response.data;
  },

  updateRecord: async (tableName: string, id: any, data: Record<string, any>): Promise<any> => {
    const response = await api.put(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, data);
    return response.data;
  },

  deleteRecord: async (tableName: string, id: any): Promise<any> => {
    const response = await api.delete(`/api/database/table-data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
    return response.data;
  },

  advancedQuery: async (rpcName: string, params: object): Promise<any> => {
    const { data: raw } = await databaseAdvancedQuery({ body: { rpcName, params } as never, throwOnError: true });
    // For advanced query, ensure 'rows' is present (parity requirement)
    const data = raw as { success?: boolean; rows?: unknown; data?: unknown };
    if (data.success && !data.rows && data.data) {
      data.rows = data.data;
    }
    return data;
  }
};
