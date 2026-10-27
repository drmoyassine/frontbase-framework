/**
 * Shared Builder Functions
 * Helper functions to build common component structures
 */

import { ComponentTemplate } from '../types';

/**
 * Creates a feature card component structure
 */
export function createFeatureCard(icon: string, title: string, description: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: {
            padding: '24px'
        },
        children: [
            {
                type: 'Container',
                props: {},
                styles: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                },
                children: [
                    {
                        type: 'Text',
                        props: { text: icon },
                        styles: { fontSize: '32px' }
                    },
                    {
                        type: 'Heading',
                        props: { text: title, level: 'h3' }
                    },
                    {
                        type: 'Text',
                        props: { text: description },
                        styles: { color: 'var(--muted-foreground)', fontSize: '14px' }
                    }
                ]
            }
        ]
    };
}

/**
 * Creates a pricing card component structure
 */
export function createPricingCard(name: string, price: string, period: string, cta: string, highlighted: boolean): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: {
            padding: '32px',
            border: highlighted ? '2px solid var(--primary)' : undefined
        },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                    { type: 'Heading', props: { text: name, level: 'h3' } },
                    {
                        type: 'Container',
                        props: {},
                        styles: { display: 'flex', flexDirection: 'row', gap: '0', justifyContent: 'center', alignItems: 'baseline' },
                        children: [
                            { type: 'Text', props: { text: price }, styles: { fontSize: '36px', fontWeight: '700' } },
                            { type: 'Text', props: { text: period }, styles: { color: 'var(--muted-foreground)' } }
                        ]
                    },
                    { type: 'Button', props: { text: cta, variant: highlighted ? 'default' : 'outline' }, styles: { width: '100%' } }
                ]
            }
        ]
    };
}

/**
 * Creates a footer column component structure
 */
export function createFooterColumn(title: string, links: string[]): ComponentTemplate {
    return {
        type: 'Container',
        props: {},
        styles: { display: 'flex', flexDirection: 'column', gap: '12px' },
        children: [
            { type: 'Heading', props: { text: title, level: 'h4' }, styles: { fontSize: '14px', fontWeight: '600' } },
            ...links.map(link => ({
                type: 'Link',
                props: { text: link, href: '#' },
                styles: { color: 'var(--muted-foreground)', fontSize: '14px' }
            }))
        ]
    };
}

/**
 * Creates a footer column with better link handling (used in homepage footer)
 */
export function createFooterColumn2(title: string, links: string[]): ComponentTemplate {
    return {
        type: 'Container',
        props: {},
        styles: { display: 'flex', flexDirection: 'column', gap: '12px' },
        children: [
            { type: 'Text', props: { text: title }, styles: { fontWeight: '600', fontSize: '14px' } },
            ...links.map(link => ({
                type: 'Link',
                props: { text: link, href: `#${link.toLowerCase().replace(/\s+/g, '-')}` },
                styles: { color: 'var(--muted-foreground)', fontSize: '14px' }
            }))
        ]
    };
}
