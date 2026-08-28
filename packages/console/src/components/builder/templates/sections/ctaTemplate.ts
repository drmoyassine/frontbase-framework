/**
 * CTA (Call to Action) Section Template
 * Expands to: Container with Card containing heading, text, and button
 */

import { ComponentTemplate } from '../types';

export const ctaTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { padding: '48px 24px' },
    children: [
        {
            type: 'Card',
            props: {},
            styles: { padding: '48px', textAlign: 'center' },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
                    children: [
                        { type: 'Heading', props: { text: 'Ready to get started?', level: 'h2' } },
                        { type: 'Text', props: { text: 'Join thousands of happy users building amazing products.' }, styles: { color: 'var(--muted-foreground)' } },
                        { type: 'Button', props: { text: 'Start Free Trial', variant: 'default' } }
                    ]
                }
            ]
        }
    ]
});
