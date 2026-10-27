/**
 * User-defined FK relationship types.
 *
 * Google Sheets and REST datasources have no native foreign keys, so users
 * define relationships manually. These are stored in the datasource's
 * extra_config JSON and merged into the schema/relationships APIs so they
 * behave identically to native SQL FKs.
 */

export type RelationshipType = 'many_to_one' | 'one_to_one' | 'one_to_many' | 'many_to_many';

/** A user-defined relationship (write payload + stored shape). */
export interface RelationshipDefinition {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
    relationship_type?: RelationshipType;
    label?: string;
    /** Column in the parent (to_table) to display for this FK (e.g. school name). */
    display_column?: string;
    cascade_delete?: boolean;
}

/** Relationship with its array index (from the user-defined list endpoint). */
export interface IndexedRelationship extends RelationshipDefinition {
    index: number;
}

/** Normalized relationship shape returned by GET /relationships/. */
export interface NormalizedRelationship {
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    is_user_defined?: boolean;
    relationship_type?: RelationshipType;
    label?: string;
    display_column?: string;
}

/**
 * Datasource types that have NO native foreign-key reflection (accessed via
 * HTTP/API rather than direct SQL) and therefore rely on user-defined
 * relationships stored in extra_config. Relational DBs (supabase/postgres/
 * neon/mysql) reflect their own FKs from the catalog, so manual definition is
 * hidden for them.
 */
export const MANUAL_RELATIONSHIP_TYPES: ReadonlySet<string> = new Set([
    'google_sheets',
    'rest',
    'wordpress',
    'wordpress_rest',
    'wordpress_graphql',
]);

export const supportsManualRelationships = (type?: string | null): boolean =>
    !!type && MANUAL_RELATIONSHIP_TYPES.has(type);
