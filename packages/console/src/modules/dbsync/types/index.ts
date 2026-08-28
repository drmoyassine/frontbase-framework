export interface ColumnSchema {
    name: string
    type: string
    nullable: boolean
    primary_key: boolean
}

export interface TableSchema {
    columns: ColumnSchema[]
}

export interface Datasource {
    id: string
    name: string
    type: 'supabase' | 'postgres' | 'wordpress' | 'wordpress_rest' | 'wordpress_graphql' | 'neon' | 'mysql' | 'google_sheets'
    host: string
    port: number
    database: string
    username?: string
    api_url?: string
    table_prefix: string
    is_active: boolean
    last_tested_at?: string
    last_test_success?: boolean
    views?: DatasourceView[]
    created_at: string
    updated_at: string
}

export interface DatasourceView {
    id: string
    name: string
    description?: string
    datasource_id: string
    target_table: string
    filters: any[]
    field_mappings?: Record<string, string>
    linked_views?: Record<string, any>
    visible_columns?: string[]
    pinned_columns?: string[]
    column_order?: string[]
    webhooks?: any[]
    created_at: string
    updated_at: string
}

export interface RedisSettings {
    redis_url: string | null
    redis_token: string | null  // Upstash REST API token
    redis_type: 'upstash' | 'self-hosted'
    redis_enabled: boolean
    cache_ttl_data: number
    cache_ttl_count: number
}

export interface RedisTestResult {
    success: boolean
    message: string
}




export interface AdvancedVariableConfig {
    collect: boolean
    expose: boolean
}

// Advanced visitor variables (configurable via Settings > Privacy & Tracking)
// Basic variables (country, city, timezone, device) are ALWAYS available - not listed here
export interface AdvancedVariables {
    ip: AdvancedVariableConfig
    browser: AdvancedVariableConfig
    os: AdvancedVariableConfig
    language: AdvancedVariableConfig
    viewport: AdvancedVariableConfig
    themePreference: AdvancedVariableConfig
    connectionType: AdvancedVariableConfig
    referrer: AdvancedVariableConfig
    isBot: AdvancedVariableConfig
}

// Cookie-based visitor variables (require enableVisitorTracking)
export interface CookieVariables {
    isFirstVisit: AdvancedVariableConfig
    visitCount: AdvancedVariableConfig
    firstVisitAt: AdvancedVariableConfig
    landingPage: AdvancedVariableConfig
}

export interface PrivacySettings {
    // Cookie-based repeat visit tracking
    enableVisitorTracking: boolean
    cookieExpiryDays: number
    requireCookieConsent: boolean
    // Cookie-based variable toggles
    cookieVariables: CookieVariables
    // Advanced variable toggles
    advancedVariables: AdvancedVariables
    // Builder-injected analytics on published pages (Sprint 4A)
    ga4MeasurementId?: string
    gtmContainerId?: string
    customHeadHtml?: string
}

// Security-log IP retention (Post-sprint 2.1 — configurable GDPR strict mode).
//   fullIpRetentionDays > 0 : retain full IP N days, then purge
//   0  : anonymize immediately (strictest privacy)
//   -1 : retain indefinitely (legitimate interest)
export interface SecuritySettings {
    fullIpRetentionDays: number
}

export interface EmailProviderSettings {
    provider: 'smtp' | 'resend' | 'mailgun'
    smtp_host: string | null
    smtp_port: number | null
    smtp_user: string | null
    smtp_password: string | null
    smtp_secure: boolean
    from_email: string | null
    from_name: string | null
}

export interface AdminInviteRequest {
    email: string
    role: 'admin' | 'member'
}

export interface AdminInviteResponse {
    success: boolean
    message: string
}
