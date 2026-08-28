/**
 * Pricing Section Template
 * Expands to: Container with heading and 3-column pricing card grid
 */

import { ComponentTemplate } from '../types';
import { createPricingCard } from '../builders/sectionBuilders';

export const pricingTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        padding: '48px 24px',
        backgroundColor: 'var(--muted)',
        textAlign: 'center'
    },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
            children: [
                { type: 'Heading', props: { text: 'Simple, transparent pricing', level: 'h2' } },
                { type: 'Text', props: { text: 'No hidden fees. Cancel anytime.' }, styles: { color: 'var(--muted-foreground)' } }
            ]
        },
        {
            type: 'Container',
            props: {},
            styles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '900px', margin: '0 auto' },
            children: [
                createPricingCard('Starter', 'Free', '', 'Get Started', false),
                createPricingCard('Pro', '$29', '/month', 'Start Trial', true),
                createPricingCard('Enterprise', 'Custom', '', 'Contact Sales', false)
            ]
        }
    ]
});
