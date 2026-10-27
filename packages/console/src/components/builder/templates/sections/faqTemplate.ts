/**
 * FAQ Section Template
 * Expands to: Container with heading and Accordion component
 */

import { ComponentTemplate } from '../types';

export const faqTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { display: 'flex', flexDirection: 'column', gap: '32px', padding: '48px 24px', maxWidth: '800px', margin: '0 auto' },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center' },
            children: [
                { type: 'Heading', props: { text: 'Frequently Asked Questions', level: 'h2' } },
                { type: 'Text', props: { text: 'Find answers to common questions' }, styles: { color: 'var(--muted-foreground)' } }
            ]
        },
        {
            type: 'Accordion',
            props: {
                items: [
                    { title: 'How do I get started?', content: 'Simply sign up for a free account and follow our quick start guide.' },
                    { title: 'What payment methods do you accept?', content: 'We accept all major credit cards, PayPal, and bank transfers.' },
                    { title: 'Can I cancel anytime?', content: 'Yes, you can cancel your subscription at any time with no cancellation fees.' }
                ]
            }
        }
    ]
});
