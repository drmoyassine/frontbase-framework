/**
 * Navbar Template
 * Creates a Navbar component with configurable options
 */

import { ComponentTemplate } from '../types';

interface NavbarConfig {
    logoText?: string;
    logoLink?: string;
    menuItems?: Array<{
        id: string;
        label: string;
        navType: 'scroll' | 'link';
        target: string;
    }>;
    primaryButton?: {
        enabled: boolean;
        text: string;
        navType: 'scroll' | 'link';
        target: string;
    };
    secondaryButton?: {
        enabled: boolean;
        text: string;
        navType: 'scroll' | 'link';
        target: string;
    };
}

export const navbarTemplate = (config: NavbarConfig = {}): ComponentTemplate => ({
    type: 'Navbar',
    props: {
        logo: {
            type: 'text',
            text: config.logoText || 'YourBrand',
            link: config.logoLink || '/'
        },
        menuItems: config.menuItems || [
            { id: 'menu-1', label: 'Features', navType: 'scroll', target: '#features' },
            { id: 'menu-2', label: 'Pricing', navType: 'scroll', target: '#pricing' },
            { id: 'menu-3', label: 'About', navType: 'link', target: '/about' }
        ],
        primaryButton: config.primaryButton || {
            enabled: true,
            text: 'Get Started',
            navType: 'link',
            target: '/signup'
        },
        secondaryButton: config.secondaryButton || {
            enabled: false,
            text: 'Learn More',
            navType: 'scroll',
            target: '#features'
        }
    },
    styles: {
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--background)'
    }
});

