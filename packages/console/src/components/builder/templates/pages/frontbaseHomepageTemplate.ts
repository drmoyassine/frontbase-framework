/**
 * Frontbase Homepage Template
 * Complete marketing homepage for Frontbase platform
 * 
 * Now uses unified FeatureSection templates for consistent section rendering.
 */

import { ComponentTemplate } from '../types';
import { createComparisonCard } from '../builders/homepageBuilders';
import { heroTemplate } from '../sections/heroTemplate';
import { logoCloudTemplate } from '../sections/logoCloudTemplate';
import { navbarTemplate } from '../sections/navbarTemplate';
import {
    valuePropsSectionTemplate,
    byoeSectionTemplate,
    featuresGridTemplate,
    techStackSectionTemplate
} from '../sections/featuresTemplate';

export const frontbaseHomepageTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        padding: '0',
        minHeight: '100vh'
    },
    children: [
        // === NAVBAR === (using navbarTemplate with Frontbase config)
        navbarTemplate({
            logoText: 'Frontbase',
            logoLink: '/',
            menuItems: [
                { id: 'menu-features', label: 'Features', navType: 'scroll', target: '#features' },
                { id: 'menu-integrations', label: 'Integrations', navType: 'scroll', target: '#integrations' },
                { id: 'menu-architecture', label: 'Architecture', navType: 'scroll', target: '#architecture' }
            ],
            primaryButton: {
                enabled: true,
                text: 'Join Private Alpha',
                navType: 'link',
                target: '/alpha'
            }
        }),
        // === HERO SECTION ===
        heroTemplate(),
        // === TRUST BAR (Powered By) ===
        logoCloudTemplate(),
        // === VALUE PROPS (4 Pillars) - Using FeatureSection ===
        valuePropsSectionTemplate(),
        // === BYOE SECTION - Using FeatureSection ===
        byoeSectionTemplate(),
        // === FEATURES GRID - Using FeatureSection ===
        featuresGridTemplate(),
        // === TECH STACK - Using FeatureSection ===
        techStackSectionTemplate(),
        // === COMPARISON ===
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                padding: '80px 48px',
                gap: '48px',
                backgroundColor: 'var(--background)'
            },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' },
                    children: [
                        { type: 'Heading', props: { text: 'WordPress was built for 2005', level: 'h2' }, styles: { fontSize: '40px', fontWeight: '700' } },
                        { type: 'Text', props: { text: 'Frontbase is built for 2025' }, styles: { fontSize: '24px', fontWeight: '600', color: 'var(--primary)' } }
                    ]
                },
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'flex', flexWrap: 'wrap', gap: '48px', justifyContent: 'center', maxWidth: '900px', margin: '0 auto' },
                    children: [
                        createComparisonCard('WordPress', ['PHP Monolith', 'Slow, requires hosting', 'MySQL only', 'Plugin-dependent AI', 'Theme lock-in', 'jQuery, legacy'], false),
                        createComparisonCard('Frontbase', ['Edge-native serverless', 'Sub-50ms global', 'Any SQL database', 'Native Python AI', 'Clean React/TypeScript', 'React 19, Hono, Tailwind 4'], true)
                    ]
                }
            ]
        },
        // === CTA SECTION ===
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '80px 48px',
                gap: '24px',
                backgroundColor: 'var(--primary)',
                textAlign: 'center'
            },
            children: [
                { type: 'Heading', props: { text: 'Ready to build on the edge?', level: 'h2' }, styles: { fontSize: '40px', fontWeight: '700', color: 'var(--primary-foreground)' } },
                { type: 'Text', props: { text: 'Join the Private Alpha and start building today.' }, styles: { color: 'var(--primary-foreground)', opacity: '0.9', fontSize: '18px' } },
                {
                    type: 'Row',
                    props: {},
                    styles: {
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '16px',
                        marginTop: '16px',
                        padding: '0',
                        borderWidth: '0',
                        minHeight: 'auto'
                    },
                    children: [
                        { type: 'Button', props: { text: 'Join Private Alpha', variant: 'secondary' }, styles: { padding: '12px 32px', fontSize: '16px' } },
                        { type: 'Button', props: { text: 'Star on GitHub', variant: 'outline' }, styles: { padding: '12px 32px', fontSize: '16px', borderColor: 'var(--primary-foreground)', color: 'var(--primary-foreground)' } }
                    ]
                }
            ]
        },
        // === FOOTER ===
        {
            type: 'Footer',
            props: {
                logoText: 'Frontbase',
                description: 'The open-source platform for building modern web applications at the edge.',
                columns: [
                    {
                        id: 'col-frontbase',
                        title: 'Frontbase',
                        links: [
                            { id: 'link-opensource', text: 'Open Source', href: '/opensource' },
                            { id: 'link-license', text: 'MIT License', href: '/license' }
                        ]
                    },
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
                    { id: 'social-github', icon: 'github', href: 'https://github.com' }
                ],
                copyright: '© {{year}} Frontbase. Built with ❤️ for the edge.'
            },
            styles: {}
        }
    ]
});