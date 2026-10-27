// Component template definitions
export interface ComponentTemplate {
    id: string;
    name: string;
    category: 'hero' | 'navigation' | 'footer' | 'form' | 'content' | 'cta';
    description: string;
    components: any[]; // Array of ComponentData
    tags: string[];
}

export const componentTemplates: ComponentTemplate[] = [
    // Hero Templates
    {
        id: 'hero-simple',
        name: 'Simple Hero',
        category: 'hero',
        description: 'Clean hero section with heading, subtitle, and CTA',
        tags: ['landing', 'header', 'cta'],
        components: [
            {
                id: 'hero-container',
                type: 'Container',
                props: { className: 'py-20 text-center' },
                styles: {
                    padding: '80px 20px',
                    textAlign: 'center',
                    backgroundColor: '#f9fafb'
                },
                children: [
                    {
                        id: 'hero-heading',
                        type: 'Heading',
                        props: { level: 1, text: 'Welcome to Your Product' },
                        styles: { fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }
                    },
                    {
                        id: 'hero-subtitle',
                        type: 'Text',
                        props: { text: 'Build amazing experiences with our platform' },
                        styles: { fontSize: '20px', color: '#6b7280', marginBottom: '32px' }
                    },
                    {
                        id: 'hero-cta',
                        type: 'Button',
                        props: { text: 'Get Started', variant: 'primary' },
                        styles: { padding: '12px 32px', fontSize: '18px' }
                    }
                ]
            }
        ]
    },

    // Navigation Templates
    {
        id: 'nav-simple',
        name: 'Simple Navigation',
        category: 'navigation',
        description: 'Basic navigation bar with logo and links',
        tags: ['header', 'menu', 'links'],
        components: [
            {
                id: 'nav-container',
                type: 'Container',
                props: { className: 'flex justify-between items-center p-4' },
                styles: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 32px',
                    borderBottom: '1px solid #e5e7eb'
                },
                children: [
                    {
                        id: 'nav-logo',
                        type: 'Text',
                        props: { text: 'Logo' },
                        styles: { fontSize: '24px', fontWeight: 'bold' }
                    },
                    {
                        id: 'nav-links',
                        type: 'Container',
                        props: { className: 'flex gap-6' },
                        styles: { display: 'flex', gap: '24px' },
                        children: [
                            { id: 'nav-link-1', type: 'Link', props: { text: 'Home', href: '/' } },
                            { id: 'nav-link-2', type: 'Link', props: { text: 'About', href: '/about' } },
                            { id: 'nav-link-3', type: 'Link', props: { text: 'Contact', href: '/contact' } }
                        ]
                    }
                ]
            }
        ]
    },

    // Footer Template
    {
        id: 'footer-simple',
        name: 'Simple Footer',
        category: 'footer',
        description: 'Basic footer with copyright and links',
        tags: ['footer', 'links', 'copyright'],
        components: [
            {
                id: 'footer-container',
                type: 'Container',
                props: { className: 'p-8 text-center' },
                styles: {
                    padding: '32px',
                    textAlign: 'center',
                    borderTop: '1px solid #e5e7eb',
                    backgroundColor: '#f9fafb'
                },
                children: [
                    {
                        id: 'footer-text',
                        type: 'Text',
                        props: { text: '© 2024 Your Company. All rights reserved.' },
                        styles: { fontSize: '14px', color: '#6b7280' }
                    }
                ]
            }
        ]
    },

    // Form Template
    {
        id: 'contact-form',
        name: 'Contact Form',
        category: 'form',
        description: 'Simple contact form with name, email, message',
        tags: ['form', 'contact', 'input'],
        components: [
            {
                id: 'form-container',
                type: 'Form',
                props: {},
                styles: { maxWidth: '500px', margin: '0 auto', padding: '32px' },
                children: [
                    {
                        id: 'form-heading',
                        type: 'Heading',
                        props: { level: 2, text: 'Contact Us' },
                        styles: { marginBottom: '24px' }
                    },
                    {
                        id: 'form-name',
                        type: 'Input',
                        props: { placeholder: 'Your Name', type: 'text' },
                        styles: { marginBottom: '16px', width: '100%' }
                    },
                    {
                        id: 'form-email',
                        type: 'Input',
                        props: { placeholder: 'Your Email', type: 'email' },
                        styles: { marginBottom: '16px', width: '100%' }
                    },
                    {
                        id: 'form-message',
                        type: 'Textarea',
                        props: { placeholder: 'Your Message', rows: 5 },
                        styles: { marginBottom: '16px', width: '100%' }
                    },
                    {
                        id: 'form-submit',
                        type: 'Button',
                        props: { text: 'Send Message', variant: 'primary' },
                        styles: { width: '100%' }
                    }
                ]
            }
        ]
    },

    // CTA Template
    {
        id: 'cta-centered',
        name: 'Centered CTA',
        category: 'cta',
        description: 'Call-to-action section with heading and button',
        tags: ['cta', 'action', 'centered'],
        components: [
            {
                id: 'cta-container',
                type: 'Container',
                props: {},
                styles: {
                    padding: '64px 32px',
                    textAlign: 'center',
                    backgroundColor: '#3b82f6',
                    color: 'white'
                },
                children: [
                    {
                        id: 'cta-heading',
                        type: 'Heading',
                        props: { level: 2, text: 'Ready to get started?' },
                        styles: { color: 'white', marginBottom: '16px' }
                    },
                    {
                        id: 'cta-text',
                        type: 'Text',
                        props: { text: 'Join thousands of users already using our platform' },
                        styles: { color: 'white', marginBottom: '32px', opacity: 0.9 }
                    },
                    {
                        id: 'cta-button',
                        type: 'Button',
                        props: { text: 'Start Free Trial', variant: 'secondary' },
                        styles: { padding: '12px 32px', backgroundColor: 'white', color: '#3b82f6' }
                    }
                ]
            }
        ]
    }
];

// Get templates by category
export const getTemplatesByCategory = (category: ComponentTemplate['category']) => {
    return componentTemplates.filter(t => t.category === category);
};

// Get all template categories
export const getTemplateCategories = () => {
    return Array.from(new Set(componentTemplates.map(t => t.category)));
};
