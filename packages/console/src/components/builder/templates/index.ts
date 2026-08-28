/**
 * Template Registry and Utilities
 * Main export point for all templates and utility functions
 */

import { ComponentTemplate, generateId } from './types';
import * as SectionTemplates from './sections';
import { frontbaseHomepageTemplate } from './pages/frontbaseHomepageTemplate';

/**
 * Get template by name
 */
export function getSectionTemplate(name: string): ComponentTemplate | null {
    switch (name) {
        case 'Hero': return SectionTemplates.heroTemplate();
        case 'Features': return SectionTemplates.featuresTemplate();
        case 'Pricing': return SectionTemplates.pricingTemplate();
        case 'CTA': return SectionTemplates.ctaTemplate();
        case 'Navbar': return SectionTemplates.navbarTemplate();
        case 'FAQ': return SectionTemplates.faqTemplate();
        case 'LogoCloud': return SectionTemplates.logoCloudTemplate();
        case 'Footer': return SectionTemplates.footerTemplate();
        case 'FrontbaseHomepage': return frontbaseHomepageTemplate();
        default: return null;
    }
}

/**
 * Expand a template into a real component with IDs
 */
export function expandTemplate(template: ComponentTemplate): any {
    const expanded: any = {
        id: generateId(),
        type: template.type,
        props: { ...(template.props || {}) },
        styles: template.styles || {},
        children: []
    };

    if (template.children) {
        expanded.children = template.children.map(child => expandTemplate(child));
    }

    return expanded;
}

// Re-export types
export type { ComponentTemplate } from './types';

// Re-export all section templates
export * from './sections';
