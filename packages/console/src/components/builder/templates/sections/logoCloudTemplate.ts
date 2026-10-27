/**
 * Logo Cloud Template
 * Uses the LogoCloud component for partner/trust bar display
 */

import { ComponentTemplate } from '../types';

export const logoCloudTemplate = (): ComponentTemplate => ({
    type: 'LogoCloud',
    props: {
        title: 'Powered by the modern stack you already love',
        displayMode: 'static',
        logoSize: 'md',
        grayscale: true,
        logos: [
            { id: 'supabase', type: 'text', value: 'Supabase', url: 'https://supabase.com' },
            { id: 'cloudflare', type: 'text', value: 'Cloudflare', url: 'https://cloudflare.com' },
            { id: 'vercel', type: 'text', value: 'Vercel', url: 'https://vercel.com' },
            { id: 'fastapi', type: 'text', value: 'FastAPI', url: 'https://fastapi.tiangolo.com' },
            { id: 'react', type: 'text', value: 'React 19', url: 'https://react.dev' },
            { id: 'hono', type: 'text', value: 'Hono', url: 'https://hono.dev' }
        ]
    },
    styles: {
        backgroundColor: 'var(--muted)'
    }
});
