export interface ComponentData {
    id: string;
    type: string;
    props: Record<string, any>;
    styles?: Record<string, any>;
    children?: ComponentData[];
    /**
     * Conditional-visibility expression (written at runtime via updateComponent;
     * typed as string to match the framework's PageComponent.shape and the
     * VisibilityConditionEditor value). Kept optional since legacy components
     * and freshly-added ones do not specify it.
     */
    visibilityCondition?: string;
    /**
     * Per-viewport styling state produced by the Styling tab (visual mode +
     * viewport overrides + raw CSS). Mirrors `stylesData` on the framework's
     * `PageComponent` (packages/edge-core/src/ssr/types.ts), which the framework
     * types loosely as `Record<string, any>`; we use the richer product
     * `StylesData` shape (defined below) since the builder store writes that
     * exact shape via `updateComponentStylesData`. Optional — legacy components
     * and freshly-added ones omit it.
     */
    stylesData?: StylesData;
    /**
     * Component-level data binding. Mirrors `binding` on the framework's
     * `PageComponent`. The framework leaves this opaque
     * (`Record<string, any>`); the product also keeps it loose — note that the
     * DataTable/Grid/Repeater/etc. *props*.binding shape is a separate, richer
     * object stored under `props`, not here. Optional.
     */
    binding?: Record<string, any>;
    /**
     * Per-device hide rules. Mirrors `visibility` on the framework's
     * `PageComponent` (`{ mobile, tablet, desktop }`). Optional — components
     * without explicit hide rules are visible on all viewports.
     */
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
}

// Legacy type for backward compatibility
export interface ContainerStyles {
    orientation?: 'row' | 'column';
    gap?: number;
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    alignItems?: 'start' | 'center' | 'end' | 'stretch';
    justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around';
    backgroundColor?: string;
    padding?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    stylingMode?: 'visual' | 'css';
}

// New styles system
export interface StylesData {
    activeProperties: string[];
    values: Record<string, any>;
    stylingMode: 'visual' | 'css';
    rawCSS?: string;
}

export interface Page {
    id: string;
    name: string;
    slug: string;
    title?: string;
    description?: string;
    keywords?: string;
    isPublic: boolean;
    isHomepage: boolean;

    // containerStyles NOW lives in layoutData.root.containerStyles
    // but we keep this for in-memory representation
    containerStyles?: ContainerStyles | StylesData;

    layoutData?: {
        content: ComponentData[];
        root: {
            containerStyles?: ContainerStyles | StylesData; // Actually stored here in DB
            [key: string]: any;
        };
    };
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;

    contentHash?: string;
    hasUnpublishedChanges?: boolean;
    deployments?: PageDeployment[];
}

export interface PageDeployment {
    id: string;
    engineId: string;
    status: 'published' | 'failed' | 'stale';
    version: number;
    contentHash?: string;
    publishedAt: string;
    errorMessage?: string;
    /** Tenant-aware preview URL returned by the edge at publish time. */
    previewUrl?: string;
    target?: {
        id?: string;
        name?: string;
        url?: string;
        provider?: string;
        is_shared?: boolean;
    };
}

export interface UserContactConfig {
    contactsTable: string;
    authDataSourceId?: string; // ID of the provider account acting as auth provider (e.g. Supabase, Clerk)
    contactsDbId?: string; // ID of the provider account with the contacts database (may differ from auth provider)
    columnMapping: {
        authUserIdColumn: string;
        contactIdColumn: string;
        contactTypeColumn: string;
        permissionLevelColumn: string;
        nameColumn?: string;
        emailColumn?: string;
        phoneColumn?: string;
        avatarColumn?: string;
        createdAtColumn?: string; // For tracking new users/growth
    };
    contactTypes: Record<string, string>; // key -> label (e.g. 'admin' -> 'Administrator')
    contactTypeHomePages?: Record<string, string>; // key (contact type value) -> pageId
    permissionLevels: Record<string, string>; // key -> label
    enabled: boolean;

    // Table Configuration Persistence
    columnOverrides?: Record<string, any>;
    columnOrder?: string[];
    frontendFilters?: any[]; // Using any[] to avoid circular dependency with FilterConfig, or simple array of objects
}

export interface ProjectConfig {
    id: string;
    name: string;
    description?: string;
    appUrl?: string; // Public URL for publish/preview (e.g., https://mysite.com)
    faviconUrl?: string; // Custom favicon URL (uploaded to storage)
    logoUrl?: string; // Custom logo URL (uploaded to storage)
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    usersConfig?: UserContactConfig;
    createdAt: string;
    updatedAt: string;
}

export interface AppVariable {
    id: string;
    name: string;
    type: 'variable' | 'calculated';
    value?: string;
    formula?: string;
    description?: string;
    createdAt: string;
}
