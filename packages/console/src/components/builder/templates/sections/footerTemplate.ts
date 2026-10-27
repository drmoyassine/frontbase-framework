/**
 * Footer Template
 * Professional footer with structured data for columns, socials, and copyright
 * Uses dedicated Footer component type (not composed from Containers)
 */

import { ComponentTemplate } from '../types';

export const footerTemplate = (): ComponentTemplate => ({
    type: 'Footer',
    props: {
        logoText: 'Frontbase',
        description: 'The open-source platform for building modern web applications at the edge.',
        columns: [
            {
                id: 'col-product',
                title: 'Product',
                links: [
                    { id: 'link-features', text: 'Features', href: '#features' },
                    { id: 'link-pricing', text: 'Pricing', href: '/pricing' },
                    { id: 'link-changelog', text: 'Changelog', href: '/changelog' }
                ]
            },
            {
                id: 'col-resources',
                title: 'Resources',
                links: [
                    { id: 'link-docs', text: 'Documentation', href: '/docs' },
                    { id: 'link-github', text: 'GitHub', href: 'https://github.com' },
                    { id: 'link-discord', text: 'Discord', href: 'https://discord.com' }
                ]
            },
            {
                id: 'col-company',
                title: 'Company',
                links: [
                    { id: 'link-about', text: 'About', href: '/about' },
                    { id: 'link-blog', text: 'Blog', href: '/blog' },
                    { id: 'link-careers', text: 'Careers', href: '/careers' }
                ]
            },
            {
                id: 'col-legal',
                title: 'Legal',
                links: [
                    { id: 'link-privacy', text: 'Privacy Policy', href: '/privacy' },
                    { id: 'link-terms', text: 'Terms of Service', href: '/terms' }
                ]
            }
        ],
        socials: [
            { id: 'social-twitter', icon: 'twitter', href: 'https://twitter.com' },
            { id: 'social-github', icon: 'github', href: 'https://github.com' },
            { id: 'social-linkedin', icon: 'linkedin', href: 'https://linkedin.com' }
        ],
        copyright: '© {{year}} Frontbase. Built with ❤️ for the edge.'
    },
    styles: {}
});
