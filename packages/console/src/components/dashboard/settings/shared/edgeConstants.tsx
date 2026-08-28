/**
 * Edge Constants — Shared provider registry.
 *
 * Single source of truth for provider metadata consumed by:
 * - ConnectProviderDialog (form configs)
 * - DeployEngineWizard (labels, suffixes, provider set)
 * - EdgeProvidersSection (icons)
 * - EdgeDatabasesForm / EdgeCachesForm / EdgeQueuesForm (provider icons)
 *
 * To add a new provider: add entries to PROVIDER_ICONS, PROVIDER_CONFIGS,
 * and (if deployable) KNOWN_EDGE_PROVIDERS + PROVIDER_RESOURCE_LABELS.
 */

import React from 'react';
import { Cloud, Server, Globe, Rocket, Database, Workflow, Triangle, Hexagon, Zap, HardDrive, Bot, Cpu, Mail, Table } from 'lucide-react';
import { BRAND_ICONS } from '@/components/icons/providers';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// API Base
// ============================================================================

export const API_BASE = '';

// ============================================================================
// Provider Icons — used everywhere for provider badge/icon display
// Lucide icons are fallbacks; brand SVGs from src/components/icons/ override.
// To add a brand icon: drop {provider_key}.svg in src/components/icons/
// and add the import in providers.tsx.
// ============================================================================

const LUCIDE_FALLBACKS: Record<string, React.FC<any>> = {
    cloudflare: Cloud,
    docker: Server,
    flyio: Rocket,
    supabase: Database,
    upstash: Workflow,
    vercel: (props: any) => <Triangle {...props} fill="currentColor" />,
    netlify: Hexagon,
    deno: Zap,
    wordpress_rest: Globe,
    wordpress_plugin: Rocket,  // Plugin mode gets a different icon to distinguish from REST
    wordpress_graphql: Globe,  // GraphQL uses same icon as REST API
    postgres: Database,
    mysql: HardDrive,
    neon: Database,
    google_sheets: Table,
    turso: Cloud,
    openai: Bot,
    anthropic: Cpu,
    ollama: Server,
    resend: Mail,
    mailgun: Mail,
};

/** Brand SVGs override Lucide fallbacks when a matching .svg exists */
export const PROVIDER_ICONS: Record<string, React.FC<any>> = {
    ...LUCIDE_FALLBACKS,
    ...BRAND_ICONS,
};

// ============================================================================
// Deployable Edge Providers — providers that can host an Edge Engine
// ============================================================================

export const KNOWN_EDGE_PROVIDERS = new Set([
    'cloudflare', 'supabase', 'vercel', 'netlify', 'deno',
]);


// ============================================================================
// Provider Resource Labels — used by DeployEngineWizard for input labels
// ============================================================================

export const PROVIDER_RESOURCE_LABELS: Record<string, { inputLabel: string; urlSuffix: string }> = {
    cloudflare: { inputLabel: 'Worker Name', urlSuffix: '.workers.dev' },
    supabase: { inputLabel: 'Function Name', urlSuffix: '' },
    vercel: { inputLabel: 'Project Name', urlSuffix: '.vercel.app' },
    netlify: { inputLabel: 'Site Name', urlSuffix: '.netlify.app' },
    deno: { inputLabel: 'Project Name', urlSuffix: '.deno.dev' },
};

// ============================================================================
// GPU Model Type Colors & Labels — used by DeployEngineWizard catalog
// ============================================================================

export const GPU_TYPE_COLORS: Record<string, string> = {
    llm: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
    embedder: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    stt: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    tts: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
    image_gen: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
    classifier: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
    vision: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
};

export const GPU_TYPE_LABELS: Record<string, string> = {
    llm: '🔤 Text Generation',
    embedder: '📊 Embeddings',
    stt: '🎤 Speech-to-Text',
    tts: '🔊 Text-to-Speech',
    image_gen: '🖼️ Image Gen',
    classifier: '🏷️ Classifier',
    vision: '👁️ Vision',
    translator: '🌐 Translator',
    summarizer: '📝 Summarizer',
};

// ============================================================================
// GPU Catalog Types & API Helpers
// ============================================================================

export interface CatalogModel {
    name: string;
    model_id: string;
    task_type: string;
    model_type: string;
    description: string;
    properties: string[];
    schema: any;
}

export async function fetchGPUCatalog(
    providerId: string,
): Promise<{ models_by_type: Record<string, CatalogModel[]>; total: number }> {
    const res = await fetch(`${API_BASE}/api/edge-gpu/catalog?provider_id=${providerId}&provider=workers_ai`);
    if (!res.ok) throw new Error('Failed to fetch model catalog');
    return res.json();
}

export async function deployGPUModel(data: any, skipRedeploy = false): Promise<any> {
    const url = `${API_BASE}/api/edge-gpu/${skipRedeploy ? '?skip_redeploy=true' : ''}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to deploy model');
    }
    return res.json();
}

// ============================================================================
// Provider Credential Form Configs — used by ConnectProviderDialog
// ============================================================================

export interface ProviderFieldConfig {
    key: string;
    label: string;
    placeholder: string;
    type?: string;
    required?: boolean;
}

export type ProviderCapability = 'cpu' | 'gpu' | 'database' | 'auth' | 'storage' | 'cache' | 'queue' | 'vector_db' | 'search' | 'cms' | 'email' | 'sandbox';

/** Human-readable short labels for provider capabilities */
export const CAPABILITY_LABELS: Record<ProviderCapability, string> = {
    cpu: 'CPU',
    gpu: 'GPU',
    database: 'Database',
    auth: 'Auth',
    storage: 'Storage',
    cache: 'Cache',
    queue: 'Queue',
    vector_db: 'Vector DB',
    search: 'Search',
    cms: 'CMS',
    email: 'Email',
    sandbox: 'Sandbox',
};

export interface ProviderConfig {
    label: string;
    defaultName: string;
    fields: ProviderFieldConfig[];
    helpText?: React.ReactNode;
    /** What this provider can do — used for filtering (e.g. deploy wizard GPU vs CPU) */
    capabilities?: ProviderCapability[];
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    cloudflare: {
        label: 'Cloudflare',
        defaultName: 'Cloudflare Account',
        capabilities: ['cpu', 'gpu', 'database', 'storage', 'cache', 'queue', 'vector_db'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Cloudflare API Token', type: 'password', required: true },
        ],
        helpText: <span className="text-xs text-muted-foreground leading-relaxed">Create a <a href="https://dash.cloudflare.com/profile/api-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Custom API Token</a> with <strong>Account</strong>-level permissions: <em>(Edit)</em> for Workers Scripts · D1 · R2 Storage · KV Storage · Queues · API Tokens, and <em>(Read)</em> for Workers AI · Account Settings.</span>,
    },
    supabase: {
        label: 'Supabase',
        defaultName: 'Supabase Account',
        capabilities: ['cpu', 'database', 'auth', 'storage', 'vector_db'],
        fields: [
            { key: 'access_token', label: 'Access Token', placeholder: 'sbp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Generate access token →</a> One token discovers all your projects.</>,
    },
    upstash: {
        label: 'Upstash',
        defaultName: 'Upstash Account',
        capabilities: ['cpu', 'cache', 'queue', 'vector_db', 'search'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Upstash API Token', type: 'password', required: true },
            { key: 'email', label: 'Email', placeholder: 'you@example.com', required: true },
        ],
        helpText: <><a href="https://console.upstash.com/account/api?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Get API key →</a> Found in Console → Account → Management API.</>,
    },
    vercel: {
        label: 'Vercel',
        defaultName: 'Vercel Account',
        capabilities: ['cpu', 'storage', 'cache', 'sandbox'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'Vercel API Token', type: 'password', required: true },
        ],
        helpText: <><a href="https://vercel.com/account/tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> One token for all your projects.</>,
    },
    netlify: {
        label: 'Netlify',
        defaultName: 'Netlify Account',
        capabilities: ['cpu', 'storage'],
        fields: [
            { key: 'api_token', label: 'API Token', placeholder: 'nfp_...', type: 'password', required: true },
        ],
        helpText: <><a href="https://app.netlify.com/user/applications#personal-access-tokens?ref=frontbase.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Create token →</a> A site will be created automatically on first deploy.</>,
    },
    deno: {
        label: 'Deno',
        defaultName: 'Deno Deploy Account',
        capabilities: ['cpu', 'sandbox'],
        fields: [
            { key: 'access_token', label: 'Organization Token', placeholder: 'ddo_...', type: 'password', required: true },
            { key: 'personal_token', label: 'Personal Token', placeholder: 'ddp_...', type: 'password', required: false },
        ],
        helpText: <>Org token for deploys, personal token to auto-detect org slug. Get both from <a href="https://dash.deno.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Deno Deploy dashboard</a>.</>,
    },
    neon: {
        label: 'Neon',
        defaultName: 'Neon Account',
        capabilities: ['database', 'auth'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'neon_api_...', type: 'password', required: true },
        ],
        helpText: <>Found in <a href="https://console.neon.tech/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Neon console</a> → Account Settings → API Keys.</>,
    },
    postgres: {
        label: 'PostgreSQL',
        defaultName: 'PostgreSQL Server',
        capabilities: ['database'],
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '5432' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'postgres', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    mysql: {
        label: 'MySQL',
        defaultName: 'MySQL Server',
        capabilities: ['database'],
        fields: [
            { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
            { key: 'port', label: 'Port', placeholder: '3306' },
            { key: 'database', label: 'Database', placeholder: 'mydb', required: true },
            { key: 'username', label: 'Username', placeholder: 'root', required: true },
            { key: 'password', label: 'Password', placeholder: 'Password', type: 'password', required: true },
        ],
    },
    wordpress_rest: {
        label: 'WordPress REST API',
        defaultName: 'WordPress REST API',
        capabilities: ['database', 'cms'],
        fields: [
            { key: 'base_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Connect using WordPress REST API. Requires posts, pages, and custom post types to be publicly readable. <strong>Note:</strong> Some features like custom field extraction may be limited.</>,
    },
    wordpress_plugin: {
        label: 'WordPress Plugin',
        defaultName: 'WordPress with Plugin',
        capabilities: ['database', 'cms'],
        fields: [
            { key: 'api_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: (
            <div className="text-xs space-y-2">
                <p>Connect using the <strong>Frontbase Connector</strong> WordPress plugin for full features.</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Install the plugin from <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">docs/plans/wordpress-plugin/</code></li>
                    <li>Or search <strong>Frontbase Connector</strong> in WordPress plugin directory</li>
                    <li>Generate an Application Password in WordPress → Users → Profile</li>
                </ol>
                <p className="text-green-700 dark:text-green-400">✓ ACF support, shortcode rendering, and custom field extraction</p>
            </div>
        ),
    },
    wordpress_graphql: {
        label: 'WordPress GraphQL',
        defaultName: 'WordPress GraphQL',
        capabilities: ['database', 'cms'],
        fields: [
            { key: 'api_url', label: 'Site URL', placeholder: 'https://mysite.com', required: true },
            { key: 'username', label: 'Username', placeholder: 'admin', required: true },
            { key: 'app_password', label: 'Application Password', placeholder: 'xxxx xxxx xxxx xxxx', type: 'password', required: true },
        ],
        helpText: <>Connect using the WordPress GraphQL API (WPGraphQL plugin required). Supports queries via GraphQL endpoint.</>,
    },
    google_sheets: {
        label: 'Google Sheets',
        defaultName: 'Google Sheets',
        capabilities: ['database'],
        fields: [],  // Configured inline in DatasourceModal, not via Connected Account
        helpText: <>Connect Google Sheets as a datasource via Apps Script Web App. See <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">docs/google-sheets-setup.md</code> in the repo for setup instructions.</>,
    },
    turso: {
        label: 'Turso',
        defaultName: 'Turso Databases',
        capabilities: ['database', 'vector_db'],
        fields: [
            { key: 'db_url', label: 'Database URL', placeholder: 'libsql://your-db.turso.io', required: true },
            { key: 'db_token', label: 'Auth Token', placeholder: 'Database auth token', type: 'password', required: true },
        ],
        helpText: <>Get your URL and token from the Turso dashboard or CLI.</>,
    },
    openai: {
        label: 'OpenAI',
        defaultName: 'OpenAI Account',
        capabilities: ['gpu'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'sk-...', type: 'password', required: true },
        ],
        helpText: <>Get your API key from the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">OpenAI dashboard</a>.</>,
    },
    anthropic: {
        label: 'Anthropic',
        defaultName: 'Anthropic Account',
        capabilities: ['gpu'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-...', type: 'password', required: true },
        ],
        helpText: <>Get your API key from the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Anthropic Console</a>.</>,
    },
    ollama: {
        label: 'Ollama (Local)',
        defaultName: 'Local Ollama',
        capabilities: ['gpu'],
        fields: [
            { key: 'base_url', label: 'Base URL', placeholder: 'http://localhost:11434', required: true },
        ],
        helpText: <>Ensure your local Ollama instance is running and accessible from the server.</>,
    },
    resend: {
        label: 'Resend',
        defaultName: 'Resend Account',
        capabilities: ['email'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 're_...', type: 'password', required: true },
        ],
        helpText: <>Get your API key from the <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Resend dashboard</a>.</>,
    },
    mailgun: {
        label: 'Mailgun',
        defaultName: 'Mailgun Account',
        capabilities: ['email'],
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'key-...', type: 'password', required: true },
            { key: 'domain', label: 'Domain', placeholder: 'mg.example.com', required: true },
            { key: 'region', label: 'Region', placeholder: 'us', required: false },
        ],
        helpText: <>Found in Mailgun → API Security. US = api.mailgun.net, EU = api.eu.mailgun.net.</>,
    },
};

// Derived: providers that support GPU inference (used to filter deploy wizard)
export const GPU_CAPABLE_PROVIDERS = new Set(
    Object.entries(PROVIDER_CONFIGS).filter(([, c]) => c.capabilities?.includes('gpu')).map(([k]) => k)
);

// Derived: providers that support object storage (used to filter Storage modal)
export const STORAGE_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('storage'))
    .map(([k]) => k);

// Derived: providers that support auth (used to filter Auth modal)
export const AUTH_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('auth'))
    .map(([k]) => k);

// Derived: providers that support database (used to filter Contacts DB selector)
export const DATABASE_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('database'))
    .map(([k]) => k);

// Derived: providers that support cache (used by EdgeCacheDialog)
export const CACHE_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('cache'))
    .map(([k]) => k);

// Derived: providers that support queue (used by EdgeQueuesForm)
export const QUEUE_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('queue'))
    .map(([k]) => k);

// Derived: providers that support email
export const EMAIL_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('email'))
    .map(([k]) => k);

// Derived: providers that support vector db
export const VECTOR_CAPABLE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('vector_db'))
    .map(([k]) => k);

// ============================================================================
// Edge Resource Provider Registries
//
// Resource-level providers used by the edge DB / Cache / Queue forms.
// Each maps back to an account-level provider in PROVIDER_CONFIGS.
// `accountProvider` — the connected-account provider used for auto-discovery
// `active`          — whether the resource provider has connected-account support
// ============================================================================

export interface EdgeResourceProvider {
    value: string;
    label: string;
    icon: React.FC<any>;
    accountProvider: string | null;  // maps to PROVIDER_CONFIGS key
    active: boolean;
    placeholder?: string;  // URL placeholder for manual entry
    /** Resource type filter for AccountResourcePicker discovery (e.g. 'redis', 'qstash', 'd1') */
    resourceTypeFilter?: string;
    /** Resource type to create when user clicks "Create New" */
    createResourceType?: string;
    /** If set, this resource only works natively on the specified engine platform.
     *  On other platforms, it requires HTTP API access (with limitations). */
    platformLock?: string;
    /** Human-readable compatibility hint shown when platformLock doesn't match engine */
    compatHint?: string;
    /** Hide this provider from the "Connect ..." modal without removing it from the
     *  registry. Used for system/auto-provisioned resources (e.g. embedded_lancedb)
     *  that are seeded by the backend and should never appear as a connectable
     *  option. The entry stays in the array so label/icon resolution still works. */
    hiddenFromConnectModal?: boolean;
}

/**
 * Database providers — derived from PROVIDER_CONFIGS capabilities.
 * Includes all providers with 'database' capability, EXCEPT wordpress_rest.
 */
export const EDGE_DATABASE_PROVIDERS: EdgeResourceProvider[] = [
    { value: 'cloudflare', label: 'D1 SQLite',           icon: PROVIDER_ICONS.cloudflare || Cloud,    accountProvider: 'cloudflare', active: true,  resourceTypeFilter: 'd1',              createResourceType: 'd1' },
    { value: 'supabase',   label: 'Supabase Postgres',   icon: PROVIDER_ICONS.supabase   || Database, accountProvider: 'supabase',   active: true,  resourceTypeFilter: 'supabase_project' },
    { value: 'turso',      label: 'Turso SQLite',         icon: PROVIDER_ICONS.turso      || Cloud,    accountProvider: 'turso',      active: true,  resourceTypeFilter: 'turso_db',        createResourceType: 'turso_db' },
    { value: 'neon',       label: 'Neon Postgres',         icon: PROVIDER_ICONS.neon       || Database, accountProvider: 'neon',       active: true,  resourceTypeFilter: 'neon_project' },
    { value: 'postgres',   label: 'PostgreSQL',            icon: PROVIDER_ICONS.postgres   || Database, accountProvider: null,         active: false, placeholder: 'postgresql://user:pass@host:5432/db' },
    { value: 'mysql',      label: 'MySQL',                 icon: PROVIDER_ICONS.mysql      || HardDrive, accountProvider: null,        active: false, placeholder: 'mysql://user:pass@host:3306/db' },
    { value: 'sqlite',     label: 'Local SQLite',          icon: HardDrive,                             accountProvider: null,         active: false, placeholder: 'file:local' },
];

export const DB_PROVIDER_OPTIONS = EDGE_DATABASE_PROVIDERS;

/**
 * Cache providers — derived from PROVIDER_CONFIGS capabilities.
 * Includes all providers with 'cache' capability.
 */
export const EDGE_CACHE_PROVIDERS: EdgeResourceProvider[] = [
    { value: 'upstash',    label: 'Upstash Redis',     icon: PROVIDER_ICONS.upstash    || Cloud,    accountProvider: 'upstash',    active: true,  resourceTypeFilter: 'redis',       createResourceType: 'redis' },
    { value: 'cloudflare', label: 'Cloudflare KV',     icon: PROVIDER_ICONS.cloudflare || Cloud,    accountProvider: 'cloudflare', active: true,  resourceTypeFilter: 'kv',          createResourceType: 'kv' },
    { value: 'vercel',     label: 'Vercel Edge Config', icon: PROVIDER_ICONS.vercel    || Triangle, accountProvider: 'vercel',     active: true,  resourceTypeFilter: 'edge_config' },
    { value: 'deno',       label: 'Deno KV',           icon: PROVIDER_ICONS.deno       || Zap,      accountProvider: 'deno',       active: true,  resourceTypeFilter: 'deno_project', platformLock: 'deno', compatHint: 'Deno KV is only available on Deno Deploy engines. Other platforms cannot access Deno KV.' },
    { value: 'redis',      label: 'Self-Hosted Redis',  icon: Server,                               accountProvider: null,         active: false },
    { value: 'dragonfly',  label: 'Dragonfly',          icon: Server,                               accountProvider: null,         active: false },
];

/**
 * Queue providers — derived from PROVIDER_CONFIGS capabilities.
 * Includes all providers with 'queue' capability.
 */
export const EDGE_QUEUE_PROVIDERS: EdgeResourceProvider[] = [
    { value: 'qstash',     label: 'Upstash QStash',         icon: PROVIDER_ICONS.upstash    || Zap,     accountProvider: 'upstash',    active: true,  resourceTypeFilter: 'qstash' },
    { value: 'cloudflare', label: 'Cloudflare Queues',       icon: PROVIDER_ICONS.cloudflare || Cloud,   accountProvider: 'cloudflare', active: true,  resourceTypeFilter: 'queue',  createResourceType: 'queue' },
    { value: 'rabbitmq',   label: 'RabbitMQ',            icon: Server,                               accountProvider: null,         active: false },
    { value: 'bullmq',     label: 'BullMQ',              icon: Server,                               accountProvider: null,         active: false },
    { value: 'sqs',        label: 'AWS SQS',             icon: Cloud,                                accountProvider: null,         active: false },
];

/**
 * Storage providers — derived from PROVIDER_CONFIGS capabilities.
 * Includes all providers with 'storage' capability.
 */
export const EDGE_STORAGE_PROVIDERS: EdgeResourceProvider[] = [
    { value: 'cloudflare', label: 'Cloudflare R2',       icon: PROVIDER_ICONS.cloudflare || Cloud,    accountProvider: 'cloudflare', active: true,  resourceTypeFilter: 'r2' },
    { value: 'supabase',   label: 'Supabase Storage',    icon: PROVIDER_ICONS.supabase   || Database, accountProvider: 'supabase',   active: true,  resourceTypeFilter: 'supabase_project' },
    { value: 'vercel',     label: 'Vercel Blob',         icon: PROVIDER_ICONS.vercel     || Triangle, accountProvider: 'vercel',     active: true,  resourceTypeFilter: 'blob_store' },
    { value: 'netlify',    label: 'Netlify Blobs',       icon: PROVIDER_ICONS.netlify    || Hexagon,  accountProvider: 'netlify',    active: true,  resourceTypeFilter: 'netlify_site' },
    { value: 's3',         label: 'AWS S3',              icon: Cloud,                                 accountProvider: null,         active: false },
    { value: 'gcs',        label: 'Google Cloud',        icon: Cloud,                                 accountProvider: null,         active: false },
];

/**
 * Vector providers — derived from PROVIDER_CONFIGS capabilities.
 * Includes all providers with 'vector_db' capability, plus some stubs.
 */
export const EDGE_VECTOR_PROVIDERS: EdgeResourceProvider[] = [
    { value: 'pgvector',             label: 'pgvector (Postgres)',   icon: PROVIDER_ICONS.supabase || Database, accountProvider: 'supabase',   active: true,  resourceTypeFilter: 'supabase_project' },
    { value: 'cloudflare_vectorize', label: 'CF Vectorize',          icon: PROVIDER_ICONS.cloudflare || Cloud,  accountProvider: 'cloudflare', active: true,  resourceTypeFilter: 'vectorize' },
    { value: 'turso_vector',         label: 'Turso Vector',          icon: PROVIDER_ICONS.turso || Cloud,       accountProvider: 'turso',      active: true,  resourceTypeFilter: 'turso_db' },
    { value: 'libsql_vector',        label: 'libSQL Vector',         icon: Cloud,                                 accountProvider: null,         active: true,  platformLock: 'docker', compatHint: 'libSQL vector is the default on self-hosted Docker engines.', hiddenFromConnectModal: true },
    { value: 'embedded_lancedb',     label: 'Embedded LanceDB',      icon: HardDrive,                           accountProvider: null,         active: true,  platformLock: 'docker', compatHint: 'Embedded LanceDB requires LANCEDB_ENABLED=true (native binary unverified on Alpine/musl).', hiddenFromConnectModal: true },
];

// ============================================================================
// Engine Provider Labels — used by edge engine cards
// ============================================================================

export const ENGINE_PROVIDER_LABELS: Record<string, string> = {
    cloudflare: 'CF Workers',
    vercel: 'Vercel Edge',
    supabase: 'Supabase Edge',
    netlify: 'Netlify Functions',
    deno: 'Deno Deploy',
    upstash: 'Upstash Workflow',
};

// ============================================================================
// Shared ProviderBadge — DRY badge component used across all resource cards.
// Matches storage badge styling: bg-primary/5, text-primary, border-primary/20.
// ============================================================================

/** All resource-type registries, combined for label lookup */
const ALL_RESOURCE_PROVIDERS = [
    ...EDGE_DATABASE_PROVIDERS,
    ...EDGE_CACHE_PROVIDERS,
    ...EDGE_QUEUE_PROVIDERS,
    ...EDGE_STORAGE_PROVIDERS,
    ...EDGE_VECTOR_PROVIDERS,
];

/** Look up the human label for a provider key, falling back to the key itself */
export function getProviderLabel(providerKey: string, resourceType?: 'database' | 'cache' | 'queue' | 'storage' | 'engine' | 'vector_db'): string {
    if (resourceType === 'engine') return ENGINE_PROVIDER_LABELS[providerKey] || providerKey;
    // Try resource registries first (they have the most specific label)
    const match = ALL_RESOURCE_PROVIDERS.find(p => p.value === providerKey);
    if (match) return match.label;
    // Fall back to account-level config label
    return PROVIDER_CONFIGS[providerKey]?.label || providerKey;
}

/** Shared provider badge matching the Storage cards style */
export function ProviderBadge({ provider, label }: { provider: string; label?: string }) {
    const Icon = PROVIDER_ICONS[provider];
    const displayLabel = label || getProviderLabel(provider);
    return (
        <Badge variant="outline" className="text-xs font-semibold gap-1.5 px-2 py-0.5 bg-primary/5 text-primary border-primary/20">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {displayLabel}
        </Badge>
    );
}

