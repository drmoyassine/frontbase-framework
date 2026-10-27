// Universal Data Source Types and Interfaces

export interface DataSourceConfig {
  id: string;
  name: string;
  type: 'supabase' | 'xano' | 'airtable' | 'googlesheets' | 'rest';
  connection: Record<string, any>;
  isActive: boolean;
}

export interface ColumnSchema {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'json' | 'uuid' | 'email' | 'url' | 'file';
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  defaultValue?: any;
  constraints?: string[];
  relatedTable?: string;
  relatedColumn?: string;

  // Global display configuration
  globalDisplayName?: string;
  globalDisplayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
  globalDisplayFormat?: string;
}

export interface TableSchema {
  name: string;
  schema?: string;
  columns: ColumnSchema[];
  primaryKey: string[];
  foreignKeys: {
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }[];
  permissions?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
}

export interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'notin' | 'is' | 'isnot';
  value: any;
  type?: 'static' | 'dynamic' | 'template';
  template?: string; // For {{user.id}}, {{url.param}}, etc.
}

export interface QueryOptions {
  table: string;
  select?: string[];
  filters?: QueryFilter[];
  search?: {
    column: string;
    query: string;
  };
  sort?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  pagination?: {
    page: number;
    pageSize: number;
  };
  limit?: number;
  offset?: number;
}

export interface QueryResult<T = any> {
  data: T[];
  count: number;
  error?: string;
  metadata?: {
    totalPages?: number;
    currentPage?: number;
    pageSize?: number;
  };
}

export interface AggregationOptions {
  table: string;
  groupBy?: string[];
  aggregations: {
    column: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'distinct_count';
    alias?: string;
  }[];
  filters?: QueryFilter[];
  having?: QueryFilter[];
}

export interface AggregationResult {
  data: Record<string, any>[];
  error?: string;
}

export interface SubscriptionOptions {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filters?: QueryFilter[];
  callback: (payload: any) => void;
}

export interface DataSourceAdapter {
  // Connection management
  connect(config: Record<string, any>): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<boolean>;

  // Schema operations
  getTableSchema(tableName: string): Promise<TableSchema>;
  getAllTables(): Promise<string[]>;
  getDistinctValues(tableName: string, column: string): Promise<any[]>;

  // Data operations
  query(options: QueryOptions): Promise<QueryResult>;
  aggregate(options: AggregationOptions): Promise<AggregationResult>;
  insert(tableName: string, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }>;
  update(tableName: string, id: any, data: Record<string, any>): Promise<{ success: boolean; data?: any; error?: string }>;
  delete(tableName: string, id: any): Promise<{ success: boolean; error?: string }>;

  // Real-time operations (optional)
  subscribe?(options: SubscriptionOptions): Promise<() => void>;
  unsubscribe?(subscription: any): Promise<void>;

  // Utility methods
  escapeValue(value: any): any;
  buildFilterQuery(filters: QueryFilter[]): any;
  resolveTemplate(template: string, context: Record<string, any>): any;
}

export interface ComponentDataBinding {
  componentId?: string;
  dataSourceId?: string;
  tableName?: string;
  queryOptions?: QueryOptions;
  aggregationOptions?: AggregationOptions;
  refreshInterval?: number; // in seconds, 0 = realtime, -1 = manual

  // Field mapping for binding component props to table columns
  fieldMapping?: Record<string, string>;

  // Component-specific overrides
  columnOverrides?: {
    [columnName: string]: {
      displayName?: string;
      displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
      displayFormat?: string;
      visible?: boolean;
    };
  };

  columnOrder?: string[];

  // Component configuration
  pagination?: {
    enabled: boolean;
    pageSize: number;
    serverSide?: boolean;
    page?: number;
  };

  sorting?: {
    enabled: boolean;
    defaultColumn?: string;
    defaultDirection?: 'asc' | 'desc';
    column?: string;
    direction?: 'asc' | 'desc';
    serverSide?: boolean;
  };

  filtering?: {
    searchEnabled?: boolean;
    filters?: Record<string, any>;
    visibleFilters?: {
      column: string;
      type: 'dropdown' | 'multiselect' | 'text' | 'date' | 'number' | 'toggle';
      label?: string;
      timestamp?: Date;
    }[];
    serverSide?: boolean;
  };
}