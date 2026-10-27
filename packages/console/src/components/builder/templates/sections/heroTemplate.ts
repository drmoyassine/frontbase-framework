/**
 * Hero Section Template
 * Expands to: Container with Badge, Heading, Text, and Button row
 */

import { ComponentTemplate } from '../types';

export const heroTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        minHeight: '400px',
        gap: '24px'
    },
    children: [
        {
            type: 'Badge',
            props: {
                text: 'Now in Private Alpha',
                variant: 'secondary',
                icon: 'Rocket',
                iconPosition: 'left'
            }
        },
        {
            type: 'Heading',
            props: {
                text: 'Build Edge Apps and Microservices Visually',
                level: 'h1'
            },
            styles: {
                fontSize: '48px',
                fontWeight: '700'
            }
        },
        {
            type: 'Text',
            props: {
                text: 'WordPress was built for 2006. Frontbase is built for 2026.'
            },
            styles: {
                color: 'var(--muted-foreground)',
                maxWidth: '600px'
            }
        },
        // Buttons in horizontal row
        {
            type: 'Row',
            props: {},
            styles: {
                justifyContent: 'center',
                alignItems: 'center',
                gap: '16px',
                padding: '0',
                borderWidth: '0',
                minHeight: 'auto',
                marginTop: '16px'
            },
            children: [
                {
                    type: 'Button',
                    props: {
                        text: 'Get Started',
                        variant: 'default',
                        size: 'lg'
                    }
                },
                {
                    type: 'Button',
                    props: {
                        text: 'Learn More',
                        variant: 'outline',
                        size: 'lg'
                    }
                }
            ]
        }
    ]
});
