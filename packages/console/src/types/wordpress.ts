/**
 * WordPress integration types for Frontbase.
 *
 * This module contains all TypeScript interfaces for WordPress discovery,
 * extraction, and import functionality.
 */

/**
 * WordPress discovery manifest returned by /discover endpoint.
 */
export interface WordPressDiscovery {
  /** Plugin version string */
  version: string;
  /** Site information */
  site_info: WordPressSiteInfo;
  /** All post types with their fields */
  post_types: WordPressPostType[];
  /** All taxonomies */
  taxonomies: WordPressTaxonomy[];
  /** Custom tables (WooCommerce, etc.) */
  custom_tables: WordPressCustomTable[];
  /** ACF field groups if ACF is active */
  acf_field_groups: ACFFieldGroup[];
  /** Media upload information */
  media: WordPressMediaInfo;
}

/**
 * WordPress site information.
 */
export interface WordPressSiteInfo {
  url: string;
  name: string;
  description: string;
  wp_version: string;
  home_url: string;
  admin_email: string;
  language: string;
  timezone: string;
  date_format: string;
  time_format: string;
}

/**
 * WordPress post type information.
 */
export interface WordPressPostType {
  /** Post type name (e.g., 'post', 'page', 'product') */
  name: string;
  /** Display label */
  label: string;
  /** Description */
  description: string;
  /** Whether hierarchical (like pages) */
  hierarchical: boolean;
  /** REST API base */
  rest_base: string;
  /** Supported features */
  supports: string[];
  /** Associated taxonomies */
  taxonomies: string[];
  /** Custom fields for this post type */
  custom_fields: WordPressCustomField[];
  /** Number of published posts */
  count: number;
  /** Whether has archive */
  has_archive: boolean;
  /** Whether publicly queryable */
  publicly_queryable: boolean;
}

/**
 * WordPress custom field (postmeta) information.
 */
export interface WordPressCustomField {
  /** Meta key name */
  meta_key: string;
  /** Field data type */
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'text' | 'date' | 'datetime';
  /** Whether nullable */
  nullable: boolean;
  /** Sample value from database */
  sample_value: any;
  /** Whether this is an ACF field */
  is_acf: boolean;
  /** ACF field type if is_acf */
  acf_type?: string;
  /** ACF field label if is_acf */
  acf_label?: string;
  /** ACF field key if is_acf */
  acf_key?: string;
}

/**
 * WordPress taxonomy information.
 */
export interface WordPressTaxonomy {
  /** Taxonomy name (e.g., 'category', 'post_tag') */
  name: string;
  /** Display label */
  label: string;
  /** Description */
  description: string;
  /** Whether hierarchical (like categories) */
  hierarchical: boolean;
  /** REST API base */
  rest_base: string;
  /** Post types that use this taxonomy */
  post_types: string[];
  /** Number of terms */
  count: number;
}

/**
 * WordPress custom table information.
 */
export interface WordPressCustomTable {
  /** Table name without prefix */
  name: string;
  /** Full table name with prefix */
  full_name: string;
  /** Estimated row count */
  estimated_rows: number;
  /** Table columns */
  columns: WordPressColumn[];
}

/**
 * WordPress table column information.
 */
export interface WordPressColumn {
  /** Column name */
  name: string;
  /** Column type */
  type: string;
  /** Whether nullable */
  nullable: boolean;
  /** Key type (PRI, MUL, UNI, etc.) */
  key: string;
  /** Default value */
  default: string | null;
}

/**
 * ACF field group information.
 */
export interface ACFFieldGroup {
  /** Field group key */
  key: string;
  /** Field group title */
  title: string;
  /** Field group description */
  description: string;
  /** Fields in this group */
  fields: ACFField[];
  /** Location rules */
  location: ACFLocation;
}

/**
 * ACF field information.
 */
export interface ACFField {
  /** Field key */
  key: string;
  /** Field label */
  label: string;
  /** Field name */
  name: string;
  /** Field type */
  type: ACFFieldType;
  /** Whether required */
  required: boolean;
  /** Field instructions */
  instructions: string;
  /** Default value */
  default_value: any;
  /** Sub-fields for repeater/flexible content/group */
  sub_fields?: ACFField[];
  /** Choices for select/radio/checkbox */
  choices?: Record<string, string>;
  /** Return format for image/file/etc. */
  return_format?: string;
  /** Minimum value for number/range */
  min?: number;
  /** Maximum value for number/range */
  max?: number;
  /** Whether allow multiple values */
  multiple?: boolean;
}

/**
 * ACF field types.
 */
export type ACFFieldType =
  | 'text'
  | 'textarea'
  | 'wysiwyg'
  | 'number'
  | 'email'
  | 'url'
  | 'password'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'true_false'
  | 'date_picker'
  | 'date_time_picker'
  | 'time_picker'
  | 'color_picker'
  | 'message'
  | 'accordion'
  | 'tab'
  | 'group'
  | 'repeater'
  | 'flexible_content'
  | 'clone'
  | 'google_map'
  | 'relationship'
  | 'post_object'
  | 'page_link'
  | 'link'
  | 'user'
  | 'taxonomy';

/**
 * ACF location rules.
 */
export interface ACFLocation {
  /** Post types where this field group appears */
  post_types: string[];
  /** Taxonomies where this field group appears */
  taxonomies: string[];
}

/**
 * WordPress media information.
 */
export interface WordPressMediaInfo {
  /** Upload directory path */
  upload_dir: string;
  /** Upload directory URL */
  upload_url: string;
  /** Total attachment count */
  total_count: number;
}

/**
 * WordPress extraction response.
 */
export interface WordPressExtraction {
  /** Post type name */
  post_type: string;
  /** Total records */
  total: number;
  /** Total pages */
  total_pages: number;
  /** Current page number */
  current_page: number;
  /** Records per page */
  per_page: number;
  /** Extracted records */
  records: WordPressRecord[];
}

/**
 * WordPress post record.
 */
export interface WordPressRecord {
  /** WordPress post ID */
  id: number;
  /** Post title */
  title: string;
  /** Post content */
  content: string;
  /** Post excerpt */
  excerpt: string;
  /** Post status */
  status: string;
  /** Post type */
  type: string;
  /** Post slug */
  slug: string;
  /** Permalink URL */
  permalink: string;
  /** Published date (ISO 8601) */
  date: string;
  /** Published date GMT (ISO 8601) */
  date_gmt: string;
  /** Modified date (ISO 8601) */
  modified: string;
  /** Modified date GMT (ISO 8601) */
  modified_gmt: string;
  /** Parent post ID */
  parent: number;
  /** Menu order */
  menu_order: number;
  /** Comment status */
  comment_status: string;
  /** Ping status */
  ping_status: string;
  /** Author information if included */
  author?: WordPressAuthor;
  /** Featured media if included */
  featured_media?: WordPressFeaturedMedia;
  /** Taxonomy terms if included */
  terms: WordPressTermAssignment[];
  /** All custom fields (meta) */
  meta: Record<string, any>;
  /** Structured ACF data if included */
  acf?: Record<string, any>;
}

/**
 * WordPress author information.
 */
export interface WordPressAuthor {
  /** Author ID */
  id: number;
  /** Display name */
  name: string;
  /** Email address */
  email: string;
  /** Username */
  login: string;
  /** User roles */
  roles: string[];
}

/**
 * WordPress featured media information.
 */
export interface WordPressFeaturedMedia {
  /** Attachment ID */
  id: number;
  /** Full URL */
  url: string;
  /** Title */
  title: string;
  /** Alt text */
  alt: string;
  /** Caption */
  caption: string;
  /** Description */
  description: string;
  /** MIME type */
  mime_type: string;
  /** File path */
  file: string;
  /** Available image sizes */
  sizes: Record<string, WordPressImageSize>;
}

/**
 * WordPress image size information.
 */
export interface WordPressImageSize {
  /** Image URL */
  url: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * WordPress term assignment.
 */
export interface WordPressTermAssignment {
  /** Taxonomy name */
  taxonomy: string;
  /** Taxonomy label */
  taxonomy_label: string;
  /** Term information */
  term: WordPressTerm;
}

/**
 * WordPress term information.
 */
export interface WordPressTerm {
  /** Term ID */
  id: number;
  /** Term name */
  name: string;
  /** Term slug */
  slug: string;
  /** Term description */
  description: string;
  /** Parent term ID */
  parent: number;
  /** Count of posts with this term */
  count: number;
}

/**
 * WordPress import options.
 */
export interface WordPressImportOptions {
  /** Selected post types to import */
  postTypes: string[];
  /** Field mappings for each post type */
  fieldMappings: Record<string, Record<string, string>>;
  /** Whether to render shortcodes to HTML */
  renderShortcodes: boolean;
  /** Whether to include media */
  includeMedia: boolean;
  /** Whether to include taxonomy terms */
  includeTerms: boolean;
  /** Whether to include author information */
  includeAuthor: boolean;
  /** Whether to include ACF data */
  includeACF: boolean;
  /** Whether to preserve WordPress IDs */
  preserveIds: boolean;
  /** Whether to generate URL mappings */
  urlMapping: boolean;
  /** Import context (view or edit) */
  context?: 'view' | 'edit';
}

/**
 * WordPress import progress.
 */
export interface WordPressImportProgress {
  /** Import status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** When import started (ISO 8601) */
  startedAt: string;
  /** When import completed (ISO 8601) */
  completedAt?: string;
  /** Total records to import */
  totalRecords: number;
  /** Records processed so far */
  processedRecords: number;
  /** Records that failed */
  failedRecords: number;
  /** Current post type being imported */
  currentPostType?: string;
  /** Import errors */
  errors: ImportError[];
  /** Current page being processed */
  currentPage?: number;
  /** Total pages to process */
  totalPages?: number;
}

/**
 * Import error information.
 */
export interface ImportError {
  /** Record ID that failed */
  recordId: number;
  /** Post type */
  postType: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: any;
}

/**
 * WordPress import result summary.
 */
export interface WordPressImportResult {
  /** Import ID */
  importId: string;
  /** Import status */
  status: 'completed' | 'failed' | 'partial';
  /** When import started */
  startedAt: string;
  /** When import completed */
  completedAt: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Options used for import */
  options: WordPressImportOptions;
  /** Results by post type */
  postTypes: Record<string, PostTypeImportResult>;
  /** Total records processed */
  totalRecords: number;
  /** Successfully imported */
  successful: number;
  /** Failed imports */
  failed: number;
  /** All errors */
  errors: ImportError[];
  /** URL mappings generated */
  urlMappings?: Record<string, string>;
}

/**
 * Import result for a single post type.
 */
export interface PostTypeImportResult {
  /** Post type name */
  postType: string;
  /** Total records */
  total: number;
  /** Successfully imported */
  imported: number;
  /** Failed imports */
  failed: number;
  /** Errors for this post type */
  errors: ImportError[];
}

/**
 * WordPress datasource configuration.
 */
export interface WordPressDatasourceConfig {
  /** Datasource ID */
  id?: string;
  /** Datasource name */
  name: string;
  /** Site URL */
  siteUrl: string;
  /** Username for application password */
  username: string;
  /** Application password (will be encrypted) */
  applicationPassword: string;
  /** Table prefix (default: wp_) */
  tablePrefix?: string;
  /** Whether plugin is installed */
  pluginInstalled?: boolean;
  /** Plugin version */
  pluginVersion?: string;
}

/**
 * WordPress field mapping.
 */
export interface FieldMapping {
  /** Frontbase field name */
  frontbaseField: string;
  /** WordPress field path (dot notation for nested) */
  wordpressPath: string;
  /** Whether this is a required field */
  required?: boolean;
  /** Field type transformation if needed */
  transform?: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'datetime' | 'json';
}

/**
 * Post type import configuration.
 */
export interface PostTypeImportConfig {
  /** WordPress post type name */
  postType: string;
  /** Whether to import this post type */
  selected: boolean;
  /** Frontbase content model ID */
  contentModelId?: string;
  /** Field mappings */
  fieldMappings: FieldMapping[];
  /** Import options specific to this post type */
  options?: {
    renderShortcodes?: boolean;
    includeMedia?: boolean;
    includeTerms?: boolean;
    includeAuthor?: boolean;
    includeACF?: boolean;
  };
}
