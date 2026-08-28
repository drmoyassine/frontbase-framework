/**
 * Features Section Template
 * 
 * Reusable template for feature grids with configurable icons, alignment, and colors.
 * Uses the FeatureSection component which is edge-sufficient.
 */

import { ComponentTemplate } from '../types';

interface FeatureSectionConfig {
    title?: string;
    subtitle?: string;
    headerAlignment?: 'left' | 'center' | 'right';
    columns?: number;
    iconSize?: 'sm' | 'md' | 'lg';
    iconAlignment?: 'left' | 'center' | 'right';
    textAlignment?: 'left' | 'center' | 'right';
    iconColor?: string;
    textColor?: string;
    cardBackground?: string;
    sectionBackground?: string;
    features?: Array<{
        id: string;
        icon: string;
        title: string;
        description: string;
        cardBackground?: string;
    }>;
}

export const featuresTemplate = (config: FeatureSectionConfig = {}): ComponentTemplate => ({
    type: 'FeatureSection',
    props: {
        title: config.title || 'Features',
        subtitle: config.subtitle || '',
        headerAlignment: config.headerAlignment || 'center',
        columns: config.columns || 3,
        iconSize: config.iconSize || 'md',
        iconAlignment: config.iconAlignment || 'center',
        textAlignment: config.textAlignment || 'center',
        iconColor: config.iconColor || 'hsl(var(--primary))',
        textColor: config.textColor || 'hsl(var(--muted-foreground))',
        cardBackground: config.cardBackground || 'hsl(var(--card))',
        sectionBackground: config.sectionBackground || 'hsl(var(--background))',
        enableSwipeOnMobile: false,
        features: config.features || [
            { id: 'f1', icon: 'Zap', title: 'Lightning Fast', description: 'Optimized for speed and performance' },
            { id: 'f2', icon: 'Shield', title: 'Secure by Default', description: 'Enterprise-grade security built-in' },
            { id: 'f3', icon: 'Smartphone', title: 'Mobile Ready', description: 'Responsive design that works everywhere' },
        ],
    },
    styles: {},
});

// === HOMEPAGE SECTION PRESETS ===

/** Value Props - 4 pillars with centered icons */
export const valuePropsSectionTemplate = (): ComponentTemplate => featuresTemplate({
    title: 'Why Frontbase?',
    columns: 4,
    iconSize: 'lg',
    iconAlignment: 'center',
    textAlignment: 'center',
    sectionBackground: 'var(--background)',
    features: [
        { id: 'vp1', icon: 'Zap', title: 'Edge-Native SSR', description: 'Sub-50ms globally. Hono-powered. Deploy to Cloudflare, Vercel, or Supabase Edge.' },
        { id: 'vp2', icon: 'Plug', title: 'BYOE', description: 'Bring Your Own Everything. Your databases, auth, storage, cache. We orchestrate.' },
        { id: 'vp3', icon: 'Package', title: 'No-Code → Real Code', description: 'Visual builder exports clean React 19 & Python. Zero lock-in. Eject anytime.' },
        { id: 'vp4', icon: 'Bot', title: 'AI-Ready', description: 'Python native backend. FastAPI + Pydantic. Ready for LangChain and AI agents.' },
    ],
});

/** BYOE Section - 5 columns with smaller icons */
export const byoeSectionTemplate = (): ComponentTemplate => featuresTemplate({
    title: 'Bring Your Own Everything',
    subtitle: "Don't rip and replace. Connect what you already use.",
    columns: 5,
    iconSize: 'md',
    iconAlignment: 'center',
    textAlignment: 'center',
    sectionBackground: 'var(--muted)',
    features: [
        { id: 'byoe1', icon: 'Database', title: 'Databases', description: 'Supabase, PlanetScale, Neon, MySQL, PostgreSQL, SQLite' },
        { id: 'byoe2', icon: 'Lock', title: 'Auth', description: 'Supabase Auth, JWT Providers' },
        { id: 'byoe3', icon: 'FolderOpen', title: 'Storage', description: 'Supabase Storage, S3-compatible' },
        { id: 'byoe4', icon: 'Zap', title: 'Cache', description: 'Upstash Redis, Self-hosted Redis' },
        { id: 'byoe5', icon: 'Rocket', title: 'Deploy', description: 'Cloudflare, Vercel, Supabase Edge, Docker' },
    ],
});

/** Features Grid - 3x2 with left-aligned text */
export const featuresGridTemplate = (): ComponentTemplate => featuresTemplate({
    title: 'Everything You Need',
    subtitle: 'A complete platform for building production apps',
    columns: 3,
    iconSize: 'lg',
    iconAlignment: 'center',
    textAlignment: 'center',
    sectionBackground: 'var(--background)',
    features: [
        { id: 'fg1', icon: 'Palette', title: 'Visual Builder', description: '40+ components. Drag-and-drop. Real-time preview. Responsive design tools.' },
        { id: 'fg2', icon: 'Zap', title: 'Visual Automations', description: 'ReactFlow workflows. Trigger on data changes. API integrations. Webhooks.' },
        { id: 'fg3', icon: 'Shield', title: 'Visual RLS Policies', description: 'Design Supabase row-level security without writing SQL.' },
        { id: 'fg4', icon: 'Database', title: 'Database Management', description: 'Schema visualization. CRUD operations. Query builder. FK detection.' },
        { id: 'fg5', icon: 'BarChart3', title: 'Data Components', description: 'DataTable, Charts (Line/Bar/Pie), Forms, Cards. All data-bound.' },
        { id: 'fg6', icon: 'Search', title: 'SSR & SEO', description: 'Per-page SEO. Open Graph cards. Sitemaps. Canonical URLs.' },
    ],
});

/** Tech Stack - 3 columns, no icons (title + description only) */
export const techStackSectionTemplate = (): ComponentTemplate => featuresTemplate({
    title: 'Modern Tech Stack',
    columns: 3,
    iconSize: 'sm',
    iconAlignment: 'center',
    textAlignment: 'center',
    sectionBackground: 'var(--muted)',
    features: [
        { id: 'ts1', icon: '', title: 'Frontend', description: 'React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query' },
        { id: 'ts2', icon: '', title: 'Edge Engine', description: 'Hono 4.6, React 19 SSR, Drizzle ORM, LiquidJS, Tailwind CSS 4, Zod' },
        { id: 'ts3', icon: '', title: 'Backend', description: 'FastAPI, SQLAlchemy, Alembic, Pydantic, Python 3.11+' },
    ],
});
