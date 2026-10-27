/**
 * Landing Page Component Definitions
 *
 * Hero, Features, Pricing, CTA, Navbar, Footer, etc.
 */

import type { ComponentDefinition } from '../EditableSchema.js';
import { globalRegistry } from '../ComponentRegistry.js';

let landingRenderers: any = null;

async function loadRendererModules() {
    if (!landingRenderers) {
        landingRenderers = await import('@frontbase/edge-core/ssr/components/landing');
    }
    return landingRenderers;
}

function createLandingRenderer(type: string, rendererFn: (id: string, props: any) => string): (props: Record<string, unknown>) => string {
    return (props: Record<string, unknown>) => {
        const id = `fb-${type.toLowerCase()}-${Date.now().toString(36)}`;
        return rendererFn(id, props);
    };
}

export async function registerLandingComponents(): Promise<void> {
    const lr = await loadRendererModules();
    landingRenderers = lr;

    // Hero
    const heroComponent: ComponentDefinition = {
        type: 'Hero',
        displayName: 'Hero',
        editable: {
            displayName: 'Hero Section',
            category: 'landing',
            icon: 'sparkles',
            description: 'Large hero section with heading, subtext, and CTAs',
            props: [
                { name: 'title', label: 'Title', type: 'text', default: 'Build Faster', group: 'Content' },
                { name: 'subtitle', label: 'Subtitle', type: 'textarea', default: 'The no-code platform for modern teams', group: 'Content' },
                { name: 'primaryCTA', label: 'Primary CTA Text', type: 'text', default: 'Get Started', group: 'Actions' },
                { name: 'primaryCTALink', label: 'Primary CTA Link', type: 'url', default: '#', group: 'Actions' },
            ],
            allowChildren: false,
            exampleProps: { title: 'Build Faster', subtitle: 'The no-code platform' },
            tags: ['hero', 'header', 'landing'],
        },
        eSSRRenderer: createLandingRenderer('Hero', landingRenderers.renderHero),
        defaultProps: { title: 'Build Faster' },
    };

    // Features
    const featuresComponent: ComponentDefinition = {
        type: 'Features',
        displayName: 'Features',
        editable: {
            displayName: 'Features Section',
            category: 'landing',
            icon: 'list',
            description: 'Grid of feature cards',
            props: [
                { name: 'title', label: 'Section Title', type: 'text', default: 'Features', group: 'Content' },
                { name: 'features', label: 'Feature Items', type: 'array', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { title: 'Why Choose Us' },
            tags: ['features', 'grid', 'benefits'],
        },
        eSSRRenderer: createLandingRenderer('Features', landingRenderers.renderFeatures),
        defaultProps: { title: 'Features' },
    };

    // Pricing
    const pricingComponent: ComponentDefinition = {
        type: 'Pricing',
        displayName: 'Pricing',
        editable: {
            displayName: 'Pricing Section',
            category: 'landing',
            icon: 'credit-card',
            description: 'Pricing plans',
            props: [
                { name: 'title', label: 'Section Title', type: 'text', default: 'Pricing', group: 'Content' },
                { name: 'plans', label: 'Plans', type: 'array', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { title: 'Simple Pricing' },
            tags: ['pricing', 'plans', 'cost'],
        },
        eSSRRenderer: createLandingRenderer('Pricing', landingRenderers.renderPricing),
        defaultProps: { title: 'Pricing' },
    };

    // Navbar
    const navbarComponent: ComponentDefinition = {
        type: 'Navbar',
        displayName: 'Navbar',
        editable: {
            displayName: 'Navigation Bar',
            category: 'landing',
            icon: 'menu',
            description: 'Site navigation',
            props: [
                { name: 'logo', label: 'Logo Text', type: 'text', default: 'YourBrand', group: 'Content' },
                { name: 'links', label: 'Navigation Links', type: 'array', group: 'Content' },
                { name: 'CTA', label: 'CTA Button Text', type: 'text', group: 'Actions' },
                { name: 'CTALink', label: 'CTA Link', type: 'url', group: 'Actions' },
                { name: 'logoHeightBase', label: 'Logo Height Base', type: 'text', default: '2rem', group: 'Scale', description: 'Multiplied by the scale factor' },
                { name: 'iconSizeBase', label: 'Icon Size Base', type: 'text', default: '1.5rem', group: 'Scale' },
                { name: 'logoFontSizeBase', label: 'Logo Font Size Base', type: 'text', default: '1.25rem', group: 'Scale' },
                { name: 'logoFontWeight', label: 'Logo Font Weight', type: 'text', default: '700', group: 'Typography' },
                { name: 'menuFontSizeBase', label: 'Menu Font Size Base', type: 'text', default: '0.875rem', group: 'Scale' },
                { name: 'navPaddingBase', label: 'Nav Padding Base', type: 'text', default: '1rem', group: 'Scale' },
                { name: 'navGapBase', label: 'Nav Gap Base', type: 'text', default: '2rem', group: 'Scale' },
                { name: 'menuGapBase', label: 'Menu Gap Base', type: 'text', default: '1.5rem', group: 'Scale' },
                { name: 'buttonGapBase', label: 'Button Gap Base', type: 'text', default: '0.75rem', group: 'Scale' },
            ],
            allowChildren: false,
            exampleProps: { logo: 'YourBrand' },
            tags: ['navigation', 'header', 'menu'],
        },
        eSSRRenderer: createLandingRenderer('Navbar', landingRenderers.renderNavbar),
        defaultProps: { logo: 'YourBrand' },
    };

    // Footer
    const footerComponent: ComponentDefinition = {
        type: 'Footer',
        displayName: 'Footer',
        editable: {
            displayName: 'Footer Section',
            category: 'landing',
            icon: 'align-start-vertical',
            description: 'Site footer with links',
            props: [
                { name: 'columns', label: 'Footer Columns', type: 'array', group: 'Content' },
                { name: 'copyright', label: 'Copyright Text', type: 'text', default: '© {{year}} YourCompany', group: 'Content' },
            ],
            allowChildren: false,
            exampleProps: { copyright: '© {{year}} YourCompany' },
            tags: ['footer', 'copyright', 'links'],
        },
        eSSRRenderer: createLandingRenderer('Footer', landingRenderers.renderFooter),
        defaultProps: { copyright: '© {{year}} YourCompany' },
    };

    // CTA
    const ctaComponent: ComponentDefinition = {
        type: 'CTA',
        displayName: 'CTA',
        editable: {
            displayName: 'Call to Action',
            category: 'landing',
            icon: 'megaphone',
            description: 'Call to action section',
            props: [
                { name: 'title', label: 'Title', type: 'text', default: 'Ready to Get Started?', group: 'Content' },
                { name: 'description', label: 'Description', type: 'textarea', group: 'Content' },
                { name: 'buttonText', label: 'Button Text', type: 'text', default: 'Get Started', group: 'Actions' },
                { name: 'buttonLink', label: 'Button Link', type: 'url', default: '#', group: 'Actions' },
            ],
            allowChildren: false,
            exampleProps: { title: 'Ready to Get Started?' },
            tags: ['cta', 'action', 'conversion'],
        },
        eSSRRenderer: createLandingRenderer('CTA', landingRenderers.renderCTA),
        defaultProps: { title: 'Ready to Get Started?' },
    };

    // LogoCloud
    const logoCloudComponent: ComponentDefinition = {
        type: 'LogoCloud',
        displayName: 'Logo Cloud',
        editable: {
            displayName: 'Logo Cloud',
            category: 'landing',
            icon: 'images',
            description: 'Row or marquee of partner/customer logos',
            props: [
                { name: 'title', label: 'Title', type: 'text', group: 'Content' },
                { name: 'subtitle', label: 'Subtitle', type: 'text', group: 'Content' },
                { name: 'logos', label: 'Logos', type: 'array', group: 'Content',
                    description: 'Array of { type: "image"|"text", value, url?, name?, scale? }' },
                { name: 'displayMode', label: 'Display Mode', type: 'select', default: 'static', group: 'Layout',
                    options: [
                        { value: 'static', label: 'Static Grid' },
                        { value: 'marquee', label: 'Marquee' },
                        { value: 'marqueeOnMobile', label: 'Marquee on Mobile' },
                    ]},
                { name: 'logoSize', label: 'Logo Size', type: 'select', default: 'md', group: 'Size',
                    options: [
                        { value: 'sm', label: 'Small' },
                        { value: 'md', label: 'Medium' },
                        { value: 'lg', label: 'Large' },
                    ]},
                { name: 'speed', label: 'Marquee Speed (s)', type: 'number', default: 20, min: 1, group: 'Layout' },
                { name: 'pauseOnHover', label: 'Pause on Hover', type: 'boolean', default: true, group: 'Behavior' },
                { name: 'grayscale', label: 'Grayscale Logos', type: 'boolean', default: true, group: 'Style' },
            ],
            allowChildren: false,
            exampleProps: { displayMode: 'static', logoSize: 'md' },
            tags: ['logos', 'partners', 'customers', 'marquee', 'brand'],
        },
        eSSRRenderer: createLandingRenderer('LogoCloud', landingRenderers.renderLogoCloud),
        defaultProps: { displayMode: 'static', logoSize: 'md', speed: 20, pauseOnHover: true, grayscale: true },
    };

    // FAQ
    const faqComponent: ComponentDefinition = {
        type: 'FAQ',
        displayName: 'FAQ',
        editable: {
            displayName: 'FAQ Section',
            category: 'landing',
            icon: 'help-circle',
            description: 'Frequently asked questions section',
            props: [
                { name: 'title', label: 'Section Title', type: 'text', default: 'FAQ', group: 'Content' },
                { name: 'items', label: 'Questions', type: 'array', group: 'Content',
                    description: 'Array of { id, title, content }' },
                { name: 'allowMultiple', label: 'Allow Multiple Open', type: 'boolean', default: false, group: 'State' },
            ],
            allowChildren: false,
            exampleProps: { title: 'FAQ', items: [{ id: 'q1', title: 'Question?', content: 'Answer.' }] },
            tags: ['faq', 'questions', 'accordion', 'landing'],
        },
        eSSRRenderer: createLandingRenderer('FAQ', landingRenderers.renderFAQ),
        defaultProps: { title: 'FAQ', items: [] },
    };

    globalRegistry.registerMany([
        heroComponent,
        featuresComponent,
        pricingComponent,
        navbarComponent,
        footerComponent,
        ctaComponent,
        logoCloudComponent,
        faqComponent,
    ]);
}
