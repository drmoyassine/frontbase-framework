export interface AuthFormConfig {
    title?: string;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    providers?: string[]; // 'google', 'github', etc.
    socialLayout?: 'horizontal' | 'vertical';
    showLinks?: boolean; // Show "Don't have an account?" etc.
    defaultView?: 'sign_in' | 'sign_up'; // For 'both' type
    magicLink?: boolean; // Enable passwordless magic link
    is_primary?: boolean; // Used for private page gating
    is_embeddable?: boolean; // Allow embedding on external sites
}

export interface AuthForm {
    id: string;
    name: string;
    type: 'login' | 'signup' | 'both';
    config: AuthFormConfig;
    allowedContactTypes?: string[]; // Multiple types allowed
    targetContactType?: string; // Legacy/Single (deprecated mostly, but good for fallback)
    redirectUrl?: string;
    isActive: boolean;
    isPrimary?: boolean; // Derived from config.is_primary for backward compat
    isEmbeddable?: boolean; // Derived from config.is_embeddable
    createdAt?: string;
}

// Maps provider IDs to friendly names and icons (conceptually)
export const AUTH_PROVIDERS = [
    { id: 'google', name: 'Google' },
    { id: 'github', name: 'GitHub' },
    { id: 'discord', name: 'Discord' },
    { id: 'twitter', name: 'Twitter' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'apple', name: 'Apple' },
];
