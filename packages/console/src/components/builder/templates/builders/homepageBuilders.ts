/**
 * Homepage Builder Functions
 * Helper functions specific to the Frontbase homepage template
 */

import { ComponentTemplate } from '../types';

export function createValuePropCard(icon: string, title: string, description: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: { padding: '32px', textAlign: 'center' },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
                children: [
                    { type: 'Text', props: { text: icon }, styles: { fontSize: '48px' } },
                    { type: 'Heading', props: { text: title, level: 'h3' }, styles: { fontSize: '20px', fontWeight: '600' } },
                    { type: 'Text', props: { text: description }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } }
                ]
            }
        ]
    };
}

export function createBYOECard(icon: string, title: string, providers: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: { padding: '24px', textAlign: 'center' },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' },
                children: [
                    { type: 'Text', props: { text: icon }, styles: { fontSize: '32px' } },
                    { type: 'Heading', props: { text: title, level: 'h4' }, styles: { fontSize: '16px', fontWeight: '600' } },
                    { type: 'Text', props: { text: providers }, styles: { color: 'var(--muted-foreground)', fontSize: '12px' } }
                ]
            }
        ]
    };
}

export function createFeatureCard2(icon: string, title: string, description: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: { padding: '32px' },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                    { type: 'Text', props: { text: icon }, styles: { fontSize: '40px' } },
                    { type: 'Heading', props: { text: title, level: 'h3' }, styles: { fontSize: '20px', fontWeight: '600' } },
                    { type: 'Text', props: { text: description }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } }
                ]
            }
        ]
    };
}

export function createTechStackCard(title: string, techs: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: { padding: '32px' },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                    { type: 'Heading', props: { text: title, level: 'h3' }, styles: { fontSize: '20px', fontWeight: '600' } },
                    { type: 'Text', props: { text: techs }, styles: { color: 'var(--muted-foreground)', fontSize: '14px', lineHeight: '1.6' } }
                ]
            }
        ]
    };
}

export function createComparisonCard(title: string, items: string[], isHighlighted: boolean): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: {
            padding: '32px',
            flex: '1 1 350px',
            maxWidth: '420px',
            border: isHighlighted ? '2px solid var(--primary)' : undefined,
            backgroundColor: isHighlighted ? 'var(--primary)' : undefined
        },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                    { type: 'Heading', props: { text: title, level: 'h3' }, styles: { fontSize: '24px', fontWeight: '700', color: isHighlighted ? 'var(--primary-foreground)' : undefined } },
                    ...items.map(item => ({
                        type: 'Text',
                        props: { text: `• ${item}` },
                        styles: { color: isHighlighted ? 'var(--primary-foreground)' : 'var(--muted-foreground)', fontSize: '14px' }
                    }))
                ]
            }
        ]
    };
}
