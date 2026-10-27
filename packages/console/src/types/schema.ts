/**
 * Type definitions for schema used in JSON Forms conversion.
 */

export interface ColumnSchema {
    name: string;
    type: string | string[];
    nullable: boolean;
    primary_key: boolean;
    default?: any;
    is_foreign: boolean;
    foreign_table?: string;
    foreign_column?: string;
}

export interface TableSchema {
    columns: ColumnSchema[];
    foreign_keys: ForeignKeyInfo[];
}

export interface ForeignKeyInfo {
    column: string;
    foreign_table: string;
    foreign_column: string;
}
